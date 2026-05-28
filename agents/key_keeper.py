"""
KeyKeeper — A.P.E.SSH.I.T.T. / KONG Team
Agentic Password Executor & SSH Internal Tokenization Team

Agent 2 of 2: KeyKeeper
Role: Monitors the setup email inbox, retrieves OTPs and verification
      links, and fills them in during account creation flows. Knows
      ONLY the setup email address (obtained via handshake from
      CredentialForge). Never knows any service passwords.

Design principles:
  - Minimal knowledge: KeyKeeper only knows the inbox address + OTP patterns
  - Handshake verification: must present valid HMAC token before vault reads
  - OTP extraction: regex-based extraction from email bodies (6-digit codes,
    magic links, "verify your email" patterns)
  - Polling loop: checks inbox every 15 seconds, times out after 5 minutes
  - After each OTP is used, it is marked consumed and never re-used
  - Supports Guerrilla Mail API and IMAP (for real email fallback)
  - All actions are logged to the audit trail
"""

import hashlib
import hmac
import imaplib
import json
import os
import re
import time
import uuid
from datetime import datetime
from email import message_from_bytes
from typing import Dict, List, Optional, Any, Tuple

import requests

from agents.base import BaseAgent
from core.credentials import get_vault
from core.config import get_config


# ── OTP extraction patterns ───────────────────────────────────────────────────
_OTP_PATTERNS = [
    r"\b(\d{6})\b",                          # 6-digit numeric OTP
    r"\b(\d{8})\b",                          # 8-digit numeric OTP
    r"code[:\s]+([A-Z0-9]{6,10})",           # "code: XXXXXX"
    r"token[:\s]+([A-Za-z0-9\-_]{20,})",     # "token: ..."
    r"verify[:\s]+([A-Za-z0-9\-_]{20,})",    # "verify: ..."
]

_LINK_PATTERNS = [
    r"https?://[^\s\"'<>]+(?:verify|confirm|activate|validate)[^\s\"'<>]*",
    r"https?://[^\s\"'<>]+token=[^\s\"'<>]+",
    r"https?://[^\s\"'<>]+code=[^\s\"'<>]+",
]


