"""Company branding fields on the global companies collection."""

from __future__ import annotations

import io
import logging
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.owner_audit import record_owner_audit_event
from app.core.tenant import get_global_db
from app.services import avatar_service, cloudinary_service, image_pipeline

logger = logging.getLogger("app.services.company_branding")

DEFAULT_ACCENT = "#6847E0"
DEFAULT_COMPANY_ID = "company_reamarc"
DEFAULT_COMPANY_NAME = "Reamarc"
MAX_LOGO_BYTES = 2 * 1024 * 1024
MAX_CONTENT_LENGTH = int(2.5 * 1024 * 1024)
MIN_SIDE = 128
MAX_SIDE = 4096
MAX_OUTPUT = 512
ACCENT_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

Image.MAX_IMAGE_PIXELS = MAX_SIDE * MAX_SIDE


def _global_db():
    gdb = get_global_db()
    if gdb is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")
    return gdb


def branding_folder(company_id: str) -> str:
    return f"companies/{company_id}/branding"


def branding_prefix(company_id: str) -> str:
    return f"{branding_folder(company_id)}/"


def can_destroy_public_id(public_id: Optional[str], company_id: str) -> bool:
    return bool(public_id) and str(public_id).startswith(branding_prefix(company_id))


def brand_name_of(doc: Optional[dict]) -> str:
    if not doc:
        return DEFAULT_COMPANY_NAME
    display = (doc.get("display_name") or "").strip()
    name = (doc.get("name") or "").strip()
    return display or name or DEFAULT_COMPANY_NAME


def sanitize_logo_url(url: Any) -> Optional[str]:
    if isinstance(url, str) and url.startswith("https://"):
        return url
    return None


def contrast_ratio_against_white(hex_color: str) -> float:
    value = hex_color.lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    r = int(value[0:2], 16)
    g = int(value[2:4], 16)
    b = int(value[4:6], 16)

    def channel(c: int) -> float:
        x = c / 255.0
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4

    luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    return 1.05 / (luminance + 0.05)


def normalize_accent(value: Optional[str], *, enforce_contrast: bool = True) -> str:
    raw = (value or "").strip()
    if not ACCENT_RE.match(raw):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Accent colour must be a hex value like #6847E0.",
        )
    body = raw[1:]
    if len(body) == 3:
        body = "".join(ch * 2 for ch in body)
    normalised = f"#{body.upper()}"
    if enforce_contrast and contrast_ratio_against_white(normalised) < 3.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This colour doesn't have enough contrast with white button text.",
        )
    return normalised


def accent_or_default(value: Any) -> str:
    try:
        return normalize_accent(str(value) if value else DEFAULT_ACCENT, enforce_contrast=False)
    except HTTPException:
        return DEFAULT_ACCENT


def parse_display_name(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if len(trimmed) < 2 or len(trimmed) > 60:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Display name must be 2 to 60 characters.",
        )
    if "<" in trimmed or ">" in trimmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Display name can't include < or >.",
        )
    if any(unicodedata.category(ch).startswith("C") for ch in trimmed):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Display name contains invalid characters.",
        )
    return trimmed


def public_company_payload(doc: Optional[dict]) -> dict:
    doc = doc or {}
    return {
        "id": doc.get("id"),
        "name": doc.get("name"),
        "display_name": doc.get("display_name"),
        "brand_name": brand_name_of(doc),
        "slug": doc.get("slug"),
        "logo_url": sanitize_logo_url(doc.get("logo_url")),
        "accent_color": accent_or_default(doc.get("accent_color")),
        "timezone": doc.get("timezone") or "Asia/Karachi",
    }


def public_company_list_item(doc: dict, membership: Optional[dict] = None) -> dict:
    payload = public_company_payload(doc)
    return {
        "id": payload["id"],
        "name": payload["name"],
        "display_name": payload["display_name"],
        "brand_name": payload["brand_name"],
        "slug": payload["slug"],
        "logo_url": payload["logo_url"],
        "accent_color": payload["accent_color"],
        "role": (membership or {}).get("role", "team_member"),
    }


def branding_response(doc: Optional[dict], *, company_id: str, configured: bool) -> dict:
    payload = public_company_payload(doc if configured else {
        "id": company_id or DEFAULT_COMPANY_ID,
        "name": DEFAULT_COMPANY_NAME,
        "slug": "reamarc",
        "accent_color": DEFAULT_ACCENT,
        "timezone": "Asia/Karachi",
    })
    logo_url = payload["logo_url"] if configured else None
    return {
        "company_id": payload["id"] or company_id,
        "name": payload["name"] or DEFAULT_COMPANY_NAME,
        "display_name": payload["display_name"] if configured else None,
        "brand_name": payload["brand_name"],
        "logo_url": logo_url,
        "has_logo": bool(logo_url),
        "accent_color": payload["accent_color"],
        "branding_updated_at": (doc or {}).get("branding_updated_at") if configured else None,
        "uploads_enabled": cloudinary_service.is_configured(),
        "configured": configured,
    }


async def get_company_doc(company_id: str) -> Optional[dict]:
    gdb = _global_db()
    doc = await gdb.companies.find_one({"id": company_id})
    if not doc:
        doc = await gdb.companies.find_one({"slug": company_id})
    return doc


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _audit(action: str, actor_user_id: str, company_id: str, details: Dict[str, Any]) -> None:
    from app.core.security import invalidate_auth_cache

    gdb = _global_db()
    await record_owner_audit_event(
        global_db=gdb,
        action=action,
        actor_user_id=actor_user_id,
        target_company_id=company_id,
        details=details,
    )
    invalidate_auth_cache()


