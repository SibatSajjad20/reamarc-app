from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import re
import uuid

from app.core.security import get_current_user, require_management_role, require_roles
from app.database import get_database
from app.services.company_members import company_member_user
from app.models.user import UserRole
from app.schemas.log_exception import (
    ExceptionActionRequest,
    ExceptionItemResponse,
    MemberReasonRequest,
    SnapshotHighlight,
    SnapshotResponse,
    SnapshotPerson,
    SnapshotDepartment,
    DailyTaskItem,
    DayComplianceDetail,
    EmployeeComplianceDetailResponse,
)
from app.services.log_compliance import (
    LOGGERS_ROLES,
    pkt_today,
    format_hours_hm,
)
from app.services.workdays import parse_iso_date, recent_company_workdays
from app.services.log_variance import (
    _compute_person_days,
    compute_log_variance,
    get_employee_variance,
    get_exceptions,
    parse_date_window,
    format_hm,
)

router = APIRouter(
    prefix="/log-exceptions",
    tags=["Daily Log Exceptions"],
)

require_lead_or_hr = require_roles(["admin", "operations", "hr", "team_lead"])


def _raw_to_exception_item(raw_item: Dict[str, Any]) -> ExceptionItemResponse:
    """Helper mapping raw exception dict to ExceptionItemResponse (§2.7.2)."""
    worked_m = raw_item.get("worked", 0)
    logged_m = raw_item.get("logged", 0)
    var_m = raw_item.get("variance", 0)
    exp_m = raw_item.get("expected", 0)
    exc_type = raw_item.get("type", "no_log")
    is_no_log = exc_type == "no_log"
    signed = round((logged_m - worked_m) / 60.0, 2)
    gap = round(abs(var_m) / 60.0, 2)

    score_doc = raw_item.get("score_doc") or {}
    action_status = raw_item.get("action_status") or score_doc.get("action_status") or "open"
    action_type = score_doc.get("action_type")
    action_by_name = score_doc.get("action_by_name")
    action_by_role = score_doc.get("action_by_role")
    employee_notified = bool(score_doc.get("employee_notified"))
    escalated = bool(score_doc.get("escalated")) or (action_status == "escalated")
    task_count = raw_item.get("task_count", 0)
    previously_accepted = score_doc.get("previously_accepted_signed_gap_hours")
    reopen_note = raw_item.get("reopen_note") or score_doc.get("reopen_note")

    return ExceptionItemResponse(
        id=raw_item["id"],
        user_id=raw_item["user_id"],
        date=raw_item["date"],
        full_name=raw_item.get("user_name") or raw_item.get("full_name") or "User",
        department=raw_item.get("department"),
        role=raw_item.get("role", "team_member"),
        exception_type=exc_type,
        message=raw_item.get("detail", ""),
        hours=gap,
        severity="high" if exc_type in ("no_log", "missing_checkout") else "medium",
        required_action="correct" if exc_type in ("no_log", "missing_checkout") else "review",
        status="red" if exc_type in ("no_log", "missing_checkout") else "amber",
        action_status=action_status,
        action_type=action_type,
        action_by_name=action_by_name,
        action_by_role=action_by_role,
        expected_hours=round(exp_m / 60.0, 2),
        logged_hours=round(logged_m / 60.0, 2),
        worked_hours=round(worked_m / 60.0, 2),
        gap_hours=gap,
        signed_gap_hours=signed,
        has_checkin=raw_item.get("has_checkin", False),
        has_checkout=raw_item.get("has_checkout", False),
        task_count=task_count,
        is_missing_log=is_no_log,
        escalated=escalated,
        employee_notified=employee_notified,
        member_reason=raw_item.get("member_reason") or score_doc.get("member_reason"),
        previously_accepted_signed_gap_hours=previously_accepted,
        reopen_note=reopen_note,
    )


