"""
ServiceFormRegistry — KONG Team / BrowserForge
A.P.E.SSH.I.T.T. / LaunchOps Founder Edition

Registers a FormAdapter for every service in the LaunchOps stack.
Each adapter defines:
  - registration_url()  — where to navigate for account creation
  - steps()             — ordered list of BrowserForge step dicts

Services covered:
  wordpress     — WordPress 5-minute install (self-hosted)
  suitecrm      — SuiteCRM first-run installer
  mautic        — Mautic installation wizard
  matomo        — Matomo installation wizard
  vaultwarden   — Vaultwarden admin token + first user creation
  github        — GitHub.com account signup
  stripe        — Stripe.com account signup
  mailgun       — Mailgun.com account signup
  cloudflare    — Cloudflare.com account signup
  openai        — OpenAI platform account signup

Usage:
    from tools.service_form_registry import get_adapter
    adapter = get_adapter("wordpress")
    result = await browser_forge.create_account("wordpress", credentials, adapter)
"""

from typing import Dict, List, Optional
from tools.browser_forge import FormAdapter


# ── Registry ──────────────────────────────────────────────────────────────────

_REGISTRY: Dict[str, "FormAdapter"] = {}


def register(adapter_cls):
    """Decorator to register a FormAdapter subclass."""
    instance = adapter_cls()
    _REGISTRY[instance.service_id] = instance
    return adapter_cls


def get_adapter(service_id: str) -> Optional[FormAdapter]:
    """Return the registered adapter for a service, or None."""
    return _REGISTRY.get(service_id.lower())


def list_services() -> List[str]:
    """Return all registered service IDs."""
    return list(_REGISTRY.keys())


# ── WordPress (self-hosted, 5-minute install) ─────────────────────────────────

@register
class WordPressAdapter(FormAdapter):
    """
    WordPress self-hosted installation wizard.
    URL pattern: http://<host>/wp-admin/install.php
    The host is read from credentials["wp_url"] or defaults to
    the Vultr IP from the stack config.
    """
    service_id = "wordpress"

    def registration_url(self, credentials: Dict) -> str:
        base = credentials.get("wp_url", "http://137.220.36.18:8080")
        return f"{base.rstrip('/')}/wp-admin/install.php"

    def steps(self) -> List[Dict]:
        return [
            # Language selection page — just click Continue
            {
                "name": "select_language",
                "type": "conditional",
                "probe_selector": "#language",
                "steps": [
                    {"name": "click_continue", "type": "click",
                     "selector": "#language-continue"},
                    {"name": "wait_nav", "type": "wait_nav"},
                ],
            },
            # Wait for the setup form
            {
                "name": "wait_for_form",
                "type": "wait",
                "selector": "#weblog_title",
            },
            # Fill the installation form
            {
                "name": "fill_install_form",
                "type": "fill_form",
                "fields": {
                    "site_title": "#weblog_title",
                    "username":   "#user_login",
                    "password":   "#pass1",
                    "email":      "#admin_email",
                },
            },
            # Uncheck "Search engine visibility" discourage checkbox
            {
                "name": "uncheck_search_discourage",
                "type": "conditional",
                "probe_selector": "#blog_public",
                "steps": [
                    {"name": "check_public", "type": "check",
                     "selector": "#blog_public"},
                ],
            },
            # Screenshot before submit
            {
                "name": "screenshot_before_submit",
                "type": "screenshot",
                "label": "before_submit",
            },
            # Submit
            {
                "name": "submit",
                "type": "click",
                "selector": "#submit",
            },
            {
                "name": "wait_success",
                "type": "wait",
                "selector": ".wp-core-ui, .install-success, h1",
            },
        ]


# ── SuiteCRM (self-hosted installer) ─────────────────────────────────────────

