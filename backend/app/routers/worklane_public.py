"""Public Worklane helpers (no auth, no company details leaked)."""
from __future__ import annotations

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.core.company_slug import slug_exists
from app.core.limiter import limiter
from app.core.tenant import get_global_db

router = APIRouter(prefix="/public", tags=["worklane-public"])


class SlugExistsResponse(BaseModel):
    exists: bool


@router.get("/company-slug-exists", response_model=SlugExistsResponse)
@limiter.limit("60/minute")
async def company_slug_exists(
    request: Request,
    slug: str = Query(..., min_length=1, max_length=64),
) -> SlugExistsResponse:
    """Return whether a company slug exists. Boolean only — no names/ids/lists.

    Used by the SPA so unknown subdomains like hello.oneworklane.com redirect
    to the apex. www/api/app/admin/mail are treated as non-existent company slugs.
    """
    gdb = get_global_db()
    return SlugExistsResponse(exists=await slug_exists(gdb, slug))