@router.get("/inbox", response_model=List[ExceptionItemResponse])
async def list_exception_inbox(
    date: Optional[str] = Query(None, description="Optional YYYY-MM-DD to inspect a single day"),
    start_date: Optional[str] = Query(None, description="Optional range start YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Optional range end YYYY-MM-DD"),
    current_user: dict = Depends(require_lead_or_hr),
):
    """
    Read-only inbox endpoint delegating to the shared exceptions service (§2.5, §2.7.2).
    Returns open items only by default.
    """
    db = get_database()
    if db is None:
        return []

    if start_date and end_date:
        s_clean = start_date.strip()
        e_clean = end_date.strip()
    elif date:
        s_clean = date.strip()
        e_clean = date.strip()
    else:
        # Default to recent 7 workdays
        from app.services.log_compliance import SYSTEM_START_DATE
        workdays = await recent_company_workdays(7, start_date=SYSTEM_START_DATE)
        if workdays:
            s_clean = min(workdays)
            e_clean = max(workdays)
        else:
            s_clean = pkt_today()
            e_clean = s_clean

    data = await get_exceptions(
        current_user=current_user,
        start_date=s_clean,
        end_date=e_clean,
        group_by="employee",
        include_reviewed=False,
        db=db,
    )

    items: List[ExceptionItemResponse] = []
    for group in data.get("groups", []):
        for raw_item in group.get("items", []):
            items.append(_raw_to_exception_item(raw_item))

    items.sort(key=lambda x: (x.date, x.full_name), reverse=True)
    return items


