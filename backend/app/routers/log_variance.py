"""
Log Variance Router: Shared backend calculation endpoints.
Prefix: /log-variance
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core.security import get_current_user, require_management_role, require_roles
from app.database import get_database
from app.schemas.log_variance import (
    EmployeeDetailResponse,
    ExceptionsResponse,
    LogVarianceResponse,
)
from app.services.company_members import deactivation_cutoff
from app.services.log_variance import (
    _compute_person_days,
    compute_log_variance,
    get_employee_variance,
    get_exceptions,
    get_loggers_for_viewer,
    parse_date_window,
    pkt_today,
)
from app.services.log_variance_excel import generate_log_variance_excel

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/log-variance",
    tags=["Log Variance"],
)

require_lead_or_management = require_roles(["admin", "operations", "hr", "team_lead"])


@router.get("", response_model=LogVarianceResponse)
async def get_log_variance(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to start_date"),
    department: Optional[str] = Query(None, description="Optional department filter"),
    user_id: Optional[str] = Query(None, description="Optional user filter"),
    current_user: dict = Depends(require_lead_or_management),
):
    """
    1. GET /log-variance?start_date&end_date&department?&user_id?
    Returns summary aggregates, department rollups, employee rows, and thresholds.
    """
    db = get_database()
    return await compute_log_variance(
        current_user=current_user,
        start_date=start_date,
        end_date=end_date,
        department=department,
        user_id=user_id,
        db=db,
    )


@router.get("/employee/{user_id}", response_model=EmployeeDetailResponse)
async def get_employee_variance_breakdown(
    user_id: str,
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to start_date"),
    current_user: dict = Depends(get_current_user),
):
    """
    2. GET /log-variance/employee/{user_id}?start_date&end_date
    Scope: management, lead in department, or self.
    Returns employee details, range summary, and all days in the range.
    """
    db = get_database()
    viewer_id = str(current_user.get("id") or current_user.get("_id") or "")
    viewer_role = str(current_user.get("role") or "").lower()

    if viewer_role in ("team_member", "member"):
        if user_id != viewer_id:
            raise HTTPException(
                status_code=403, detail="Team members can only view their own logs"
            )

    return await get_employee_variance(
        current_user=current_user,
        target_user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        db=db,
    )


@router.get("/exceptions", response_model=ExceptionsResponse)
async def get_log_exceptions_grouped(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to start_date"),
    department: Optional[str] = Query(None, description="Optional department filter"),
    type: Optional[str] = Query(None, description="Optional exception type filter"),
    group: str = Query("employee", description="employee | day"),
    include_reviewed: bool = Query(False, description="Include reviewed exceptions"),
    current_user: dict = Depends(require_lead_or_management),
):
    """
    3. GET /log-variance/exceptions?start_date&end_date&department?&type?&group=employee|day&include_reviewed=false
    Read-only exceptions grouped by employee or day with totals by type.
    """
    db = get_database()
    return await get_exceptions(
        current_user=current_user,
        start_date=start_date,
        end_date=end_date,
        department=department,
        exception_type=type,
        group_by=group,
        include_reviewed=include_reviewed,
        db=db,
    )


@router.get("/export")
async def export_log_variance_xlsx(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to start_date"),
    department: Optional[str] = Query(None, description="Optional department filter"),
    current_user: dict = Depends(require_management_role),
):
    """
    4. GET /log-variance/export?start_date&end_date&department?
    Returns 3-sheet styled Excel workbook: Summary, Daily detail, Exceptions.
    """
    db = get_database()
    s_clean, e_clean, dates, _ = parse_date_window(start_date, end_date)

    variance_data = await compute_log_variance(
        current_user=current_user,
        start_date=s_clean,
        end_date=e_clean,
        department=department,
        db=db,
    )

    exceptions_data = await get_exceptions(
        current_user=current_user,
        start_date=s_clean,
        end_date=e_clean,
        department=department,
        group_by="employee",
        include_reviewed=True,
        db=db,
    )

    users = await get_loggers_for_viewer(
        current_user,
        db=db,
        department_filter=department,
        for_exceptions=False,
        range_start=s_clean,
        range_end=e_clean,
    )

    person_data = await _compute_person_days(
        db=db,
        users=users,
        s_clean=s_clean,
        e_clean=e_clean,
        today=pkt_today(),
        viewer_user=current_user,
    )

    # Gather daily details for all rows in a single batch (§2.6)
    daily_details: List[Dict[str, Any]] = []
    for user in users:
        uid = str(user.get("id") or user.get("_id"))
        pdata = person_data.get(uid)
        if not pdata:
            continue
        u_name = user.get("full_name") or user.get("name") or "Unknown"
        dept = user.get("department") or user.get("primary_department") or ""
        cutoff = deactivation_cutoff(user)
        is_inactive = (user.get("is_active") is False) or (cutoff is not None)
        for day in pdata["days"]:
            day_copy = dict(day)
            day_copy["employee_name"] = u_name
            day_copy["department"] = dept
            day_copy["inactive"] = is_inactive
            daily_details.append(day_copy)

    buf = generate_log_variance_excel(
        variance_data=variance_data,
        daily_details=daily_details,
        exceptions_data=exceptions_data,
    )

    filename = f"Log variance {s_clean}_{e_clean}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
