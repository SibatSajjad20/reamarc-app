from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import require_hr_or_admin, require_internal_user
from app.schemas.error import ErrorResponse
from app.schemas.mobile import (
    AdminOverviewResponse,
    BroadcastPushRequest,
    LiveEmployeeStatus,
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


@router.delete("/notifications/clear-all")
async def clear_notifications(current_user: dict = Depends(require_internal_user)):
    deleted = await push_service.clear_all_notifications(current_user.get("id"))
    return {"deleted": deleted, "message": "All notifications cleared"}


@router.get("/devices", response_model=List[MobileDeviceResponse])
async def list_devices(current_user: dict = Depends(require_hr_or_admin)):
    return await device_registry.list_active_devices()


@router.post("/devices/transfer", response_model=dict)
async def transfer_device(
    body: TransferDeviceRequest,
    current_user: dict = Depends(require_hr_or_admin),
):
    return await device_registry.transfer_device(body.user_id)


@router.delete("/devices/reset-all", response_model=dict)
async def reset_all_devices(current_user: dict = Depends(require_hr_or_admin)):
    count = await device_registry.reset_all_devices()
    return {"message": f"Successfully reset {count} mobile device registrations. All devices can now cleanly re-bind."}



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
        sender_id=current_user.get("id"),
        sender_name=current_user.get("name"),
        sender_role=current_user.get("role"),
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
        sender_id=current_user.get("id"),
        sender_name=current_user.get("name"),
        sender_role=current_user.get("role"),
    )
    if result.get("in_app", 0) == 0 and result.get("sent", 0) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No bound phone for that user. Open the mobile app while logged in first.",
        )
    return result


@router.get("/admin-overview", response_model=AdminOverviewResponse)
async def get_admin_overview(current_user: dict = Depends(require_hr_or_admin)):
    from datetime import datetime
    from zoneinfo import ZoneInfo
    from app.database import get_database
    from app.services import attendance_service

    PK_TZ = ZoneInfo("Asia/Karachi")
    today = datetime.now(PK_TZ).strftime("%Y-%m-%d")

    matrix = await attendance_service.get_daily_matrix(date_str=today)
    db = get_database()
    pending_count = 0
    if db is not None:
        pending_count = await db.leave_requests.count_documents({"status": "pending"})

    employees: List[LiveEmployeeStatus] = []
    dept_map: dict = {}
    for r in matrix.rows:
        dept = r.department or "General"
        if dept not in dept_map:
            dept_map[dept] = {"name": dept, "present": 0, "total": 0}
        dept_map[dept]["total"] += 1

        is_pres = bool(r.check_in or r.punch_in)
        if is_pres:
            dept_map[dept]["present"] += 1

        is_wfh = bool(r.is_wfh or r.status_tag == "WFH")
        is_late = bool(r.is_late or (r.check_in and r.check_in > "10:00"))

        status_label = "Present" if is_pres else ("WFH" if is_wfh else ("Leave" if r.status_tag in ("Annual Leave", "Sick Leave", "Leave") else "Absent"))
        if is_pres and is_late:
            status_label = "Late"
        if is_pres and (r.check_out or r.punch_out):
            status_label = "Completed"

        employees.append(
            LiveEmployeeStatus(
                user_id=r.user_id,
                name=r.user_name or r.user_id,
                role=r.role or "employee",
                department=dept,
                status=status_label,
                check_in=r.check_in or r.punch_in,
                check_out=r.check_out or r.punch_out,
                is_wfh=is_wfh,
                is_late=is_late,
                hours_worked=float(getattr(r, "total_work_hours", 0.0) or 0.0),
            )
        )

    status_order = {"Present": 0, "Late": 1, "Completed": 2, "WFH": 3, "Leave": 4, "Absent": 5}
    employees.sort(key=lambda x: (status_order.get(x.status, 9), x.name.lower()))

    return AdminOverviewResponse(
        date=today,
        total_employees=matrix.total_employees,
        present_count=matrix.present_count,
        on_time_count=max(0, matrix.present_count - matrix.late_count),
        late_count=matrix.late_count,
        wfh_count=matrix.wfh_count,
        leave_count=matrix.leave_count,
        absent_count=matrix.absent_count,
        pending_approvals_count=pending_count,
        departments=list(dept_map.values()),
        employees=employees,
    )