@router.post("/inbox/{score_id}/actions")
async def act_on_exception(
    score_id: str,
    body: ExceptionActionRequest,
    current_user: dict = Depends(require_lead_or_hr),
):
    """
    Restore base act_on_exception endpoint (§2.7.1).
    Stores name, department, role, dls- id, accepted_signed_gap_hours, and live hours from shared service.
    """
    action = (body.action or "").strip().lower()
    if action not in ("explain", "correct", "review", "escalate", "accept", "ask_again"):
        raise HTTPException(
            status_code=400,
            detail="Unknown action. Use explain, correct, review, escalate, accept, or ask_again.",
        )

    role = str(current_user.get("role") or "").lower()
    if action == "escalate" and role != "team_lead":
        raise HTTPException(status_code=403, detail="Only team leads can escalate to HR.")

    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    user_id = None
    date_str = None
    score = await db.daily_log_day_scores.find_one({"id": score_id}, {"_id": 0})
    if score:
        user_id = score.get("user_id")
        date_str = score.get("date")
    elif score_id.startswith("missing:") or score_id.startswith("gap:"):
        parts = score_id.split(":")
        if len(parts) >= 3:
            user_id = parts[1]
            date_str = ":".join(parts[2:]) if len(parts) > 3 else parts[2]
            score = {
                "id": score_id,
                "user_id": user_id,
                "date": date_str,
                "action_status": "open",
            }

    if not user_id or not date_str:
        raise HTTPException(status_code=404, detail="Exception not found.")

    member = await company_member_user(user_id, db=db, include_inactive=True)
    if not member:
        raise HTTPException(status_code=404, detail="Employee not found.")
    member_role = str(member.get("role") or "").lower()

    if role == "team_lead":
        if member_role not in ("team_member", "member"):
            raise HTTPException(status_code=403, detail="Team leads only act on their team members.")
        from app.services.permissions import (
            load_context,
            departments_with,
            normalize_dept,
            get_user_primary_department,
        )
        lead_user_doc = await company_member_user(current_user.get("id"), db=db, include_inactive=True)
        ctx = await load_context(lead_user_doc or current_user, db=db)
        lead_depts = [normalize_dept(d) for d in departments_with(ctx, "exceptions", "department")]
        if not lead_depts:
            dept = current_user.get("department") or current_user.get("primary_department")
            if dept:
                lead_depts = [normalize_dept(dept)]
        if not lead_depts:
            raise HTTPException(status_code=403, detail="Your account has no department assigned.")
        member_primary = normalize_dept(get_user_primary_department(member) or member.get("department") or "")
        if not member_primary or member_primary not in lead_depts:
            raise HTTPException(status_code=403, detail="This employee is outside your department.")
        if user_id == current_user.get("id"):
            raise HTTPException(status_code=403, detail="Your own log is reviewed by HR.")
    elif role == "hr":
        if member_role not in ("team_member", "member", "team_lead"):
            raise HTTPException(status_code=403, detail="HR inbox covers team members and team leads only.")
        if user_id == current_user.get("id"):
            raise HTTPException(status_code=403, detail="Your own log is reviewed by Admin.")
    else:
        # Admin or operations: may act on team_member, member, team_lead, and hr
        if member_role not in ("team_member", "member", "team_lead", "hr"):
            raise HTTPException(status_code=403, detail="Role not authorized to act on this employee.")

    now_iso = datetime.now(timezone.utc).isoformat()
    actor_name = current_user.get("full_name") or current_user.get("name") or "Reviewer"
    actor_id = current_user.get("id")
    actor_role = role
    existing_status = (score or {}).get("action_status") or "open"
    already_notified = bool((score or {}).get("employee_notified")) or existing_status in (
        "waiting_on_employee",
        "waiting_on_reviewer",
    )
    ping = False
    new_status = existing_status
    set_escalated = bool((score or {}).get("escalated"))

    if action == "review":
        new_status = "reviewed"
        ping = False
    elif action == "accept":
        if existing_status != "waiting_on_reviewer":
            raise HTTPException(status_code=400, detail="Nothing to accept — the employee has not sent a reason yet.")
        new_status = "reviewed"
        ping = False
    elif action == "ask_again":
        if existing_status != "waiting_on_reviewer":
            raise HTTPException(status_code=400, detail="Ask again is only for a reason waiting on you.")
        new_status = "waiting_on_employee"
        ping = True
    elif action == "escalate":
        set_escalated = True
        if existing_status == "open":
            new_status = "escalated"
        ping = False
    elif action in ("explain", "correct"):
        if already_notified:
            return {
                "success": True,
                "action_status": existing_status,
                "notified": False,
                "emailed": False,
                "already_requested": True,
            }
        new_status = "waiting_on_employee"
        ping = True
    else:
        raise HTTPException(status_code=400, detail="Unknown action.")

    raw_id = str((score or {}).get("id") or score_id)
    score_id_value = (
        raw_id
        if raw_id and not raw_id.startswith(("missing:", "gap:"))
        else f"dls-{uuid.uuid4().hex[:12]}"
    )

    # Compute live day hours from shared service (§2.7.1)
    pdata_map = await _compute_person_days(
        db=db,
        users=[member],
        s_clean=date_str,
        e_clean=date_str,
        today=pkt_today(),
    )
    pdata = pdata_map.get(user_id, {})
    day_res = pdata["days"][0] if pdata.get("days") else None
    if day_res:
        worked_h = round(day_res["worked"] / 60.0, 2)
        logged_h = round(day_res["logged"] / 60.0, 2)
        gap_h = round(max(0, day_res["worked"] - day_res["logged"]) / 60.0, 2)
        signed_gap_h = (
            round((day_res["logged"] - day_res["worked"]) / 60.0, 2)
            if day_res["compare_ready"]
            else 0.0
        )
        has_checkin = bool(day_res["check_in"])
        has_checkout = bool(day_res["check_out"])
        compare_ready = bool(day_res["compare_ready"])
    else:
        worked_h = 0.0
        logged_h = 0.0
        gap_h = 0.0
        signed_gap_h = 0.0
        has_checkin = False
        has_checkout = False
        compare_ready = False

    live = {
        "worked_hours": worked_h,
        "logged_hours": logged_h,
        "gap_hours": gap_h,
        "signed_gap_hours": signed_gap_h,
        "has_checkin": has_checkin,
        "has_checkout": has_checkout,
        "compare_ready": compare_ready,
    }

    accept_fields: dict = {}
    if new_status == "reviewed":
        accept_fields = {
            "accepted_signed_gap_hours": live["signed_gap_hours"],
            "accepted_logged_hours": live["logged_hours"],
            "accepted_worked_hours": live["worked_hours"],
            "reopen_note": "",
            "gap_reopened_at": None,
        }

    await db.daily_log_day_scores.update_one(
        {"user_id": user_id, "date": date_str},
        {
            "$set": {
                "id": score_id_value,
                "user_id": user_id,
                "date": date_str,
                "full_name": member.get("full_name") or member.get("name") or "User",
                "email": member.get("email"),
                "department": member.get("department") or member.get("primary_department") or "",
                "role": member_role,
                "action_status": new_status,
                "action_type": action if action in ("explain", "correct", "ask_again") else (score or {}).get("action_type"),
                "action_by": actor_id,
                "action_by_name": actor_name,
                "action_by_role": actor_role,
                "action_at": now_iso,
                "escalated": set_escalated,
                "employee_notified": ping or already_notified,
                "logged_hours": live["logged_hours"],
                "worked_hours": live["worked_hours"],
                "gap_hours": live["gap_hours"],
                "signed_gap_hours": live["signed_gap_hours"],
                "has_checkin": live["has_checkin"],
                "has_checkout": live["has_checkout"],
                "compare_ready": live["compare_ready"],
                "updated_at": now_iso,
                **accept_fields,
            },
            "$setOnInsert": {"created_at": now_iso, "status": "amber", "exceptions": []},
        },
        upsert=True,
    )

    if ping:
        if action == "ask_again":
            verb = "update your log or send another reason"
        elif action == "explain":
            verb = "send a reason for the hours gap"
        else:
            verb = "add the missing time on your daily log"
        message = f"{actor_name} asked you to {verb} for {date_str}."
        from app.services.push_service import dispatch_to_users
        await dispatch_to_users(
            user_ids=[user_id],
            title="Daily log follow-up",
            body=message,
            kind="log_exception_followup",
            sender_id=actor_id,
            sender_name=actor_name,
            data={"missing_dates": [date_str], "date": date_str, "action": action},
        )

    return {
        "success": True,
        "action_status": new_status,
        "notified": ping,
        "emailed": False,
        "already_requested": False,
    }
