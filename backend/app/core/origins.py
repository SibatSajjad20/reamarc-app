"""CORS / CSRF origin helpers for the Worklane (oneworklane.com) domain."""
from __future__ import annotations

import re
from typing import Optional

# Apex + optional single label subdomain. Rejects evil-oneworklane.com and a.b.oneworklane.com.
WORKLANE_ORIGIN_REGEX = (
    r"^https://([a-z0-9]([a-z0-9\-]*[a-z0-9])?\.)?oneworklane\.com$"
)
WORKLANE_ORIGIN_RE = re.compile(WORKLANE_ORIGIN_REGEX, re.IGNORECASE)

_RESERVED_SUBDOMAINS = frozenset({
    "www", "api", "app", "mail", "ftp", "cdn", "static", "admin",
    "status", "docs", "support", "help", "blog", "shop",
})

_SLUG_RE = re.compile(r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$")


def is_worklane_origin(origin: str) -> bool:
    """True for https://oneworklane.com and https://<label>.oneworklane.com only."""
    o = (origin or "").strip()
    if not o:
        return False
    return bool(WORKLANE_ORIGIN_RE.fullmatch(o))


def parse_company_slug_from_host(
    host: str,
    *,
    base_domain: str = "oneworklane.com",
) -> Optional[str]:
    """
    Extract a company slug from `<slug>.oneworklane.com`.

    Returns None for apex, www, api, reserved labels, multi-label hosts,
    or hosts that are not under base_domain (e.g. evil-oneworklane.com).
    """
    h = (host or "").split(":")[0].strip().lower().rstrip(".")
    if not h or not base_domain:
        return None
    base = base_domain.strip().lower().rstrip(".")
    if h == base or h == f"www.{base}" or h == f"api.{base}":
        return None
    suffix = f".{base}"
    if not h.endswith(suffix):
        return None
    rest = h[: -len(suffix)]
    if not rest or "." in rest:
        return None
    if rest in _RESERVED_SUBDOMAINS:
        return None
    if not _SLUG_RE.fullmatch(rest):
        return None
    return rest


def effective_frontend_url(settings_obj) -> str:
    """Canonical public app origin for emails and absolute links.

    Prefer APP_FRONTEND_URL when it is an absolute http(s) URL. In production,
    if it is still a localhost/dev default, fall back to https://{APP_BASE_DOMAIN}
    so invite and booking links do not point at a developer machine.
    """
    raw = (getattr(settings_obj, "APP_FRONTEND_URL", None) or "").strip().rstrip("/")
    base_domain = (getattr(settings_obj, "APP_BASE_DOMAIN", None) or "oneworklane.com").strip()
    fallback = f"https://{base_domain}"
    if not raw:
        return fallback if getattr(settings_obj, "IS_PRODUCTION", False) else "http://localhost:5173"
    lower = raw.lower()
    if getattr(settings_obj, "IS_PRODUCTION", False) and (
        "localhost" in lower or "127.0.0.1" in lower
    ):
        return fallback
    return raw


def effective_api_url(settings_obj) -> str:
    """Canonical public API origin (no trailing slash), e.g. https://api.oneworklane.com."""
    raw = (getattr(settings_obj, "APP_API_URL", None) or "").strip().rstrip("/")
    if raw:
        return raw
    base = (getattr(settings_obj, "APP_BASE_DOMAIN", None) or "oneworklane.com").strip()
    return f"https://api.{base}"


def public_invoice_url(settings_obj, share_token: str) -> str:
    """Absolute public invoice URL for emails / exported docs."""
    token = str(share_token or "").strip()
    api = effective_api_url(settings_obj)
    return f"{api}/api/v1/finance/public/invoice/{token}"
