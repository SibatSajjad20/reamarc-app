"""Drive picker grant recording. Org tokens stay server-side."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.limiter import limiter
from app.core.security import get_current_user
from app.services import google_drive_service as gdrive

router = APIRouter(prefix="/drive", tags=["Google Drive"])


class PickerGrantRequest(BaseModel):
    file_ids: List[str] = Field(default_factory=list)
    user_token: str = Field(default="", exclude=True)


@router.post("/picker-grants")
@limiter.limit("60/minute")
async def record_picker_grants(
    request: Request,
    payload: PickerGrantRequest,
    current_user: dict = Depends(get_current_user),
):
    """Record file ids the user just picked so ingest can accept them for 1 hour."""
    count = await gdrive.record_picker_grants(
        payload.file_ids,
        actor=current_user,
        user_token=payload.user_token,
    )
    return {"ok": True, "recorded": count}


@router.get("/direct-link")
@limiter.limit("120/minute")
async def direct_download_link(
    request: Request,
    path: str = Query(..., description="App file URL, e.g. /uploads/gdrive/<id>/<name>"),
    current_user: dict = Depends(get_current_user),
):
    """Google download URL for a Drive file this user may already download, so bytes skip the server.

    409 means "use the normal download" (not a Drive file, sharing blocked, or Drive unavailable).
    """
    from app.core.uploads import authorize_stored_upload, normalize_upload_key, _caller_company_id
    from app.database import get_database
    from app.services.drive_direct import direct_download_url

    db = get_database()
    await authorize_stored_upload(db, current_user, path)
    file_id = gdrive.file_id_from_path(normalize_upload_key(path))
    if not file_id:
        raise HTTPException(status_code=409, detail="Not a Google Drive file.")
    url = await direct_download_url(file_id, company_id=_caller_company_id(current_user) or "")
    if not url:
        raise HTTPException(status_code=409, detail="Direct download unavailable.")
    return {"url": url}
