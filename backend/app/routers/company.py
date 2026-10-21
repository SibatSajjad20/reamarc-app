"""Company-admin branding endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, ConfigDict

from app.core.limiter import limiter
from app.core.security import require_admin
from app.services import company_branding

router = APIRouter(prefix="/company", tags=["company"])


class CompanyBrandingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: Optional[str] = None
    accent_color: Optional[str] = None


def _resolve_company_id(current_user: dict) -> str:
    """Always the caller's active company. Never taken from body, query, or headers."""
    cid = current_user.get("company_id") or company_branding.DEFAULT_COMPANY_ID
    if cid == "reamarc":
        return company_branding.DEFAULT_COMPANY_ID
    return cid


def _guard_setup(current_user: dict) -> None:
    if current_user.get("needs_setup"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Finish account setup before changing company branding.")


@router.get("/branding")
async def get_company_branding(current_user: dict = Depends(require_admin)):
    _guard_setup(current_user)
    return await company_branding.get_branding(_resolve_company_id(current_user))


@router.patch("/branding")
@limiter.limit("20/minute")
async def patch_company_branding(request: Request, body: CompanyBrandingUpdate, current_user: dict = Depends(require_admin)):
    _guard_setup(current_user)
    fields = body.model_dump(exclude_unset=True)
    return await company_branding.update_branding(
        _resolve_company_id(current_user),
        actor_user_id=current_user["id"],
        display_name=fields["display_name"] if "display_name" in fields else ...,
        accent_color=fields["accent_color"] if "accent_color" in fields else ...,
        via="company_settings",
        impersonating=bool(current_user.get("impersonating")),
    )


@router.post("/branding/logo")
@limiter.limit("10/minute")
async def upload_company_logo(request: Request, file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    _guard_setup(current_user)
    return await company_branding.upload_logo(
        _resolve_company_id(current_user),
        file,
        actor_user_id=current_user["id"],
        via="company_settings",
        impersonating=bool(current_user.get("impersonating")),
    )


@router.delete("/branding/logo")
@limiter.limit("10/minute")
async def delete_company_logo(request: Request, current_user: dict = Depends(require_admin)):
    _guard_setup(current_user)
    return await company_branding.remove_logo(
        _resolve_company_id(current_user),
        actor_user_id=current_user["id"],
        via="company_settings",
        impersonating=bool(current_user.get("impersonating")),
    )