@router.post("/my-reason")
async def submit_member_reason(
    body: MemberReasonRequest,
    current_user: dict = Depends(get_current_user),
):
    """Employee reply: attach a day-level reason. Does not create a fake log row."""
    role = str(current_user.get("role") or "").lower()
    if role not in ("team_member", "team_lead", "hr"):
        raise HTTPException(status_code=403, detail="Only people who submit daily logs can send a reason.")

    reason = (body.reason or "").strip()
    if len(reason) < 3:
        raise HTTPException(status_code=400, detail="Please write a short reason.")

    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    uid = current_user.get("id")
    date_str = body.date
    score = await db.daily_log_day_scores.find_one({"user_id": uid, "date": date_str}, {"_id": 0})
    if not score or (score.get("action_status") or "open") != "waiting_on_employee":
        raise HTTPException(
            status_code=400,
            detail="There is no open request for this day. Add log hours, or wait until your lead asks.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.daily_log_day_scores.update_one(
        {"user_id": uid, "date": date_str},
        {
            "$set": {
                "member_reason": reason,
                "member_reason_at": now_iso,
                "action_status": "waiting_on_reviewer",
                "updated_at": now_iso,
            }
        },
    )
    return {"success": True, "action_status": "waiting_on_reviewer", "date": date_str}