@register
class SuiteCRMAdapter(FormAdapter):
    """
    SuiteCRM web installer — multi-step wizard.
    URL: http://<host>/index.php?module=Administration&action=InstallWizard
    """
    service_id = "suitecrm"

    def registration_url(self, credentials: Dict) -> str:
        base = credentials.get("suitecrm_url", "http://137.220.36.18:8081")
        return f"{base.rstrip('/')}/index.php?module=Administration&action=InstallWizard"

    def steps(self) -> List[Dict]:
        return [
            # Accept license
            {
                "name": "wait_license",
                "type": "wait",
                "selector": "#accept_terms, .wizard-step, body",
            },
            {
                "name": "screenshot_license",
                "type": "screenshot",
                "label": "license_page",
            },
            {
                "name": "accept_license",
                "type": "conditional",
                "probe_selector": "#accept_terms",
                "steps": [
                    {"name": "check_accept", "type": "check", "selector": "#accept_terms"},
                    {"name": "click_next", "type": "click", "selector": "input[name=button_next], .btn-next"},
                    {"name": "wait_nav", "type": "wait_nav"},
                ],
            },
            # DB config step — skip if pre-configured via env
            {
                "name": "db_config",
                "type": "conditional",
                "probe_selector": "#db_host_name",
                "steps": [
                    {"name": "fill_db_host",   "type": "fill_field", "field": "db_host",     "selector": "#db_host_name"},
                    {"name": "fill_db_name",   "type": "fill_field", "field": "db_name",     "selector": "#db_database_name"},
                    {"name": "fill_db_user",   "type": "fill_field", "field": "db_username", "selector": "#db_user_name"},
                    {"name": "fill_db_pass",   "type": "fill_field", "field": "db_password", "selector": "#db_password"},
                    {"name": "click_next_db",  "type": "click",      "selector": "input[name=button_next], .btn-next"},
                    {"name": "wait_nav_db",    "type": "wait_nav"},
                ],
            },
            # Admin user creation
            {
                "name": "wait_admin_form",
                "type": "wait",
                "selector": "#user_name, input[name=user_name]",
            },
            {
                "name": "fill_admin",
                "type": "fill_form",
                "fields": {
                    "username":         "input[name=user_name]",
                    "password":         "input[name=user_password]",
                    "password_confirm": "input[name=user_password2]",
                    "email":            "input[name=email1]",
                },
            },
            {
                "name": "screenshot_admin",
                "type": "screenshot",
                "label": "admin_form",
            },
            {
                "name": "submit_admin",
                "type": "click",
                "selector": "input[name=button_next], input[type=submit]",
            },
            {
                "name": "wait_complete",
                "type": "wait",
                "selector": ".install-success, .success-message, #success",
            },
        ]


# ── Mautic (self-hosted installer) ────────────────────────────────────────────

@register
class MauticAdapter(FormAdapter):
    """
    Mautic installation wizard.
    URL: http://<host>/installer
    """
    service_id = "mautic"

    def registration_url(self, credentials: Dict) -> str:
        base = credentials.get("mautic_url", "http://137.220.36.18:8082")
        return f"{base.rstrip('/')}/installer"

    def steps(self) -> List[Dict]:
        return [
            {
                "name": "wait_installer",
                "type": "wait",
                "selector": ".installer-step, form, body",
            },
            {
                "name": "screenshot_start",
                "type": "screenshot",
                "label": "installer_start",
            },
            # DB step
            {
                "name": "db_step",
                "type": "conditional",
                "probe_selector": "#install_databaseSetup_host",
                "steps": [
                    {"name": "fill_db_host",   "type": "fill_field", "field": "db_host",     "selector": "#install_databaseSetup_host"},
                    {"name": "fill_db_name",   "type": "fill_field", "field": "db_name",     "selector": "#install_databaseSetup_name"},
                    {"name": "fill_db_user",   "type": "fill_field", "field": "db_username", "selector": "#install_databaseSetup_user"},
                    {"name": "fill_db_pass",   "type": "fill_field", "field": "db_password", "selector": "#install_databaseSetup_password"},
                    {"name": "next_db",        "type": "click",      "selector": "button[type=submit], .btn-next"},
                    {"name": "wait_nav",       "type": "wait_nav"},
                ],
            },
            # Admin user step
            {
                "name": "admin_step",
                "type": "conditional",
                "probe_selector": "#install_adminSetup_firstname",
                "steps": [
                    {"name": "fill_fname",    "type": "fill_field", "field": "first_name", "selector": "#install_adminSetup_firstname"},
                    {"name": "fill_lname",    "type": "fill_field", "field": "last_name",  "selector": "#install_adminSetup_lastname"},
                    {"name": "fill_email",    "type": "fill_field", "field": "email",      "selector": "#install_adminSetup_email"},
                    {"name": "fill_user",     "type": "fill_field", "field": "username",   "selector": "#install_adminSetup_username"},
                    {"name": "fill_pass",     "type": "fill_field", "field": "password",   "selector": "#install_adminSetup_password"},
                    {"name": "fill_pass2",    "type": "fill_field", "field": "password_confirm", "selector": "#install_adminSetup_passwordConfirm"},
                    {"name": "next_admin",    "type": "click",      "selector": "button[type=submit], .btn-next"},
                    {"name": "wait_nav",      "type": "wait_nav"},
                ],
            },
            {
                "name": "screenshot_done",
                "type": "screenshot",
                "label": "install_complete",
            },
        ]