def _require_company(doc: Optional[dict]) -> dict:
    if not doc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This company isn't set up yet.")
    return doc


def _detect_svg(data: bytes) -> bool:
    stripped = data.lstrip(b"\xef\xbb\xbf \t\r\n")
    return stripped[:1] == b"<" or b"<svg" in data[:1024].lower()


async def read_and_validate_logo(file: UploadFile) -> bytes:
    return await image_pipeline.read_validate_square_logo(file, label="Logo")


async def get_branding(company_id: str) -> dict:
    doc = await get_company_doc(company_id)
    if not doc:
        return branding_response(None, company_id=company_id or DEFAULT_COMPANY_ID, configured=False)
    return branding_response(doc, company_id=doc.get("id") or company_id, configured=True)


async def update_branding(
    company_id: str,
    *,
    actor_user_id: str,
    display_name: Any = ...,
    accent_color: Any = ...,
    via: str,
    impersonating: bool = False,
    require_existing: bool = False,
) -> dict:
    doc = await get_company_doc(company_id)
    if require_existing and not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    doc = _require_company(doc)
    cid = doc["id"]
    update_fields: Dict[str, Any] = {}
    changed: Dict[str, Any] = {}
    if display_name is not ...:
        new_display = parse_display_name(display_name)
        if new_display != doc.get("display_name"):
            update_fields["display_name"] = new_display
            changed["display_name"] = {"old": doc.get("display_name"), "new": new_display}
    if accent_color is not ...:
        new_accent = normalize_accent(accent_color)
        if new_accent != accent_or_default(doc.get("accent_color")):
            update_fields["accent_color"] = new_accent
            changed["accent_color"] = {"old": doc.get("accent_color"), "new": new_accent}
    if update_fields:
        update_fields["branding_updated_at"] = _now()
        update_fields["branding_updated_by"] = actor_user_id
        await _global_db().companies.update_one({"id": cid}, {"$set": update_fields})
        await _audit("company_branding_updated", actor_user_id, cid, {"via": via, "impersonating": impersonating, "changed": changed})
    return await get_branding(cid)


async def upload_logo(
    company_id: str,
    file: UploadFile,
    *,
    actor_user_id: str,
    via: str,
    impersonating: bool = False,
    require_existing: bool = False,
) -> dict:
    doc = await get_company_doc(company_id)
    if require_existing and not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    doc = _require_company(doc)
    cid = doc["id"]
    old_pid = doc.get("logo_public_id")
    png_bytes = await read_and_validate_logo(file)
    leaf_id = f"logo_{uuid.uuid4().hex[:12]}"
    try:
        secure_url, new_pid = await cloudinary_service.upload_image(
            png_bytes,
            folder=branding_folder(cid),
            public_id=leaf_id,
            tags=["company_logo", cid],
            overwrite=False,
            not_configured_detail="Logo uploads aren't set up on this server yet.",
        )
    except HTTPException:
        raise

    filt: Dict[str, Any] = {"id": cid}
    if old_pid:
        filt["logo_public_id"] = old_pid
    else:
        filt["$or"] = [{"logo_public_id": None}, {"logo_public_id": {"$exists": False}}]
    try:
        result = await _global_db().companies.update_one(
            filt,
            {"$set": {
                "logo_url": secure_url,
                "logo_public_id": new_pid,
                "branding_updated_at": _now(),
                "branding_updated_by": actor_user_id,
            }},
        )
    except Exception:
        await cloudinary_service.destroy(new_pid)
        raise HTTPException(status_code=500, detail="Couldn't save the logo. Try again.")
    if result.matched_count == 0:
        await cloudinary_service.destroy(new_pid)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The logo was updated by someone else. Refresh and try again.")
    if can_destroy_public_id(old_pid, cid):
        try:
            await cloudinary_service.destroy(old_pid)
        except Exception as exc:
            logger.warning("Could not delete old company logo %s: %s", old_pid, type(exc).__name__)
    await _audit("company_logo_uploaded", actor_user_id, cid, {"via": via, "impersonating": impersonating, "old_public_id": old_pid, "new_public_id": new_pid})
    return await get_branding(cid)


async def remove_logo(
    company_id: str,
    *,
    actor_user_id: str,
    via: str,
    impersonating: bool = False,
    require_existing: bool = False,
) -> dict:
    doc = await get_company_doc(company_id)
    if require_existing and not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    doc = _require_company(doc)
    cid = doc["id"]
    old_pid = doc.get("logo_public_id")
    await _global_db().companies.update_one(
        {"id": cid},
        {"$set": {"logo_url": None, "logo_public_id": None, "branding_updated_at": _now(), "branding_updated_by": actor_user_id}},
    )
    if can_destroy_public_id(old_pid, cid):
        await cloudinary_service.destroy(old_pid)
    await _audit("company_logo_removed", actor_user_id, cid, {"via": via, "impersonating": impersonating, "old_public_id": old_pid, "new_public_id": None})
    return await get_branding(cid)


async def clear_logo_from_owner_update(company_id: str, existing: dict, actor_user_id: str) -> Tuple[dict, Optional[str]]:
    old_pid = existing.get("logo_public_id")
    fields = {"logo_url": None, "logo_public_id": None, "branding_updated_at": _now(), "branding_updated_by": actor_user_id}
    return fields, old_pid if can_destroy_public_id(old_pid, company_id) else None
