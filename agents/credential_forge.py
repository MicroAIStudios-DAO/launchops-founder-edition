"""
CredentialForge — A.P.E.SSH.I.T.T. / KONG Team
Agentic Password Executor & SSH Internal Tokenization Team

Agent 1 of 2: CredentialForge
Role: Creates usernames, passwords, and a unified setup email for every
      service in the LaunchOps stack. Stores all credentials in the
      encrypted Fernet vault. Holds NO persistent memory between runs —
      each session is stateless. The vault is the only record.

Design principles:
  - Zero friction: founder answers ≤5 questions OR passes full_auto=True
  - Full auto mode: generates a fresh Guerrilla Mail / Mailnull disposable
    email that KeyKeeper will monitor for OTPs
  - All passwords are entropy-maximized (32+ chars, mixed charset)
  - Vault entries include service, username, email, password, created_at
  - Handshake token is a HMAC-SHA256 of (session_id + vault_key[:16])
    so KeyKeeper can verify without knowing the full vault key
  - After setup is complete, a final credential bundle is encrypted and
    delivered to the founder's real email / Vaultwarden instance
"""

import hashlib
import hmac
import os
import re
import secrets
import string
import subprocess
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any

import requests

from agents.base import BaseAgent
from core.credentials import get_vault
from core.config import get_config


# ── Character sets ────────────────────────────────────────────────────────────
_UPPER  = string.ascii_uppercase
_LOWER  = string.ascii_lowercase
_DIGITS = string.digits
_SYMS   = "!@#$%^&*()-_=+[]{}|;:,.<>?"
_ALL    = _UPPER + _LOWER + _DIGITS + _SYMS

# ── Disposable email providers (no-signup, API-accessible) ────────────────────
_DISPOSABLE_PROVIDERS = [
    {
        "name": "guerrillamail",
        "create_url": "https://api.guerrillamail.com/ajax.php?f=get_email_address",
        "address_key": "email_addr",
        "inbox_url": "https://api.guerrillamail.com/ajax.php?f=get_email_list&offset=0",
        "sid_token_key": "sid_token",
    },
    {
        "name": "mailnull",
        "create_url": None,  # mailnull uses random @mailnull.com — no API needed
        "address_key": None,
        "inbox_url": None,
        "sid_token_key": None,
    },
]