# ── Matomo (self-hosted installer) ────────────────────────────────────────────

@register
class MatomoAdapter(FormAdapter):
    """
    Matomo (Piwik) installation wizard.
    URL: http://<host>/index.php
    """
    service_id = "matomo"

    def registration_url(self, credentials: Dict) -> str:
        base = credentials.get("matomo_url", "http://137.220.36.18:8083")
        return f"{base.rstrip('/')}/index.php"

    def steps(self) -> List[Dict]:
        return [
            {
                "name": "wait_welcome",
                "type": "wait",
                "selector": ".welcome, .install-step, body",
            },
            {
                "name": "screenshot_welcome",
                "type": "screenshot",
                "label": "welcome",
            },
            # Click "Next" through welcome / system check pages
            {
                "name": "click_next_welcome",
                "type": "conditional",
                "probe_selector": "a.btn:has-text('Next'), input[type=submit]",
                "steps": [
                    {"name": "next1", "type": "click", "selector": "a.btn:has-text('Next'), input[type=submit]"},
                    {"name": "wait1", "type": "wait_nav"},
                    {"name": "next2", "type": "conditional", "probe_selector": "a.btn:has-text('Next')",
                     "steps": [
                         {"name": "n2", "type": "click", "selector": "a.btn:has-text('Next')"},
                         {"name": "w2", "type": "wait_nav"},
                     ]},
                ],
            },
            # DB config
            {
                "name": "db_config",
                "type": "conditional",
                "probe_selector": "#host",
                "steps": [
                    {"name": "fill_host",   "type": "fill_field", "field": "db_host",     "selector": "#host"},
                    {"name": "fill_user",   "type": "fill_field", "field": "db_username", "selector": "#username"},
                    {"name": "fill_pass",   "type": "fill_field", "field": "db_password", "selector": "#password"},
                    {"name": "fill_dbname", "type": "fill_field", "field": "db_name",     "selector": "#dbname"},
                    {"name": "next_db",     "type": "click",      "selector": "input[type=submit]"},
                    {"name": "wait_nav",    "type": "wait_nav"},
                ],
            },
            # Super user creation
            {
                "name": "superuser",
                "type": "conditional",
                "probe_selector": "#login",
                "steps": [
                    {"name": "fill_login",  "type": "fill_field", "field": "username", "selector": "#login"},
                    {"name": "fill_pass",   "type": "fill_field", "field": "password", "selector": "#password"},
                    {"name": "fill_pass2",  "type": "fill_field", "field": "password_confirm", "selector": "#password_bis"},
                    {"name": "fill_email",  "type": "fill_field", "field": "email",    "selector": "#email"},
                    {"name": "next_user",   "type": "click",      "selector": "input[type=submit]"},
                    {"name": "wait_nav",    "type": "wait_nav"},
                ],
            },
            {
                "name": "screenshot_done",
                "type": "screenshot",
                "label": "install_complete",
            },
        ]


# ── Vaultwarden (admin token + first user) ────────────────────────────────────

@register
class VaultwardenAdapter(FormAdapter):
    """
    Vaultwarden admin panel + first user account creation.
    Step 1: Set admin token via /admin
    Step 2: Create first user account via web vault
    """
    service_id = "vaultwarden"

    def registration_url(self, credentials: Dict) -> str:
        base = credentials.get("vaultwarden_url", "http://137.220.36.18:8000")
        return f"{base.rstrip('/')}/#register"

    def steps(self) -> List[Dict]:
        return [
            {
                "name": "wait_register_form",
                "type": "wait",
                "selector": "input[id*=email i], input[name*=email i], app-register",
            },
            {
                "name": "screenshot_register",
                "type": "screenshot",
                "label": "register_form",
            },
            {
                "name": "fill_email",
                "type": "fill_field",
                "field": "email",
            },
            {
                "name": "fill_full_name",
                "type": "fill_field",
                "field": "full_name",
            },
            {
                "name": "fill_master_password",
                "type": "fill_field",
                "field": "password",
            },
            {
                "name": "fill_master_password_confirm",
                "type": "fill_field",
                "field": "password_confirm",
            },
            {
                "name": "screenshot_before_submit",
                "type": "screenshot",
                "label": "before_submit",
            },
            {
                "name": "submit",
                "type": "click",
                "selector": "button[type=submit], button:has-text('Create account'), button:has-text('Register')",
            },
            {
                "name": "wait_success",
                "type": "wait",
                "selector": "app-login, .success, [class*=success]",
            },
        ]


