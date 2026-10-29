"""Public Worklane helpers (no auth; minimal fields only)."""
from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response
from pydantic import BaseModel, Field
from typing import Optional

from app.core.company_slug import (
    is_reserved_slug,
    is_valid_slug_format,
    normalize_slug,
    slug_exists,
)
from app.core.limiter import limiter
from app.core.tenant import get_global_db
from app.services.company_branding import (
    accent_or_default,
    brand_name_of,
    sanitize_logo_url,
)

router = APIRouter(prefix="/public", tags=["worklane-public"])

# Short CDN-friendly cache — branding changes are rare; keeps Render egress down.
_BRAND_CACHE = "public, max-age=120, stale-while-revalidate=600"


class SlugExistsResponse(BaseModel):
    exists: bool


class CompanyBrandingPublicResponse(BaseModel):
    """Login-page branding only. Never includes id, email, members, or lists."""

    exists: bool
    display_name: Optional[str] = None
    logo_url: Optional[str] = Field(
        default=None,
        description="Public https logo (Cloudinary). Null when unset.",
    )
    accent_color: Optional[str] = None


def _public_logo_url(raw: object) -> Optional[str]:
    """Only return logos that are already publicly fetchable over https."""
    url = sanitize_logo_url(raw)
    if not url:
        return None
    # Prefer Cloudinary (how company logos are stored). Allow any https:// as
    # sanitize already rejected non-https; never proxy private Drive here.
    return url


@router.get("/company-slug-exists", response_model=SlugExistsResponse)
@limiter.limit("60/minute")
async def company_slug_exists(
    request: Request,
    slug: str = Query(..., min_length=1, max_length=64),
) -> SlugExistsResponse:
    """Boolean only — used for unknown-subdomain → apex redirect."""
    gdb = get_global_db()
    return SlugExistsResponse(exists=await slug_exists(gdb, slug))


@router.get("/company-branding", response_model=CompanyBrandingPublicResponse)
@limiter.limit("60/minute")
async def company_branding_public(
    request: Request,
    response: Response,
    slug: str = Query(..., min_length=1, max_length=64),
) -> CompanyBrandingPublicResponse:
    """Login branding for `<slug>.oneworklane.com`.

    Returns only display_name, logo_url, accent_color when the slug exists.
    Unknown / reserved / invalid → exists=false (SPA redirects to apex).
    """
    response.headers["Cache-Control"] = _BRAND_CACHE
    s = normalize_slug(slug)
    if not is_valid_slug_format(s) or is_reserved_slug(s):
        return CompanyBrandingPublicResponse(exists=False)

    gdb = get_global_db()
    if gdb is None:
        return CompanyBrandingPublicResponse(exists=False)

    doc = await gdb.companies.find_one(
        {"slug": s, "status": {"$ne": "suspended"}},
        {
            "_id": 0,
            "display_name": 1,
            "name": 1,
            "logo_url": 1,
            "accent_color": 1,
        },
    )
    if not doc:
        return CompanyBrandingPublicResponse(exists=False)

    return CompanyBrandingPublicResponse(
        exists=True,
        display_name=brand_name_of(doc),
        logo_url=_public_logo_url(doc.get("logo_url")),
        accent_color=accent_or_default(doc.get("accent_color")),
    )