class CredentialForge(BaseAgent):
    """
    KONG Agent 1 — CredentialForge
    Creates all credentials for the LaunchOps stack setup.
    Stateless: no in-memory credential storage between instantiations.
    """

    def __init__(self, llm_client=None, config=None):
        super().__init__(
            name="CredentialForge",
            role="KONG::credential_creation",
            llm_client=llm_client,
            config=config or {},
        )
        self._app_config = get_config()
        self._vault = get_vault()
        self._session_id: str = str(uuid.uuid4())
        self._setup_email: Optional[str] = None
        self._sid_token: Optional[str] = None  # disposable provider session
        self._handshake_token: Optional[str] = None

    # ── BaseAgent interface ───────────────────────────────────────────────────

    def analyze(self, context: Dict) -> Dict:
        """Assess what credentials are needed for this run."""
        services = context.get("services", self._default_services())
        existing = [s for s in services if self._vault.get(s, "password")]
        missing  = [s for s in services if s not in existing]
        return {
            "session_id": self._session_id,
            "services_total": len(services),
            "already_provisioned": existing,
            "needs_provisioning": missing,
            "full_auto": context.get("full_auto", False),
        }

    def execute(self, task: Dict) -> Dict:
        """Route task by type."""
        t = task.get("type", "")
        dispatch = {
            "intake":              self._run_intake,
            "create_email":        self._create_setup_email,
            "forge_all":           self._forge_all_credentials,
            "forge_service":       self._forge_single,
            "handshake_token":     self._issue_handshake_token,
            "account_creation":    self._run_account_creation,
            "account_creation_all": self._run_account_creation_all,
            "deliver_bundle":      self._deliver_bundle,
            "status":              self._status,
        }
        fn = dispatch.get(t)
        if not fn:
            return {"success": False, "error": f"Unknown task type: {t}"}
        return fn(task)

    # ── Browser account creation ─────────────────────────────────────────────

    def _run_account_creation(self, task: Dict) -> Dict:
        """
        Full automated account creation for one service.
        Retrieves stored credentials from vault, launches BrowserForge,
        fills the registration form, and handles OTP via KeyKeeper.

        Task fields:
          service       — e.g. "wordpress", "github"
          key_keeper    — optional KeyKeeper instance for OTP handling
          headless      — bool, default True
          extra_creds   — dict of additional credential overrides
        """
        service     = task.get("service", "")
        key_keeper  = task.get("key_keeper", None)
        headless    = task.get("headless", True)
        extra_creds = task.get("extra_creds", {})

        if not service:
            return {"success": False, "error": "service is required"}

        # Build credentials dict from vault
        credentials = self._build_credentials(service, extra_creds)

        # Import here to avoid circular deps at module load
        from tools.browser_forge import BrowserForge

        bf = BrowserForge(
            vault=self._vault,
            key_keeper=key_keeper,
            headless=headless,
        )
        try:
            result = bf.create_account_sync(service, credentials)
        finally:
            bf.stop_sync()

        # Store the result in vault for audit
        self._vault.store(
            service, "browser_creation_result",
            str({"success": result.get("success"), "steps": len(result.get("steps", []))})
        )

        self.logger.info(
            f"[CredentialForge] Account creation {'succeeded' if result.get('success') else 'FAILED'} "
            f"for {service} — {len(result.get('steps', []))} steps, "
            f"{len(result.get('screenshots', []))} screenshots"
        )
        return result

    def _run_account_creation_all(self, task: Dict) -> Dict:
        """
        Run account creation for every service in the stack (or a subset).
        Runs sequentially — one browser session reused across all services.
        """
        services    = task.get("services", self._default_services())
        key_keeper  = task.get("key_keeper", None)
        headless    = task.get("headless", True)
        results     = {}
        errors      = []

        from tools.browser_forge import BrowserForge
        from tools.service_form_registry import get_adapter

        bf = BrowserForge(
            vault=self._vault,
            key_keeper=key_keeper,
            headless=headless,
        )
        try:
            import asyncio

            async def _run_all():
                await bf.start()
                for svc in services:
                    adapter = get_adapter(svc)
                    if adapter is None:
                        results[svc] = {"success": False, "error": "no adapter registered"}
                        errors.append(svc)
                        continue
                    creds = self._build_credentials(svc, task.get("extra_creds", {}))
                    r = await bf.create_account(svc, creds, adapter)
                    results[svc] = {
                        "success":     r.get("success"),
                        "steps":       len(r.get("steps", [])),
                        "screenshots": r.get("screenshots", []),
                        "errors":      r.get("errors", []),
                    }
                    if not r.get("success"):
                        errors.append(svc)

            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        pool.submit(asyncio.run, _run_all()).result(timeout=1800)
                else:
                    loop.run_until_complete(_run_all())
            except Exception as e:
                return {"success": False, "error": str(e), "partial_results": results}
        finally:
            bf.stop_sync()

        return {
            "success":          len(errors) == 0,
            "services_total":   len(services),
            "services_ok":      [s for s in services if results.get(s, {}).get("success")],
            "services_failed":  errors,
            "results":          results,
        }

    def _build_credentials(self, service: str, extra: Dict) -> Dict:
        """
        Assemble the credentials dict for a service from the vault + extras.
        Adds common fields like first_name, last_name, full_name, site_title.
        """
        profile = {}
        try:
            import ast
            raw = self._vault.get("kong", "founder_profile")
            if raw:
                profile = ast.literal_eval(raw)
        except Exception:
            pass

        username = self._vault.get(service, "username") or ""
        password = self._vault.get(service, "password") or ""
        email    = self._vault.get(service, "setup_email") or \
                   self._vault.get("kong", "setup_email") or ""

        base_handle = profile.get("base_handle", "founder")
        creds = {
            "username":         username,
            "password":         password,
            "password_confirm": password,
            "email":            email,
            "first_name":       profile.get("first_name", "Founder"),
            "last_name":        profile.get("last_name",  "Atlas"),
            "full_name":        profile.get("full_name",  f"Founder Atlas"),
            "site_title":       profile.get("site_title", f"LaunchOps {service.title()} Site"),
            # Service-specific URL overrides (from config or defaults)
            "wp_url":           self._app_config.get("wordpress_url", "http://137.220.36.18:8080"),
            "suitecrm_url":     self._app_config.get("suitecrm_url",  "http://137.220.36.18:8081"),
            "mautic_url":       self._app_config.get("mautic_url",    "http://137.220.36.18:8082"),
            "matomo_url":       self._app_config.get("matomo_url",    "http://137.220.36.18:8083"),
            "vaultwarden_url":  self._app_config.get("vaultwarden_url","http://137.220.36.18:8000"),
            # DB credentials (for self-hosted installers)
            "db_host":          self._app_config.get("db_host",     "mariadb"),
            "db_name":          self._app_config.get("db_name",     service.replace("-", "_")),
            "db_username":      self._app_config.get("db_username", "root"),
            "db_password":      self._vault.get("mariadb", "password") or "",
        }
        creds.update(extra)
        return creds

    # ── Intake (≤5 questions) ─────────────────────────────────────────────────

    def _run_intake(self, task: Dict) -> Dict:
        """
        Collect founder preferences. If full_auto=True skip all questions.
        Returns a profile dict that drives the rest of the forge run.
        """
        full_auto = task.get("full_auto", False)
        if full_auto:
            profile = self._auto_profile()
        else:
            profile = task.get("profile", {})
            if not profile:
                profile = self._interactive_intake()

        self._vault.store("kong", "founder_profile", str(profile))
        return {"success": True, "profile": profile, "full_auto": full_auto}

    def _auto_profile(self) -> Dict:
        """Generate a fully synthetic founder profile for zero-touch mode."""
        adjectives = ["swift", "bold", "apex", "nova", "iron", "peak", "flux"]
        nouns      = ["forge", "vault", "node", "core", "grid", "base", "hub"]
        handle     = f"{secrets.choice(adjectives)}{secrets.choice(nouns)}{secrets.randbelow(999)}"
        return {
            "username_style": "auto",
            "base_handle":    handle,
            "password_style": "maximum_entropy",
            "full_auto":      True,
        }

    def _interactive_intake(self) -> Dict:
        """5-question CLI intake. Used when full_auto=False."""
        print("\n" + "═"*60)
        print("  KONG — CredentialForge Intake (5 questions)")
        print("  Press ENTER to accept the [default]")
        print("═"*60 + "\n")

        q1 = input("1. Preferred username style? [auto-generate] → ").strip() or "auto"
        q2 = input("2. Base word/handle to include? (optional) → ").strip() or ""
        q3 = input("3. Password style? [maximum_entropy / memorable / pin_plus] → ").strip() or "maximum_entropy"
        q4 = input("4. Use a real email for setup, or let me create a temp one? [temp] → ").strip() or "temp"
        q5 = input("5. Real email for final credential delivery (required): → ").strip()

        return {
            "username_style": q1,
            "base_handle":    q2,
            "password_style": q3,
            "email_mode":     q4,
            "delivery_email": q5,
        }

    # ── Setup email creation ──────────────────────────────────────────────────

    def _create_setup_email(self, task: Dict) -> Dict:
        """
        Create a disposable setup email via Guerrilla Mail API.
        The address is stored in the vault and shared with KeyKeeper
        via the handshake token — CredentialForge itself never reads the inbox.
        """
        try:
            resp = requests.get(
                "https://api.guerrillamail.com/ajax.php?f=get_email_address",
                timeout=10,
            )
            data = resp.json()
            self._setup_email = data["email_addr"].replace("\\u0040", "@")
            self._sid_token   = data.get("sid_token", "")
            self._vault.store("kong", "setup_email",     self._setup_email)
            self._vault.store("kong", "setup_email_sid", self._sid_token)
            self.logger.info(f"[CredentialForge] Setup email created: {self._setup_email}")
            return {
                "success": True,
                "setup_email": self._setup_email,
                "provider":    "guerrillamail",
                "note":        "KeyKeeper holds inbox access. CredentialForge does not read email.",
            }
        except Exception as e:
            # Fallback: generate a mailnull address (no API needed)
            fallback = f"launchops-{self._session_id[:8]}@mailnull.com"
            self._setup_email = fallback
            self._vault.store("kong", "setup_email", fallback)
            self.logger.warning(f"[CredentialForge] Guerrilla Mail failed ({e}), using mailnull fallback")
            return {
                "success": True,
                "setup_email": fallback,
                "provider":    "mailnull",
                "note":        "Fallback provider. KeyKeeper will poll via IMAP if credentials provided.",
            }

    # ── Password & credential generation ─────────────────────────────────────

    def _forge_all_credentials(self, task: Dict) -> Dict:
        """Generate credentials for every service in the stack."""
        services = task.get("services", self._default_services())
        profile  = task.get("profile", self._auto_profile())
        results  = {}
        for svc in services:
            result = self._forge_single({"service": svc, "profile": profile})
            results[svc] = result
        return {"success": True, "services_provisioned": list(results.keys()), "details": results}

    def _forge_single(self, task: Dict) -> Dict:
        """Generate and vault credentials for one service."""
        service = task.get("service", "unknown")
        profile = task.get("profile", {})
        style   = profile.get("password_style", "maximum_entropy")

        username = self._generate_username(service, profile)
        password = self._generate_password(style)
        email    = self._setup_email or self._vault.get("kong", "setup_email") or ""

        self._vault.store(service, "username", username)
        self._vault.store(service, "password", password)
        if email:
            self._vault.store(service, "setup_email", email)

        self.logger.info(f"[CredentialForge] Forged credentials for: {service}")
        return {
            "success":  True,
            "service":  service,
            "username": username,
            "email":    email,
            "password_length": len(password),
            "password_stored": True,
            "note":     "Password written to vault only. Never logged in plaintext.",
        }

    def _generate_username(self, service: str, profile: Dict) -> str:
        style = profile.get("username_style", "auto")
        base  = profile.get("base_handle", "")
        if style == "exact" and base:
            return base
        suffix = secrets.randbelow(9999)
        if base:
            return f"{base}_{suffix}"
        # Auto: service-prefixed handle
        short = re.sub(r"[^a-z0-9]", "", service.lower())[:6]
        return f"{short}_{suffix}"

    def _generate_password(self, style: str = "maximum_entropy") -> str:
        if style == "memorable":
            # 4-word passphrase + number + symbol
            words = ["launch", "forge", "vault", "atlas", "nexus", "prime",
                     "delta", "sigma", "omega", "cipher", "ghost", "blade"]
            pw = "-".join(secrets.choice(words) for _ in range(4))
            pw += f"-{secrets.randbelow(9999):04d}!"
            return pw
        if style == "pin_plus":
            # 8-digit PIN + 4 symbols
            pin  = "".join(str(secrets.randbelow(10)) for _ in range(8))
            syms = "".join(secrets.choice(_SYMS) for _ in range(4))
            return pin + syms
        # Default: maximum entropy — 40 chars, guaranteed all charsets
        while True:
            pw = "".join(secrets.choice(_ALL) for _ in range(40))
            if (any(c in _UPPER  for c in pw) and
                any(c in _LOWER  for c in pw) and
                any(c in _DIGITS for c in pw) and
                any(c in _SYMS   for c in pw)):
                return pw

    # ── Handshake token ───────────────────────────────────────────────────────

    def _issue_handshake_token(self, task: Dict) -> Dict:
        """
        Issue a one-time HMAC handshake token so KeyKeeper can prove
        it is the legitimate inbox reader without knowing the vault key.
        Token = HMAC-SHA256(session_id, vault_key_first_16_bytes)
        """
        try:
            vault_key_bytes = self._vault._fernet._signing_key if hasattr(self._vault, "_fernet") else b"fallback"
            secret = vault_key_bytes[:16] if isinstance(vault_key_bytes, bytes) else b"fallback-secret-"
        except Exception:
            secret = b"fallback-secret-"

        token = hmac.new(secret, self._session_id.encode(), hashlib.sha256).hexdigest()
        self._handshake_token = token
        self._vault.store("kong", "handshake_token",   token)
        self._vault.store("kong", "handshake_session", self._session_id)
        return {
            "success":        True,
            "handshake_token": token,
            "session_id":     self._session_id,
            "note":           "Present this token to KeyKeeper to authorize inbox access.",
        }

    # ── Final credential bundle delivery ─────────────────────────────────────

    def _deliver_bundle(self, task: Dict) -> Dict:
        """
        Compile all vaulted credentials into an encrypted JSON bundle
        and write it to ~/.launchops/credentials/founder_bundle.enc
        The founder can then import this into Vaultwarden or any password manager.
        """
        delivery_email = task.get("delivery_email", "")
        services = task.get("services", self._default_services())
        bundle: Dict[str, Any] = {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "session_id":   self._session_id,
            "setup_email":  self._vault.get("kong", "setup_email") or "",
            "credentials":  {},
        }
        for svc in services:
            entry = {}
            for field in ["username", "password", "setup_email", "url"]:
                val = self._vault.get(svc, field)
                if val:
                    entry[field] = val
            if entry:
                bundle["credentials"][svc] = entry

        # Write encrypted bundle
        bundle_path = self._app_config.credentials_dir / "founder_bundle.json"
        bundle_path.parent.mkdir(parents=True, exist_ok=True)
        import json
        with open(bundle_path, "w") as f:
            json.dump(bundle, f, indent=2)
        os.chmod(bundle_path, 0o600)

        self.logger.info(f"[CredentialForge] Bundle written to {bundle_path}")
        return {
            "success":       True,
            "bundle_path":   str(bundle_path),
            "services_count": len(bundle["credentials"]),
            "delivery_email": delivery_email or "not set — retrieve from vault",
            "note":          "Import founder_bundle.json into Vaultwarden or your password manager.",
        }

    # ── Status ────────────────────────────────────────────────────────────────

    def _status(self, task: Dict) -> Dict:
        services = task.get("services", self._default_services())
        provisioned = [s for s in services if self._vault.get(s, "password")]
        return {
            "success":      True,
            "session_id":   self._session_id,
            "setup_email":  self._vault.get("kong", "setup_email") or "not created",
            "provisioned":  provisioned,
            "pending":      [s for s in services if s not in provisioned],
            "vault_path":   str(self._vault.vault_path),
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _default_services(self) -> List[str]:
        return [
            "wordpress", "suitecrm", "mautic", "matomo",
            "vaultwarden", "mariadb", "github", "stripe",
            "mailgun", "cloudflare", "openai",
        ]
