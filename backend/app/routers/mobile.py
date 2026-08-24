from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import require_hr_or_admin, require_internal_user
from app.schemas.error import ErrorResponse
from app.schemas.mobile import (
    BroadcastPushRequest,
    MobileDeviceResponse,
    MobileNotificationResponse,
    PushDispatchResponse,
    RegisterDeviceRequest,
    TransferDeviceRequest,
)
from app.services import device_registry, push_service

router = APIRouter(
    prefix="/mobile",
    tags=["Mobile Companion"],
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)


@router.post("/register-device", response_model=MobileDeviceResponse)
async def register_device(
    body: RegisterDeviceRequest,
    current_user: dict = Depends(require_internal_user),
):
    return await device_registry.register_device(
        user=current_user,
        device_uuid=body.device_uuid,
        device_name=body.device_name,
        platform=body.platform,
        push_token=body.push_token,
    )


@router.get("/device", response_model=MobileDeviceResponse)
async def get_my_device(current_user: dict = Depends(require_internal_user)):
    doc = await device_registry.get_active_device_for_user(current_user.get("id"))
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No device bound to this account.")
    return device_registry._format_device(doc, current_user)


@router.get("/notifications", response_model=List[MobileNotificationResponse])
async def get_my_notifications(
    current_user: dict = Depends(require_internal_user),
    limit: int = Query(default=50, ge=1, le=100),
):
    return await push_service.list_notifications(current_user.get("id"), limit=limit)


@router.post("/notifications/read-all")
async def mark_notifications_read(current_user: dict = Depends(require_internal_user)):
    updated = await push_service.mark_all_read(current_user.get("id"))
    return {"updated": updated}


@router.get("/devices", response_model=List[MobileDeviceResponse])
async def list_devices(current_user: dict = Depends(require_hr_or_admin)):
    return await device_registry.list_active_devices()


@router.post("/devices/transfer", response_model=dict)
async def transfer_device(
    body: TransferDeviceRequest,
    current_user: dict = Depends(require_hr_or_admin),
):
    return await device_registry.transfer_device(body.user_id)


@router.post("/broadcast", response_model=PushDispatchResponse)
async def broadcast_push(
    body: BroadcastPushRequest,
    current_user: dict = Depends(require_hr_or_admin),
):
    ids = [u for u in (body.user_ids or []) if u]
    result = await push_service.dispatch_to_users(
        user_ids=ids or None,
        title=body.title.strip(),
        body=body.body.strip(),
        kind="custom",
    )
    return result


@router.post("/push-test", response_model=PushDispatchResponse)
async def push_test(
    current_user: dict = Depends(require_hr_or_admin),
    user_id: Optional[str] = Query(default=None),
):
    target = user_id or current_user.get("id")
    result = await push_service.dispatch_to_users(
        user_ids=[target],
        title="Reamarc test",
        body="Push is working. You can punch from the mobile app.",
        kind="test",
    )
    if result.get("in_app", 0) == 0 and result.get("sent", 0) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No bound phone for that user. Open the mobile app while logged in first.",
        )
    return result
