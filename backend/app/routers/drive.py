"""Drive picker grant recording. Org tokens stay server-side."""
from typing import List

from fastapi import APIRouter, Depends, Request
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