# ── GitHub (public signup) ────────────────────────────────────────────────────

@register
class GitHubAdapter(FormAdapter):
    """
    GitHub.com account signup.
    Note: GitHub has a CAPTCHA on signup — BrowserForge will pause and
    notify the owner to solve it manually.
    """
    service_id = "github"

    def registration_url(self, credentials: Dict) -> str:
        return "https://github.com/signup"

    def steps(self) -> List[Dict]:
        return [
            {
                "name": "wait_email_field",
                "type": "wait",
                "selector": "#email",
            },
            {
                "name": "fill_email",
                "type": "fill_field",
                "field": "email",
                "selector": "#email",
            },
            {
                "name": "click_continue_email",
                "type": "click",
                "selector": "button:has-text('Continue'), [data-continue-to='password-container']",
            },
            {
                "name": "wait_password",
                "type": "wait",
                "selector": "#password",
            },
            {
                "name": "fill_password",
                "type": "fill_field",
                "field": "password",
                "selector": "#password",
            },
            {
                "name": "click_continue_password",
                "type": "click",
                "selector": "button:has-text('Continue'), [data-continue-to='username-container']",
            },
            {
                "name": "wait_username",
                "type": "wait",
                "selector": "#login",
            },
            {
                "name": "fill_username",
                "type": "fill_field",
                "field": "username",
                "selector": "#login",
            },
            {
                "name": "click_continue_username",
                "type": "click",
                "selector": "button:has-text('Continue'), [data-continue-to='opt-in-container']",
            },
            # Opt-in to email — click No thanks
            {
                "name": "opt_out_email",
                "type": "conditional",
                "probe_selector": "[value='0']:has-text('No'), input[value='0']",
                "steps": [
                    {"name": "click_no", "type": "click", "selector": "label[for*='opt-out'], input[value='0'] + label"},
                ],
            },
            {
                "name": "click_continue_optin",
                "type": "click",
                "selector": "button:has-text('Continue')",
            },
            # CAPTCHA gate — pause for owner to solve
            {
                "name": "captcha",
                "type": "captcha_gate",
                "required": False,
            },
            {
                "name": "screenshot_post_captcha",
                "type": "screenshot",
                "label": "post_captcha",
            },
            # Email verification OTP
            {
                "name": "email_otp",
                "type": "otp_gate",
                "otp_type": "email_code",
                "required": False,
            },
            {
                "name": "screenshot_done",
                "type": "screenshot",
                "label": "signup_complete",
            },
        ]


# ── Stripe (public signup) ────────────────────────────────────────────────────

@register
class StripeAdapter(FormAdapter):
    """
    Stripe.com account signup.
    Stripe sends an email verification link — KeyKeeper handles it.
    """
    service_id = "stripe"

    def registration_url(self, credentials: Dict) -> str:
        return "https://dashboard.stripe.com/register"

    def steps(self) -> List[Dict]:
        return [
            {
                "name": "wait_form",
                "type": "wait",
                "selector": "input[name=email], #email",
            },
            {
                "name": "fill_email",
                "type": "fill_field",
                "field": "email",
                "selector": "input[name=email]",
            },
            {
                "name": "fill_full_name",
                "type": "fill_field",
                "field": "full_name",
                "selector": "input[name=full_name], input[name=name]",
            },
            {
                "name": "fill_password",
                "type": "fill_field",
                "field": "password",
                "selector": "input[name=password], input[type=password]",
            },
            {
                "name": "fill_country",
                "type": "conditional",
                "probe_selector": "select[name=country]",
                "steps": [
                    {"name": "select_country", "type": "select",
                     "selector": "select[name=country]", "value": "US"},
                ],
            },
            {
                "name": "screenshot_before_submit",
                "type": "screenshot",
                "label": "before_submit",
            },
            {
                "name": "submit",
                "type": "click",
                "selector": "button[type=submit], button:has-text('Create account'), button:has-text('Get started')",
            },
            {
                "name": "wait_nav",
                "type": "wait_nav",
            },
            # Email verification link — KeyKeeper fetches it
            {
                "name": "email_verification",
                "type": "otp_gate",
                "otp_type": "verification_link",
                "required": False,
            },
            {
                "name": "screenshot_done",
                "type": "screenshot",
                "label": "signup_complete",
            },
        ]


# ── Mailgun (public signup) ───────────────────────────────────────────────────

