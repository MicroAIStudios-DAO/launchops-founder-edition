"""
BrowserForge — KONG Team Browser Automation Core
A.P.E.SSH.I.T.T. / LaunchOps Founder Edition

Provides a Playwright-backed automation engine that:
  1. Manages a persistent headless browser session (reused across services)
  2. Intelligently fills account creation forms using field heuristics +
     explicit per-service selectors from the service registry
  3. Handles CAPTCHA detection (pause + notify, never silently fail)
  4. Intercepts 2FA / OTP gates by calling back to KeyKeeper
  5. Takes timestamped screenshots at every major step for audit trail
  6. Reports structured results back to CredentialForge

Architecture:
  BrowserForge (this file)
    └── ServiceFormRegistry (service_form_registry.py)
         └── per-service FormAdapter objects
    └── KeyKeeperBridge (inline) — polls KeyKeeper for OTPs
    └── WebNavigator (tools/web_navigator.py) — base Playwright session

Usage (from CredentialForge):
    from tools.browser_forge import BrowserForge
    bf = BrowserForge(vault=vault, key_keeper=key_keeper_instance)
    result = await bf.create_account("wordpress", credentials)
"""

import asyncio
import json
import os
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
    TimeoutError as PlaywrightTimeout,
)


# ── Constants ─────────────────────────────────────────────────────────────────
SCREENSHOT_DIR = Path(os.environ.get("HOME", "/root")) / ".launchops" / "screenshots"
AUDIT_LOG_PATH = Path(os.environ.get("HOME", "/root")) / ".launchops" / "browser_audit.jsonl"
DEFAULT_TIMEOUT = 30_000   # 30 s
OTP_POLL_TIMEOUT = 120     # 2 min to wait for OTP email
OTP_POLL_INTERVAL = 5      # check every 5 s

# ── Field heuristic patterns ──────────────────────────────────────────────────
# Maps semantic field names → list of CSS/XPath selectors to try in order
FIELD_HEURISTICS: Dict[str, List[str]] = {
    "email": [
        "input[type=email]",
        "input[name*=email i]",
        "input[id*=email i]",
        "input[placeholder*=email i]",
        "input[autocomplete=email]",
    ],
    "username": [
        "input[name=username]",
        "input[id=username]",
        "input[name=user_login]",
        "input[autocomplete=username]",
        "input[name*=user i]:not([type=email]):not([type=password])",
        "input[id*=user i]:not([type=email]):not([type=password])",
    ],
    "password": [
        "input[type=password][name*=pass i]:not([name*=confirm i]):not([name*=repeat i])",
        "input[type=password][id*=pass i]:not([id*=confirm i]):not([id*=repeat i])",
        "input[type=password][autocomplete=new-password]",
        "input[type=password]",
    ],
    "password_confirm": [
        "input[type=password][name*=confirm i]",
        "input[type=password][name*=repeat i]",
        "input[type=password][id*=confirm i]",
        "input[type=password][autocomplete=new-password] ~ input[type=password]",
        "(//input[@type='password'])[2]",
    ],
    "first_name": [
        "input[name*=first i][name*=name i]",
        "input[id*=first i][id*=name i]",
        "input[autocomplete=given-name]",
        "input[name=fname]",
    ],
    "last_name": [
        "input[name*=last i][name*=name i]",
        "input[id*=last i][id*=name i]",
        "input[autocomplete=family-name]",
        "input[name=lname]",
    ],
    "full_name": [
        "input[autocomplete=name]",
        "input[name=name]",
        "input[id=name]",
        "input[placeholder*='full name' i]",
    ],
    "site_title": [
        "input[name=weblog_title]",
        "input[id=weblog_title]",
        "input[name=blogname]",
        "input[id=blogname]",
        "input[name*=title i][name*=site i]",
    ],
    "otp": [
        "input[name*=otp i]",
        "input[name*=code i]",
        "input[name*=token i]",
        "input[name*=verify i]",
        "input[id*=otp i]",
        "input[id*=code i]",
        "input[autocomplete=one-time-code]",
        "input[inputmode=numeric][maxlength='6']",
        "input[inputmode=numeric][maxlength='8']",
    ],
    "submit": [
        "button[type=submit]",
        "input[type=submit]",
        "button:has-text('Create')",
        "button:has-text('Register')",
        "button:has-text('Sign up')",
        "button:has-text('Install')",
        "button:has-text('Continue')",
        "button:has-text('Next')",
        "[role=button]:has-text('Submit')",
    ],
}