@router.get("/snapshot", response_model=SnapshotResponse, dependencies=[Depends(require_management_role)])
async def get_operating_snapshot(
    date: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to today PKT"),
    range_mode: str = Query("today", alias="range", description="today | week | range"),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD, custom start date"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD, custom end date"),
    current_user: dict = Depends(require_management_role),
):
    """
    Thin adapter over compute_log_variance, preserving response shape for LogComplianceCard.
    """
    db = get_database()
    date_str = date or pkt_today()
    range_lower = str(range_mode).lower()
    s_clean = start_date if isinstance(start_date, str) and start_date.strip() else None
    e_clean = end_date if isinstance(end_date, str) and end_date.strip() else None

    if (range_lower == "range" or (s_clean and e_clean)) and s_clean and e_clean:
        computed_start = s_clean
        computed_end = e_clean
        range_key = "range"
    elif range_lower == "week":
        anchor_dt = datetime.strptime(date_str, "%Y-%m-%d").date()
        monday = anchor_dt - timedelta(days=anchor_dt.weekday())
        saturday = monday + timedelta(days=5)
        computed_start = monday.strftime("%Y-%m-%d")
        computed_end = saturday.strftime("%Y-%m-%d")
        range_key = "week"
    else:
        computed_start = date_str
        computed_end = date_str
        range_key = "today"

    data = await compute_log_variance(
        current_user=current_user,
        start_date=computed_start,
        end_date=computed_end,
        db=db,
    )

    summary = data.get("summary", {})
    rows = data.get("rows", [])

    # People with days_present > 0 and days_missing == 0
    submitted_count = sum(
        1 for r in rows if (r.get("days_present", 0) > 0 and r.get("days_missing", 0) == 0)
    )
    expected_people = sum(1 for r in rows if r.get("days_present", 0) > 0)
    if expected_people == 0:
        expected_people = len(rows)

    comp_pct = float(summary.get("submission_pct") or 0.0)

    worked_h = round(summary.get("worked", 0) / 60.0, 2)
    logged_h = round(summary.get("logged", 0) / 60.0, 2)
    expected_h = round(summary.get("expected", 0) / 60.0, 2)
    unallocated_h = round(max(0, summary.get("worked", 0) - summary.get("logged", 0)) / 60.0, 2)

    departments: List[SnapshotDepartment] = []
    for d in data.get("departments", []):
        departments.append(
            SnapshotDepartment(
                name=d["department"],
                total=d["people"],
                logged=max(0, d["people"] - d["days_missing"]),
                missing=d["days_missing"],
                worked_hours=round(d["worked"] / 60.0, 2),
                logged_hours=round(d["logged"] / 60.0, 2),
            )
        )

    people: List[SnapshotPerson] = []
    for r in rows:
        r_worked_h = round(r.get("worked", 0) / 60.0, 2)
        r_logged_h = round(r.get("logged", 0) / 60.0, 2)
        r_exp_h = round(r.get("expected", 0) / 60.0, 2)
        r_signed_gap = round((r.get("logged", 0) - r.get("worked", 0)) / 60.0, 2)
        r_gap = round(abs(r.get("variance", 0)) / 60.0, 2)

        people.append(
            SnapshotPerson(
                user_id=r["user_id"],
                full_name=r["name"],
                department=r.get("department"),
                role=r.get("role", "team_member"),
                expected_hours=r_exp_h,
                worked_hours=r_worked_h,
                logged_hours=r_logged_h,
                gap_hours=r_gap,
                signed_gap_hours=r_signed_gap,
                has_open_request=r.get("open_exceptions", 0) > 0,
                has_checkin=r.get("days_present", 0) > 0,
                has_checkout=r.get("days_present", 0) > 0,
                due=r.get("days_present", 0) > 0,
                is_full_leave=r.get("days_leave", 0) > 0 and r.get("days_present", 0) == 0,
            )
        )

    summary_sentence = (
        f"{submitted_count} of {expected_people} logged ({comp_pct:.0f}%) · "
        f"{format_hm(summary.get('worked', 0))} at work vs {format_hm(summary.get('logged', 0))} logged"
    )

    return SnapshotResponse(
        date=date_str,
        range=range_key,
        start_date=computed_start,
        end_date=computed_end,
        employees_expected=expected_people,
        logs_submitted=submitted_count,
        compliance_pct=comp_pct,
        expected_hours=expected_h,
        logged_hours=logged_h,
        unallocated_hours=unallocated_h,
        tasks_completed=0,
        estimate_variance_hours=0.0,
        rework_hours=0.0,
        exception_count=summary.get("open_exceptions", 0),
        summary=summary_sentence,
        worked_hours=worked_h,
        missed_workdays=summary.get("days_missing", 0),
        highlights=[],
        hr_exceptions=[],
        top_exceptions=[],
        departments=departments,
        people=people,
        open_request_user_ids=[],
    )