@register
class MailgunAdapter(FormAdapter):
    """Mailgun.com account signup."""
    service_id = "mailgun"

    def registration_url(self, credentials: Dict) -> str:
        return "https://signup.mailgun.com/new/signup"

    def steps(self) -> List[Dict]:
        return [
            {
                "name": "wait_form",
                "type": "wait",
                "selector": "input[name=email], input[type=email]",
            },
            {
                "name": "fill_form",
                "type": "fill_form",
                "fields": {
                    "email":    None,
                    "password": None,
                },
            },
            {
                "name": "screenshot_before_submit",
                "type": "screenshot",
                "label": "before_submit",
            },
            {
                "name": "submit",
                "type": "click",
                "selector": "button[type=submit], button:has-text('Sign up'), button:has-text('Create account')",
            },
            {
                "name": "wait_nav",
                "type": "wait_nav",
            },
            # Email verification OTP
            {
                "name": "email_otp",
                "type": "otp_gate",
                "otp_type": "email_code",
                "required": False,
            },
            {
                "name": "screenshot_done",
                "type": "screenshot",
                "label": "signup_complete",
            },
        ]


# ── Cloudflare (public signup) ────────────────────────────────────────────────

@register
class CloudflareAdapter(FormAdapter):
    """Cloudflare.com account signup."""
    service_id = "cloudflare"

    def registration_url(self, credentials: Dict) -> str:
        return "https://dash.cloudflare.com/sign-up"

    def steps(self) -> List[Dict]:
        return [
            {
                "name": "wait_form",
                "type": "wait",
                "selector": "input[name=email], input[type=email]",
            },
            {
                "name": "fill_email",
                "type": "fill_field",
                "field": "email",
            },
            {
                "name": "fill_password",
                "type": "fill_field",
                "field": "password",
            },
            {
                "name": "fill_password_confirm",
                "type": "fill_field",
                "field": "password_confirm",
            },
            {
                "name": "screenshot_before_submit",
                "type": "screenshot",
                "label": "before_submit",
            },
            {
                "name": "submit",
                "type": "click",
                "selector": "button[type=submit], button:has-text('Create account'), button:has-text('Sign up')",
            },
            {
                "name": "wait_nav",
                "type": "wait_nav",
            },
            {
                "name": "email_verification",
                "type": "otp_gate",
                "otp_type": "verification_link",
                "required": False,
            },
            {
                "name": "screenshot_done",
                "type": "screenshot",
                "label": "signup_complete",
            },
        ]


# ── OpenAI (public signup) ────────────────────────────────────────────────────

@register
class OpenAIAdapter(FormAdapter):
    """
    OpenAI platform account signup.
    Uses email + OTP verification (no password on first step).
    """
    service_id = "openai"

    def registration_url(self, credentials: Dict) -> str:
        return "https://platform.openai.com/signup"

    def steps(self) -> List[Dict]:
        return [
            {
                "name": "wait_email",
                "type": "wait",
                "selector": "input[name=email], input[type=email]",
            },
            {
                "name": "fill_email",
                "type": "fill_field",
                "field": "email",
            },
            {
                "name": "click_continue",
                "type": "click",
                "selector": "button:has-text('Continue'), button[type=submit]",
            },
            {
                "name": "wait_nav",
                "type": "wait_nav",
            },
            # Password step (if present)
            {
                "name": "password_step",
                "type": "conditional",
                "probe_selector": "input[type=password]",
                "steps": [
                    {"name": "fill_pass",    "type": "fill_field", "field": "password"},
                    {"name": "click_next",   "type": "click",      "selector": "button:has-text('Continue'), button[type=submit]"},
                    {"name": "wait_nav",     "type": "wait_nav"},
                ],
            },
            # Email OTP verification
            {
                "name": "email_otp",
                "type": "otp_gate",
                "otp_type": "email_code",
                "required": False,
            },
            # Name step
            {
                "name": "name_step",
                "type": "conditional",
                "probe_selector": "input[name=first_name], input[autocomplete=given-name]",
                "steps": [
                    {"name": "fill_fname",  "type": "fill_field", "field": "first_name"},
                    {"name": "fill_lname",  "type": "fill_field", "field": "last_name"},
                    {"name": "click_next",  "type": "click",      "selector": "button:has-text('Continue'), button[type=submit]"},
                    {"name": "wait_nav",    "type": "wait_nav"},
                ],
            },
            {
                "name": "screenshot_done",
                "type": "screenshot",
                "label": "signup_complete",
            },
        ]
