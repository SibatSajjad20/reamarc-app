"""Company subdomain slug helpers (exact match for *.oneworklane.com)."""
from __future__ import annotations

import re
from typing import Optional

# Platform / infra labels — never assign as a company slug.
# (Does NOT include "reamarc": the home tenant may own that slug.)
RESERVED_HOST_SLUGS = frozenset({
    "www", "api", "app", "admin", "mail", "ftp", "cdn", "static",
    "status", "docs", "support", "help", "blog", "shop", "owner",
    "auth", "login", "assets", "billing", "dashboard", "settings",
    "public", "root", "system",
})

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def normalize_slug(raw: str | None) -> str:
    return (raw or "").strip().lower()


def is_valid_slug_format(slug: str) -> bool:
    s = normalize_slug(slug)
    return bool(s) and 2 <= len(s) <= 50 and bool(_SLUG_RE.fullmatch(s))


def is_reserved_slug(slug: str) -> bool:
    return normalize_slug(slug) in RESERVED_HOST_SLUGS


def validate_slug_or_raise(slug: str) -> str:
    s = normalize_slug(slug)
    if not is_valid_slug_format(s):
        raise ValueError(
            "Slug must be 2–50 chars: lowercase letters, numbers, hyphens "
            "(e.g. dataviz, acme-co). No leading/trailing hyphen."
        )
    if is_reserved_slug(s):
        raise ValueError(f"Slug '{s}' is reserved (www, api, app, admin, mail, …).")
    return s


def slugify_from_name(name: str | None) -> str:
    """Generate a candidate slug from a company name (not used for host matching)."""
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower())
    s = re.sub(r"-{2,}", "-", s).strip("-")
    if len(s) < 2:
        s = "company"
    return s[:50].strip("-") or "company"


async def ensure_unique_slug(gdb, slug: str, *, exclude_company_id: Optional[str] = None) -> str:
    """Return slug, or slug-2 / slug-3 … if taken. Never returns a reserved label."""
    base = validate_slug_or_raise(slug)
    candidate = base
    n = 2
    while True:
        q: dict = {"slug": candidate}
        if exclude_company_id:
            q["id"] = {"$ne": exclude_company_id}
        hit = await gdb.companies.find_one(q, {"id": 1})
        if not hit:
            return candidate
        candidate = f"{base[:40]}-{n}"
        n += 1
        if n > 1000:
            raise RuntimeError("Could not allocate a unique company slug")


async def slug_exists(gdb, slug: str) -> bool:
    """True if an active (non-suspended) company owns this exact slug."""
    s = normalize_slug(slug)
    if not is_valid_slug_format(s) or is_reserved_slug(s):
        return False
    if gdb is None:
        return False
    doc = await gdb.companies.find_one(
        {"slug": s, "status": {"$ne": "suspended"}},
        {"_id": 1},
    )
    return bool(doc)