@router.get("/snapshot", response_model=SnapshotResponse, dependencies=[Depends(require_management_role)])
async def get_operating_snapshot(
    date: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to today PKT"),
    range_mode: str = Query("today", alias="range", description="today | week | range"),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD, custom start date"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD, custom end date"),
    current_user: dict = Depends(require_management_role),
):
    """
    Thin adapter over compute_log_variance and get_exceptions (§2.7.3).
    Restores department counts, highlights, top_exceptions, hr_exceptions, and open_request_user_ids.
    """
    db = get_database()
    date_str = date or pkt_today()
    range_lower = str(range_mode).lower()
    s_clean = start_date if isinstance(start_date, str) and start_date.strip() else None
    e_clean = end_date if isinstance(end_date, str) and end_date.strip() else None

    if (range_lower == "range" or (s_clean and e_clean)) and s_clean and e_clean:
        computed_start = s_clean
        computed_end = e_clean
        range_key = "range"
    elif range_lower == "week":
        anchor_dt = datetime.strptime(date_str, "%Y-%m-%d").date()
        monday = anchor_dt - timedelta(days=anchor_dt.weekday())
        saturday = monday + timedelta(days=5)
        computed_start = monday.strftime("%Y-%m-%d")
        computed_end = saturday.strftime("%Y-%m-%d")
        range_key = "week"
    else:
        computed_start = date_str
        computed_end = date_str
        range_key = "today"

    data = await compute_log_variance(
        current_user=current_user,
        start_date=computed_start,
        end_date=computed_end,
        db=db,
    )

    exceptions_data = await get_exceptions(
        current_user=current_user,
        start_date=computed_start,
        end_date=computed_end,
        group_by="employee",
        include_reviewed=False,
        db=db,
    )

    summary = data.get("summary", {})
    rows = data.get("rows", [])

    # People with days_present > 0 and days_missing == 0
    submitted_count = sum(
        1 for r in rows if (r.get("days_present", 0) > 0 and r.get("days_missing", 0) == 0)
    )
    expected_people = sum(1 for r in rows if r.get("days_present", 0) > 0)
    if expected_people == 0:
        expected_people = len(rows)

    comp_pct = float(summary.get("submission_pct") or 0.0)

    worked_h = round(summary.get("worked", 0) / 60.0, 2)
    logged_h = round(summary.get("logged", 0) / 60.0, 2)
    expected_h = round(summary.get("expected", 0) / 60.0, 2)
    unallocated_h = round(max(0, summary.get("worked", 0) - summary.get("logged", 0)) / 60.0, 2)

    # Department breakdown (§2.7.3)
    dept_rows_map: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        dept_name = r.get("department") or "General"
        dept_rows_map.setdefault(dept_name, []).append(r)

    departments: List[SnapshotDepartment] = []
    for d_name in sorted(dept_rows_map.keys()):
        d_rows = dept_rows_map[d_name]
        d_total = len(d_rows)
        d_logged = sum(1 for r in d_rows if r.get("days_present", 0) > 0 and r.get("days_missing", 0) == 0)
        d_missing = sum(1 for r in d_rows if r.get("days_missing", 0) > 0)
        d_worked_h = round(sum(r.get("worked", 0) for r in d_rows) / 60.0, 2)
        d_logged_h = round(sum(r.get("logged", 0) for r in d_rows) / 60.0, 2)
        departments.append(
            SnapshotDepartment(
                name=d_name,
                total=d_total,
                logged=d_logged,
                missing=d_missing,
                worked_hours=d_worked_h,
                logged_hours=d_logged_h,
            )
        )

    people: List[SnapshotPerson] = []
    for r in rows:
        r_worked_h = round(r.get("worked", 0) / 60.0, 2)
        r_logged_h = round(r.get("logged", 0) / 60.0, 2)
        r_exp_h = round(r.get("expected", 0) / 60.0, 2)
        r_signed_gap = round((r.get("logged", 0) - r.get("worked", 0)) / 60.0, 2)
        r_gap = round(abs(r.get("variance", 0)) / 60.0, 2)

        people.append(
            SnapshotPerson(
                user_id=r["user_id"],
                full_name=r["name"],
                department=r.get("department"),
                role=r.get("role", "team_member"),
                expected_hours=r_exp_h,
                worked_hours=r_worked_h,
                logged_hours=r_logged_h,
                gap_hours=r_gap,
                signed_gap_hours=r_signed_gap,
                has_open_request=r.get("open_exceptions", 0) > 0,
                has_checkin=r.get("days_present", 0) > 0,
                has_checkout=r.get("days_present", 0) > 0,
                due=r.get("days_present", 0) > 0,
                is_full_leave=r.get("days_leave", 0) > 0 and r.get("days_present", 0) == 0,
            )
        )

    # Collect open exception items
    open_items: List[Dict[str, Any]] = []
    for group in exceptions_data.get("groups", []):
        for it in group.get("items", []):
            open_items.append(it)

    # Top exceptions: first 8 by gap descending (§2.7.3)
    sorted_open_items = sorted(open_items, key=lambda x: abs(x.get("variance", 0)), reverse=True)
    top_exceptions = [_raw_to_exception_item(it) for it in sorted_open_items[:8]]

    # HR exceptions: open items where role is "hr" (§2.7.3)
    hr_exceptions = [
        _raw_to_exception_item(it)
        for it in sorted_open_items
        if str(it.get("role") or "").lower() == "hr"
    ]

    # Open request user IDs: people waiting on employee or reviewer (§2.7.3)
    open_request_user_ids = list({
        it["user_id"]
        for it in open_items
        if it.get("action_status") in ("waiting_on_employee", "waiting_on_reviewer")
    })

    # Highlights (§2.7.3)
    highlights: List[SnapshotHighlight] = []
    if sorted_open_items:
        top_mismatch = sorted_open_items[0]
        u_name = top_mismatch.get("user_name") or "User"
        highlights.append(
            SnapshotHighlight(
                label="Biggest hours gap",
                value=f"{u_name} · {format_hm(top_mismatch.get('logged', 0))} logged / {format_hm(top_mismatch.get('worked', 0))} at work",
                user_name=u_name,
            )
        )
    people_missing_count = sum(1 for r in rows if r.get("days_missing", 0) > 0)
    highlights.append(
        SnapshotHighlight(label="Didn't log", value=str(people_missing_count))
    )

    summary_sentence = (
        f"{submitted_count} of {expected_people} logged ({comp_pct:.0f}%) · "
        f"{format_hm(summary.get('worked', 0))} at work vs {format_hm(summary.get('logged', 0))} logged"
    )

    return SnapshotResponse(
        date=date_str,
        range=range_key,
        start_date=computed_start,
        end_date=computed_end,
        employees_expected=expected_people,
        logs_submitted=submitted_count,
        compliance_pct=comp_pct,
        expected_hours=expected_h,
        logged_hours=logged_h,
        unallocated_hours=unallocated_h,
        tasks_completed=summary.get("tasks_completed", 0),
        estimate_variance_hours=0.0,
        rework_hours=0.0,
        exception_count=summary.get("open_exceptions", 0),
        summary=summary_sentence,
        worked_hours=worked_h,
        missed_workdays=summary.get("days_missing", 0),
        highlights=highlights,
        hr_exceptions=hr_exceptions,
        top_exceptions=top_exceptions,
        departments=departments,
        people=people,
        open_request_user_ids=open_request_user_ids,
    )