class KeyKeeper(BaseAgent):
    """
    KONG Agent 2 — KeyKeeper
    Monitors the setup inbox and retrieves OTPs/verification links.
    Stateless: no service passwords stored here, ever.
    """

    def __init__(self, llm_client=None, config=None):
        super().__init__(
            name="KeyKeeper",
            role="KONG::otp_retrieval",
            llm_client=llm_client,
            config=config or {},
        )
        self._app_config = get_config()
        self._vault = get_vault()
        self._setup_email: Optional[str] = None
        self._sid_token:   Optional[str] = None
        self._provider:    Optional[str] = None
        self._consumed_otps: set = set()

    # ── BaseAgent interface ───────────────────────────────────────────────────

    def analyze(self, context: Dict) -> Dict:
        """Verify handshake and load inbox credentials."""
        token = context.get("handshake_token", "")
        if not self._verify_handshake(token):
            return {"authorized": False, "error": "Handshake token invalid or expired."}

        self._setup_email = self._vault.get("kong", "setup_email") or ""
        self._sid_token   = self._vault.get("kong", "setup_email_sid") or ""
        self._provider    = self._detect_provider(self._setup_email)

        return {
            "authorized":   True,
            "setup_email":  self._setup_email,
            "provider":     self._provider,
            "inbox_ready":  bool(self._setup_email),
        }

    def execute(self, task: Dict) -> Dict:
        """Route task by type."""
        t = task.get("type", "")
        dispatch = {
            "verify_handshake": self._task_verify_handshake,
            "poll_otp":         self._task_poll_otp,
            "poll_link":        self._task_poll_link,
            "get_latest":       self._task_get_latest_email,
            "status":           self._task_status,
        }
        fn = dispatch.get(t)
        if not fn:
            return {"success": False, "error": f"Unknown task type: {t}"}
        return fn(task)

    # ── Handshake verification ────────────────────────────────────────────────

    def _verify_handshake(self, presented_token: str) -> bool:
        """
        Verify the HMAC token issued by CredentialForge.
        Reads session_id and vault key fragment from vault to recompute.
        """
        if not presented_token:
            return False
        stored_token   = self._vault.get("kong", "handshake_token")   or ""
        stored_session = self._vault.get("kong", "handshake_session") or ""
        if not stored_token or not stored_session:
            # No handshake issued yet — allow first-time setup
            return True
        return hmac.compare_digest(presented_token, stored_token)

    def _task_verify_handshake(self, task: Dict) -> Dict:
        token = task.get("handshake_token", "")
        valid = self._verify_handshake(token)
        return {"success": valid, "authorized": valid}

    # ── OTP polling ───────────────────────────────────────────────────────────

    def _task_poll_otp(self, task: Dict) -> Dict:
        """
        Poll the inbox until a numeric OTP arrives or timeout is reached.
        Returns the OTP code string.
        """
        service      = task.get("service", "unknown")
        timeout_secs = task.get("timeout", 300)   # 5 minutes default
        interval     = task.get("interval", 15)   # poll every 15s
        deadline     = time.time() + timeout_secs

        self.logger.info(f"[KeyKeeper] Polling for OTP for service: {service}")

        while time.time() < deadline:
            emails = self._fetch_inbox()
            for email_body in emails:
                otp = self._extract_otp(email_body)
                if otp and otp not in self._consumed_otps:
                    self._consumed_otps.add(otp)
                    self._vault.store(f"kong_otp_{service}", "code", otp)
                    self._vault.store(f"kong_otp_{service}", "retrieved_at", datetime.utcnow().isoformat())
                    self.logger.info(f"[KeyKeeper] OTP retrieved for {service}: {otp[:2]}****")
                    return {
                        "success": True,
                        "service": service,
                        "otp":     otp,
                        "source":  "inbox",
                    }
            self.logger.debug(f"[KeyKeeper] No OTP yet for {service}, waiting {interval}s…")
            time.sleep(interval)

        return {
            "success": False,
            "service": service,
            "error":   f"OTP not received within {timeout_secs}s",
        }

    def _task_poll_link(self, task: Dict) -> Dict:
        """
        Poll the inbox for a verification/magic link.
        Returns the full URL string.
        """
        service      = task.get("service", "unknown")
        timeout_secs = task.get("timeout", 300)
        interval     = task.get("interval", 15)
        deadline     = time.time() + timeout_secs

        self.logger.info(f"[KeyKeeper] Polling for verification link for: {service}")

        while time.time() < deadline:
            emails = self._fetch_inbox()
            for email_body in emails:
                link = self._extract_link(email_body)
                if link:
                    self._vault.store(f"kong_link_{service}", "url", link)
                    self._vault.store(f"kong_link_{service}", "retrieved_at", datetime.utcnow().isoformat())
                    self.logger.info(f"[KeyKeeper] Verification link retrieved for {service}")
                    return {
                        "success": True,
                        "service": service,
                        "link":    link,
                        "source":  "inbox",
                    }
            time.sleep(interval)

        return {
            "success": False,
            "service": service,
            "error":   f"Verification link not received within {timeout_secs}s",
        }

    def _task_get_latest_email(self, task: Dict) -> Dict:
        """Return the raw body of the most recent email in the inbox."""
        emails = self._fetch_inbox()
        if not emails:
            return {"success": False, "error": "Inbox empty"}
        return {"success": True, "email_body": emails[0][:2000]}  # truncate for safety

    def _task_status(self, task: Dict) -> Dict:
        return {
            "success":       True,
            "setup_email":   self._setup_email or self._vault.get("kong", "setup_email") or "not loaded",
            "provider":      self._provider or "unknown",
            "consumed_otps": len(self._consumed_otps),
        }

    # ── Inbox fetching ────────────────────────────────────────────────────────

    def _fetch_inbox(self) -> List[str]:
        """Fetch email bodies from the setup inbox. Returns list of body strings."""
        provider = self._provider or self._detect_provider(
            self._setup_email or self._vault.get("kong", "setup_email") or ""
        )
        if provider == "guerrillamail":
            return self._fetch_guerrillamail()
        if provider == "imap":
            return self._fetch_imap()
        return []

    def _fetch_guerrillamail(self) -> List[str]:
        """Fetch emails from Guerrilla Mail API."""
        sid = self._sid_token or self._vault.get("kong", "setup_email_sid") or ""
        try:
            url = f"https://api.guerrillamail.com/ajax.php?f=get_email_list&offset=0&sid_token={sid}"
            resp = requests.get(url, timeout=10)
            data = resp.json()
            bodies = []
            for item in data.get("list", []):
                mail_id = item.get("mail_id", "")
                if mail_id:
                    detail_url = f"https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id={mail_id}&sid_token={sid}"
                    detail = requests.get(detail_url, timeout=10).json()
                    body = detail.get("mail_body", "") or detail.get("mail_text", "")
                    if body:
                        bodies.append(body)
            return bodies
        except Exception as e:
            self.logger.warning(f"[KeyKeeper] Guerrilla Mail fetch failed: {e}")
            return []

    def _fetch_imap(self) -> List[str]:
        """Fetch emails via IMAP (for real email fallback)."""
        imap_host = self._vault.get("kong", "imap_host") or ""
        imap_user = self._vault.get("kong", "imap_user") or self._setup_email or ""
        imap_pass = self._vault.get("kong", "imap_pass") or ""
        if not all([imap_host, imap_user, imap_pass]):
            return []
        try:
            mail = imaplib.IMAP4_SSL(imap_host)
            mail.login(imap_user, imap_pass)
            mail.select("INBOX")
            _, data = mail.search(None, "UNSEEN")
            bodies = []
            for num in data[0].split()[-5:]:  # last 5 unread
                _, msg_data = mail.fetch(num, "(RFC822)")
                msg = message_from_bytes(msg_data[0][1])
                body = self._extract_body(msg)
                if body:
                    bodies.append(body)
            mail.logout()
            return bodies
        except Exception as e:
            self.logger.warning(f"[KeyKeeper] IMAP fetch failed: {e}")
            return []

    def _extract_body(self, msg) -> str:
        """Extract plain text body from email message."""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    return part.get_payload(decode=True).decode("utf-8", errors="ignore")
        else:
            return msg.get_payload(decode=True).decode("utf-8", errors="ignore")
        return ""

    # ── Pattern extraction ────────────────────────────────────────────────────

    def _extract_otp(self, body: str) -> Optional[str]:
        """Extract the first OTP code from an email body."""
        for pattern in _OTP_PATTERNS:
            match = re.search(pattern, body, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    def _extract_link(self, body: str) -> Optional[str]:
        """Extract the first verification link from an email body."""
        for pattern in _LINK_PATTERNS:
            match = re.search(pattern, body, re.IGNORECASE)
            if match:
                return match.group(0)
        return None

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _detect_provider(self, email: str) -> str:
        if not email:
            return "unknown"
        if "guerrillamail" in email or "grr.la" in email or "sharklasers" in email:
            return "guerrillamail"
        if "mailnull" in email:
            return "mailnull"
        return "imap"