class BrowserForge:
    """
    Core browser automation engine for the KONG team.
    Manages a single Playwright browser session across all service registrations.
    """

    def __init__(
        self,
        vault=None,
        key_keeper=None,
        headless: bool = True,
        slow_mo: int = 120,
    ):
        self._vault = vault
        self._key_keeper = key_keeper
        self._headless = headless
        self._slow_mo = slow_mo

        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None

        SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
        AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

        self._audit_entries: List[Dict] = []

    # ── Session lifecycle ─────────────────────────────────────────────────────

    async def start(self) -> None:
        """Launch the browser. Reuse if already running."""
        if self._browser and self._browser.is_connected():
            return
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=self._headless,
            slow_mo=self._slow_mo,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ],
        )
        self._context = await self._browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            timezone_id="America/Los_Angeles",
        )
        self._page = await self._context.new_page()
        # Stealth: hide navigator.webdriver
        await self._page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

    async def stop(self) -> None:
        """Close browser and cleanup."""
        try:
            if self._browser:
                await self._browser.close()
            if self._playwright:
                await self._playwright.stop()
        except Exception:
            pass
        self._browser = None
        self._playwright = None
        self._page = None

    # ── Main entry point ──────────────────────────────────────────────────────

    async def create_account(
        self,
        service_id: str,
        credentials: Dict[str, str],
        adapter: Optional["FormAdapter"] = None,
    ) -> Dict[str, Any]:
        """
        Full account creation flow for one service.

        Args:
            service_id:   e.g. "wordpress", "github", "stripe"
            credentials:  dict with keys: username, email, password, etc.
            adapter:      optional FormAdapter override; if None, uses registry

        Returns:
            result dict with success, screenshots, steps, errors
        """
        await self.start()
        result: Dict[str, Any] = {
            "service":    service_id,
            "success":    False,
            "steps":      [],
            "screenshots": [],
            "errors":     [],
            "timestamp":  datetime.utcnow().isoformat() + "Z",
        }

        if adapter is None:
            from tools.service_form_registry import get_adapter
            adapter = get_adapter(service_id)

        if adapter is None:
            result["errors"].append(f"No form adapter registered for service: {service_id}")
            self._audit(service_id, "no_adapter", result)
            return result

        try:
            # Step 1: Navigate to registration URL
            reg_url = adapter.registration_url(credentials)
            await self._navigate(reg_url, result)

            # Step 2: Execute adapter-defined steps
            for step in adapter.steps():
                step_result = await self._execute_step(step, credentials, result)
                result["steps"].append(step_result)
                if not step_result.get("success") and step.get("required", True):
                    result["errors"].append(f"Required step failed: {step.get('name', '?')}")
                    await self._screenshot(service_id, "step_failure", result)
                    self._audit(service_id, "step_failure", result)
                    return result

            # Step 3: Final success screenshot
            await self._screenshot(service_id, "completed", result)
            result["success"] = True
            self._audit(service_id, "completed", result)

        except PlaywrightTimeout as e:
            result["errors"].append(f"Timeout: {e}")
            await self._screenshot(service_id, "timeout", result)
            self._audit(service_id, "timeout", result)
        except Exception as e:
            result["errors"].append(f"Unexpected error: {e}")
            await self._screenshot(service_id, "error", result)
            self._audit(service_id, "error", result)

        return result

    # ── Step executor ─────────────────────────────────────────────────────────

    async def _execute_step(
        self,
        step: Dict,
        credentials: Dict[str, str],
        result: Dict,
    ) -> Dict[str, Any]:
        """
        Execute a single form step. Step types:
          fill_field   — fill one field by semantic name or explicit selector
          fill_form    — fill multiple fields at once
          click        — click a selector
          wait         — wait for selector to appear
          wait_nav     — wait for navigation
          screenshot   — take a named screenshot
          otp_gate     — pause and call KeyKeeper for OTP
          captcha_gate — pause and notify owner; wait for manual solve
          select       — choose a <select> option
          check        — check a checkbox
          evaluate     — run JS on the page
          conditional  — run sub-steps only if selector is present
        """
        stype = step.get("type", "")
        name  = step.get("name", stype)
        sr: Dict[str, Any] = {"name": name, "type": stype, "success": False}

        try:
            if stype == "fill_field":
                sr["success"] = await self._fill_field(
                    step["field"], credentials.get(step["field"], step.get("value", "")),
                    step.get("selector")
                )

            elif stype == "fill_form":
                fields = step.get("fields", {})
                filled = {}
                for field, sel_override in fields.items():
                    value = credentials.get(field, "")
                    ok = await self._fill_field(field, value, sel_override or None)
                    filled[field] = ok
                sr["success"] = all(filled.values())
                sr["fields"] = filled

            elif stype == "click":
                sel = step.get("selector", "")
                await self._page.click(sel, timeout=DEFAULT_TIMEOUT)
                sr["success"] = True

            elif stype == "wait":
                sel = step.get("selector", "")
                await self._page.wait_for_selector(sel, timeout=DEFAULT_TIMEOUT)
                sr["success"] = True

            elif stype == "wait_nav":
                await self._page.wait_for_load_state("networkidle", timeout=DEFAULT_TIMEOUT)
                sr["success"] = True

            elif stype == "screenshot":
                svc = result.get("service", "unknown")
                path = await self._screenshot(svc, step.get("label", name), result)
                sr["success"] = bool(path)
                sr["path"] = path

            elif stype == "otp_gate":
                otp = await self._wait_for_otp(step.get("otp_type", "email_code"))
                if otp:
                    ok = await self._fill_field("otp", otp, step.get("selector"))
                    if ok:
                        await self._page.keyboard.press("Enter")
                    sr["success"] = ok
                    sr["otp_received"] = True
                else:
                    sr["success"] = False
                    sr["error"] = "OTP timeout — KeyKeeper did not return a code in time"

            elif stype == "captcha_gate":
                # Cannot auto-solve; notify owner and wait up to 5 minutes
                sr["success"] = await self._handle_captcha(result.get("service", "?"))

            elif stype == "select":
                sel   = step.get("selector", "")
                value = step.get("value", credentials.get(step.get("field", ""), ""))
                await self._page.select_option(sel, value=value, timeout=DEFAULT_TIMEOUT)
                sr["success"] = True

            elif stype == "check":
                sel = step.get("selector", "")
                chk = await self._page.query_selector(sel)
                if chk:
                    checked = await chk.is_checked()
                    if not checked:
                        await chk.check()
                sr["success"] = True

            elif stype == "evaluate":
                script = step.get("script", "")
                await self._page.evaluate(script)
                sr["success"] = True

            elif stype == "conditional":
                probe = step.get("probe_selector", "")
                el = await self._page.query_selector(probe)
                if el:
                    for sub in step.get("steps", []):
                        sub_r = await self._execute_step(sub, credentials, result)
                        result["steps"].append(sub_r)
                sr["success"] = True

            else:
                sr["success"] = False
                sr["error"] = f"Unknown step type: {stype}"

        except PlaywrightTimeout as e:
            sr["error"] = f"Timeout on step '{name}': {e}"
        except Exception as e:
            sr["error"] = f"Error on step '{name}': {e}"

        return sr

    # ── Field filling with heuristics ─────────────────────────────────────────

    async def _fill_field(
        self,
        field_name: str,
        value: str,
        selector_override: Optional[str] = None,
    ) -> bool:
        """
        Fill a single form field. Tries explicit selector first,
        then falls back to heuristic selector list for the field_name.
        """
        if not value:
            return True  # nothing to fill — skip silently

        selectors = []
        if selector_override:
            selectors.append(selector_override)
        selectors.extend(FIELD_HEURISTICS.get(field_name, []))

        for sel in selectors:
            try:
                # XPath selectors start with //
                if sel.startswith("//") or sel.startswith("(//"):
                    el = await self._page.query_selector(f"xpath={sel}")
                else:
                    el = await self._page.query_selector(sel)
                if el and await el.is_visible():
                    await el.triple_click()  # clear existing value
                    await el.fill(value)
                    return True
            except Exception:
                continue
        return False

    # ── OTP handling ──────────────────────────────────────────────────────────

    async def _wait_for_otp(self, otp_type: str = "email_code") -> Optional[str]:
        """
        Poll KeyKeeper for an OTP/verification code.
        Returns the code string or None on timeout.
        """
        if not self._key_keeper:
            return None

        deadline = time.time() + OTP_POLL_TIMEOUT
        while time.time() < deadline:
            try:
                result = self._key_keeper.execute({
                    "type":     "fetch_otp",
                    "otp_type": otp_type,
                })
                if result.get("success") and result.get("otp"):
                    return result["otp"]
            except Exception:
                pass
            await asyncio.sleep(OTP_POLL_INTERVAL)
        return None

    # ── CAPTCHA handling ──────────────────────────────────────────────────────

    async def _handle_captcha(self, service: str) -> bool:
        """
        Detect CAPTCHA and pause for manual solve.
        Notifies owner via vault-stored notification channel.
        Waits up to 5 minutes for the CAPTCHA to be solved.
        """
        # Try to detect common CAPTCHA indicators
        captcha_selectors = [
            "iframe[src*='recaptcha']",
            "iframe[src*='hcaptcha']",
            ".g-recaptcha",
            ".h-captcha",
            "[data-sitekey]",
        ]
        detected = False
        for sel in captcha_selectors:
            el = await self._page.query_selector(sel)
            if el:
                detected = True
                break

        if not detected:
            return True  # no CAPTCHA found, continue

        # Take screenshot so owner can see what needs solving
        await self._screenshot(service, "captcha_detected", {})

        # Notify via vault if notification channel is configured
        try:
            from core.credentials import get_vault
            v = get_vault()
            notif_url = v.get("system", "notification_webhook")
            if notif_url:
                import requests
                requests.post(notif_url, json={
                    "title":   f"CAPTCHA detected — {service}",
                    "message": "BrowserForge paused. Please solve the CAPTCHA and press Continue.",
                    "service": service,
                }, timeout=5)
        except Exception:
            pass

        # Wait up to 5 minutes for CAPTCHA to be solved (page navigates away)
        try:
            await self._page.wait_for_navigation(timeout=300_000)
            return True
        except PlaywrightTimeout:
            return False

    # ── Navigation helper ─────────────────────────────────────────────────────

    async def _navigate(self, url: str, result: Dict) -> None:
        """Navigate to URL and take a screenshot."""
        resp = await self._page.goto(url, wait_until="domcontentloaded", timeout=DEFAULT_TIMEOUT)
        result["steps"].append({
            "name":    "navigate",
            "type":    "navigate",
            "url":     url,
            "status":  resp.status if resp else None,
            "success": True,
        })
        await self._screenshot(result.get("service", "unknown"), "loaded", result)

    # ── Screenshot helper ─────────────────────────────────────────────────────

    async def _screenshot(self, service: str, label: str, result: Dict) -> str:
        """Take a full-page screenshot and record path in result."""
        ts   = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        name = f"{service}_{label}_{ts}.png"
        path = str(SCREENSHOT_DIR / name)
        try:
            await self._page.screenshot(path=path, full_page=True)
            if isinstance(result, dict):
                result.setdefault("screenshots", []).append(path)
        except Exception:
            pass
        return path

    # ── Audit log ─────────────────────────────────────────────────────────────

    def _audit(self, service: str, event: str, data: Dict) -> None:
        """Append a structured audit entry to the JSONL audit log."""
        entry = {
            "ts":      datetime.utcnow().isoformat() + "Z",
            "service": service,
            "event":   event,
            "success": data.get("success", False),
            "steps":   len(data.get("steps", [])),
            "errors":  data.get("errors", []),
            "screenshots": data.get("screenshots", []),
        }
        self._audit_entries.append(entry)
        try:
            with open(AUDIT_LOG_PATH, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception:
            pass

    # ── Sync wrapper ──────────────────────────────────────────────────────────

    def create_account_sync(
        self,
        service_id: str,
        credentials: Dict[str, str],
        adapter=None,
    ) -> Dict[str, Any]:
        """Synchronous wrapper for use from non-async code (e.g., CredentialForge.execute)."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(
                        asyncio.run,
                        self.create_account(service_id, credentials, adapter),
                    )
                    return future.result(timeout=600)
            return loop.run_until_complete(
                self.create_account(service_id, credentials, adapter)
            )
        except Exception as e:
            return {
                "service": service_id,
                "success": False,
                "errors":  [str(e)],
                "steps":   [],
                "screenshots": [],
            }

    def stop_sync(self) -> None:
        """Synchronous stop."""
        try:
            asyncio.run(self.stop())
        except Exception:
            pass


# ── FormAdapter base class ────────────────────────────────────────────────────

class FormAdapter:
    """
    Base class for service-specific form adapters.
    Subclass this in service_form_registry.py for each service.
    """

    service_id: str = "base"

    def registration_url(self, credentials: Dict[str, str]) -> str:
        """Return the URL of the account creation / setup page."""
        raise NotImplementedError

    def steps(self) -> List[Dict]:
        """
        Return an ordered list of step dicts.
        Each step has at minimum: {"type": ..., "name": ...}
        See _execute_step() for all supported types and fields.
        """
        raise NotImplementedError