@router.get("/employee-detail", response_model=EmployeeComplianceDetailResponse, dependencies=[Depends(require_lead_or_hr)])
async def get_employee_detail(
    user_id: str = Query(..., description="Employee user ID"),
    date: Optional[str] = Query(None, description="Anchor date YYYY-MM-DD, defaults to today PKT"),
    range_mode: str = Query("week", alias="range", description="today | week | range"),
    start_date: Optional[str] = Query(None, description="Custom start date"),
    end_date: Optional[str] = Query(None, description="Custom end date"),
    current_user: dict = Depends(require_lead_or_hr),
):
    """
    Thin adapter over get_employee_variance, keeping existing response shape.
    """
    db = get_database()
    date_str = date or pkt_today()
    range_lower = str(range_mode).lower()
    s_clean = start_date.strip() if isinstance(start_date, str) and start_date.strip() else None
    e_clean = end_date.strip() if isinstance(end_date, str) and end_date.strip() else None

    if (range_lower == "range" or (s_clean and e_clean)) and s_clean and e_clean:
        computed_start = s_clean
        computed_end = e_clean
    elif range_lower == "week":
        anchor_dt = datetime.strptime(date_str, "%Y-%m-%d").date()
        monday = anchor_dt - timedelta(days=anchor_dt.weekday())
        saturday = monday + timedelta(days=5)
        computed_start = monday.strftime("%Y-%m-%d")
        computed_end = saturday.strftime("%Y-%m-%d")
    else:
        computed_start = date_str
        computed_end = date_str

    emp_data = await get_employee_variance(
        current_user=current_user,
        target_user_id=user_id,
        start_date=computed_start,
        end_date=computed_end,
        db=db,
    )

    user_info = emp_data["user"]
    summary = emp_data["summary"]

    days_detail: List[DayComplianceDetail] = []
    for d in emp_data.get("days", []):
        parsed_d = parse_iso_date(d["date"])
        day_name = parsed_d.strftime("%a") if parsed_d else ""
        worked_h = round(d["worked"] / 60.0, 2)
        logged_h = round(d["logged"] / 60.0, 2)
        gap_h = round(abs(d["variance"]) / 60.0, 2)
        signed_h = round((d["logged"] - d["worked"]) / 60.0, 2)

        tasks = [
            DailyTaskItem(
                id=t.get("id"),
                task_description=t.get("task_description", ""),
                client_project=t.get("client_project"),
                task_type=t.get("task_type"),
                task_status=t.get("task_status"),
                hours_utilized=float(t.get("hours_utilized") or 0.0),
                progress_percentage=t.get("progress_percentage"),
                blockers=t.get("blockers"),
            )
            for t in d.get("tasks", [])
        ]

        days_detail.append(
            DayComplianceDetail(
                date=d["date"],
                day_name=day_name,
                is_workday=d["scheduled"],
                is_off_day=d["status"] in ("off", "holiday"),
                off_day_label=d.get("status_label"),
                is_leave=d["status"] == "leave",
                status=d["status"],
                check_in=d.get("check_in"),
                check_out=d.get("check_out"),
                worked_hours=worked_h,
                logged_hours=logged_h,
                gap_hours=gap_h,
                signed_gap_hours=signed_h,
                due=d["compare_ready"],
                tasks=tasks,
                member_reason=(d.get("score_doc") or {}).get("member_reason"),
                action_status=(d.get("score_doc") or {}).get("action_status"),
                action_type=(d.get("score_doc") or {}).get("action_type"),
                is_live=d["status"] == "live",
            )
        )

    total_worked_h = round(summary.get("worked", 0) / 60.0, 2)
    total_logged_h = round(summary.get("logged", 0) / 60.0, 2)
    total_signed_gap_h = round((summary.get("logged", 0) - summary.get("worked", 0)) / 60.0, 2)

    return EmployeeComplianceDetailResponse(
        user_id=user_info["user_id"],
        full_name=user_info["name"],
        email=user_info.get("email"),
        department=user_info.get("department"),
        role=user_info.get("role", "team_member"),
        start_date=computed_start,
        end_date=computed_end,
        total_worked_hours=total_worked_h,
        total_logged_hours=total_logged_h,
        total_signed_gap_hours=total_signed_gap_h,
        days_expected=summary.get("days_scheduled", 0),
        days_logged=summary.get("days_logged", 0),
        days_missing=summary.get("days_missing", 0),
        days=days_detail,
    )
