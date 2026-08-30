from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from app.core.security import get_current_user, require_management_role, require_roles
from app.database import get_database
from app.models.user import UserRole
from app.schemas.log_exception import (
    ExceptionActionRequest,
    ExceptionItemResponse,
    MemberReasonRequest,
    SnapshotHighlight,
    SnapshotResponse,
    SnapshotPerson,
    SnapshotDepartment,
)
from app.services.log_compliance import (
    LOGGERS_ROLES,
    EXEMPT_ROLES,
    pkt_today,
    recent_workdays,
    batch_expected_targets,
    primary_exception,
    classify_day_status,
    person_day_is_leave,
    person_day_is_due,
    signed_hours_gap,
    live_day_hours,
    apply_accepted_gap_state,
)
from app.routers.daily_log import is_workday, SYSTEM_START_DATE
from app.services.workdays import load_off_day_index, parse_iso_date, recent_company_workdays

router = APIRouter(
    prefix="/log-exceptions",
    tags=["Daily Log Exceptions"],
)

require_lead_or_hr = require_roles(["team_lead", "hr"])


def _clean_reopen_note(note: Optional[str], previously_accepted: Optional[float]) -> Optional[str]:
    if not note:
        return None
    raw = str(note).strip()
    if not raw:
        return None
    if "+0:00" in raw or "-0:00" in raw or "+0h" in raw or "-0h" in raw or "previous +0" in raw or "previous -0" in raw:
        return None
    if previously_accepted is None or abs(float(previously_accepted)) <= 0.05:
        return None
    return raw


def _to_item(score: dict, *, is_missing: bool = False) -> dict:
    primary = primary_exception(score)
    worked = float(score.get("worked_hours") or 0)
    logged = float(score.get("logged_hours") or 0)
    compare_ready = bool(score.get("compare_ready") or score.get("has_checkout"))
    signed = score.get("signed_gap_hours")
    if signed is None:
        signed = signed_hours_gap(logged, worked) if compare_ready else 0.0
    gap = float(score.get("gap_hours") if score.get("gap_hours") is not None else abs(signed))
    prev_accepted = score.get("previously_accepted_signed_gap_hours")
    return {
        "id": score.get("id") or f"missing:{score.get('user_id')}:{score.get('date')}",
        "user_id": score.get("user_id"),
        "date": score.get("date"),
        "full_name": score.get("full_name") or "User",
        "department": score.get("department"),
        "role": score.get("role") or "team_member",
        "exception_type": primary.get("type") or "review",
        "message": primary.get("message") or "Needs review",
        "hours": float(primary.get("hours") or gap),
        "severity": primary.get("severity") or "medium",
        "required_action": primary.get("required_action") or "review",
        "status": score.get("status") or "amber",
        "action_status": score.get("action_status") or "open",
        "action_type": score.get("action_type"),
        "action_by_name": score.get("action_by_name"),
        "action_by_role": score.get("action_by_role"),
        "expected_hours": float(score.get("expected_hours") or 0),
        "logged_hours": logged,
        "worked_hours": worked,
        "gap_hours": round(abs(float(gap)), 2),
        "signed_gap_hours": round(float(signed), 2),
        "has_checkin": bool(score.get("has_checkin")),
        "has_checkout": bool(score.get("has_checkout")),
        "task_count": int(score.get("tasks_completed") or score.get("task_count") or 0),
        "is_missing_log": is_missing or primary.get("type") == "missing_log",
        "escalated": bool(score.get("escalated")),
        "employee_notified": bool(score.get("employee_notified")) or (score.get("action_status") in ("waiting_on_employee", "waiting_on_reviewer")),
        "member_reason": score.get("member_reason") or None,
        "previously_accepted_signed_gap_hours": prev_accepted if (prev_accepted is not None and abs(float(prev_accepted)) > 0.05) else None,
        "reopen_note": _clean_reopen_note(score.get("reopen_note"), prev_accepted),
    }


@router.get("/inbox", response_model=List[ExceptionItemResponse])
async def list_exception_inbox(
    date: Optional[str] = Query(None, description="Optional YYYY-MM-DD to inspect a single day"),
    current_user: dict = Depends(require_lead_or_hr),
):
    db = get_database()
    if db is None:
        return []

    role = str(current_user.get("role") or "").lower()
    viewer_id = current_user.get("id")
    viewer_dept = (current_user.get("department") or "").strip()
    today = pkt_today()
    window = [date] if date else await recent_company_workdays(7, start_date=SYSTEM_START_DATE)
    parsed_days = [parse_iso_date(d) for d in window if parse_iso_date(d)]
    off_idx = await load_off_day_index(min(parsed_days), max(parsed_days)) if parsed_days else None

    user_query: dict = {"is_active": {"$ne": False}, "role": {"$in": list(LOGGERS_ROLES)}}
    if role == "team_lead":
        if not viewer_dept:
            return []
        user_query["role"] = {"$in": ["team_member", UserRole.TEAM_MEMBER.value]}
        user_query["department"] = {"$regex": f"^{viewer_dept}$", "$options": "i"}
        user_query["id"] = {"$ne": viewer_id}
    else:
        user_query["role"] = {"$in": ["team_member", "team_lead", UserRole.TEAM_MEMBER.value, UserRole.TEAM_LEAD.value]}
        user_query["id"] = {"$ne": viewer_id}

    users = await db.users.find(user_query, {"_id": 0, "hashed_password": 0}).to_list(500)
    user_ids = [u.get("id") for u in users if u.get("id") and u.get("id") != viewer_id]
    if not user_ids or not window:
        return []

    log_docs = await db.daily_log_entries.find(
        {"user_id": {"$in": user_ids}, "date": {"$in": window}},
        {"_id": 0, "user_id": 1, "date": 1, "hours_utilized": 1, "task_status": 1},
    ).to_list(8000)
    hours_by_key: dict = {}
    tasks_by_key: dict = {}
    for entry in log_docs:
        uid = entry.get("user_id")
        day = entry.get("date")
        if not uid or not day:
            continue
        try:
            hours_by_key[(uid, day)] = hours_by_key.get((uid, day), 0.0) + float(entry.get("hours_utilized") or 0)
        except (TypeError, ValueError):
            hours_by_key[(uid, day)] = hours_by_key.get((uid, day), 0.0)
        tasks_by_key[(uid, day)] = tasks_by_key.get((uid, day), 0) + (1 if str(entry.get("task_status") or "") == "Completed" else 0)
        if (uid, day) not in tasks_by_key:
            tasks_by_key[(uid, day)] = 0
    log_count_by_key: dict = {}
    for entry in log_docs:
        uid = entry.get("user_id")
        day = entry.get("date")
        if uid and day:
            log_count_by_key[(uid, day)] = log_count_by_key.get((uid, day), 0) + 1

    att_docs = await db.attendance_records.find(
        {"user_id": {"$in": user_ids}, "date": {"$in": window}},
        {"_id": 0, "user_id": 1, "date": 1, "work_hours": 1, "check_in": 1, "punch_in": 1, "check_out": 1, "punch_out": 1, "status": 1, "is_wfh": 1},
    ).to_list(4000)
    att_by_key: dict = {}
    for rec in att_docs:
        uid = rec.get("user_id")
        day = rec.get("date")
        if uid and day:
            att_by_key[(uid, day)] = rec

    score_docs = await db.daily_log_day_scores.find(
        {"user_id": {"$in": user_ids}, "date": {"$in": window}},
        {"_id": 0},
    ).to_list(2000)
    score_by_key = {(s.get("user_id"), s.get("date")): s for s in score_docs if s.get("user_id") and s.get("date")}

    targets = await batch_expected_targets(users, window)
    items: List[dict] = []

    for user in users:
        uid = user.get("id")
        if not uid or uid == viewer_id:
            continue
        urole = str(user.get("role") or "team_member").lower()
        if urole in EXEMPT_ROLES:
            continue
        for day in window:
            if day < SYSTEM_START_DATE:
                continue
            try:
                if off_idx is not None:
                    if not off_idx.is_workday_iso(day):
                        continue
                else:
                    from datetime import datetime as dt
                    if not is_workday(dt.strptime(day, "%Y-%m-%d")):
                        continue
            except Exception:
                continue

            target = targets.get((uid, day)) or {}
            att = att_by_key.get((uid, day)) or {}
            if person_day_is_leave(target, att):
                continue

            stored = score_by_key.get((uid, day)) or {}
            action_status = stored.get("action_status") or "open"

            logged = round(float(hours_by_key.get((uid, day), 0.0)), 2)
            has_log = (uid, day) in log_count_by_key
            cin = att.get("check_in") or att.get("punch_in")
            cout = att.get("check_out") or att.get("punch_out")
            has_checkin = bool(cin)
            has_checkout = bool(cout)
            try:
                worked = float(att.get("work_hours") or 0)
            except (TypeError, ValueError):
                worked = 0.0
            is_wfh = bool(target.get("is_wfh") or att.get("is_wfh"))
            if has_checkout:
                compare_ready = True
            elif is_wfh and not has_checkin:
                worked = float(target.get("expected_hours") or 0)
                compare_ready = True
            else:
                compare_ready = False

            due = person_day_is_due(
                day,
                today,
                target,
                {
                    **att,
                    "has_checkout": has_checkout,
                    "has_checkin": has_checkin,
                    "work_hours": worked,
                    "is_wfh": is_wfh,
                },
            )
            open_case = action_status in ("waiting_on_employee", "waiting_on_reviewer", "escalated") or bool(stored.get("escalated"))
            if not due and not open_case and not (has_log and logged > 0):
                continue

            status, exceptions = classify_day_status(
                logged,
                worked,
                is_full_leave=False,
                has_checkout=has_checkout,
                has_checkin=has_checkin,
                has_log=has_log,
                is_wfh=is_wfh,
                compare_ready=compare_ready,
            )
            is_missing = due and not has_log and (has_checkin or has_checkout or worked > 0 or is_wfh)
            if is_missing:
                status = "red"
                exceptions = [{
                    "type": "missing_log",
                    "hours": worked or target.get("expected_hours") or 0,
                    "severity": "high",
                    "message": "Didn't log",
                    "required_action": "correct",
                }]
            elif status == "green" and not open_case:
                continue

            signed = signed_hours_gap(logged, worked) if compare_ready else 0.0
            if action_status in ("reviewed", "cleared"):
                probe = {
                    "action_status": action_status,
                    "accepted_signed_gap_hours": stored.get("accepted_signed_gap_hours"),
                }
                apply_accepted_gap_state(
                    probe,
                    status=status,
                    exceptions=exceptions,
                    signed_gap=signed,
                    previous_signed_gap=stored.get("signed_gap_hours"),
                )
                if probe.get("action_status") in ("reviewed", "cleared"):
                    continue
                action_status = probe.get("action_status") or "open"
                stored = {**stored, **probe}
                if stored.get("user_id") and stored.get("date"):
                    await db.daily_log_day_scores.update_one(
                        {"user_id": stored["user_id"], "date": stored["date"]},
                        {
                            "$set": {
                                "action_status": action_status,
                                "accepted_signed_gap_hours": probe.get("accepted_signed_gap_hours"),
                                "previously_accepted_signed_gap_hours": probe.get("previously_accepted_signed_gap_hours"),
                                "reopen_note": probe.get("reopen_note") or "",
                                "gap_reopened_at": probe.get("gap_reopened_at"),
                                "employee_notified": False,
                                "escalated": False,
                            }
                        },
                    )

            # Auto-repair legacy false +0:00 reopen notes from DB
            existing_reopen = str(stored.get("reopen_note") or "")
            prev_gap_val = stored.get("previously_accepted_signed_gap_hours")
            if existing_reopen and (
                "+0:00" in existing_reopen
                or "-0:00" in existing_reopen
                or "+0h" in existing_reopen
                or "-0h" in existing_reopen
                or (prev_gap_val is not None and abs(float(prev_gap_val)) <= 0.05)
            ):
                stored["reopen_note"] = ""
                stored["previously_accepted_signed_gap_hours"] = None
                stored["gap_reopened_at"] = None
                if stored.get("user_id") and stored.get("date"):
                    await db.daily_log_day_scores.update_one(
                        {"user_id": stored["user_id"], "date": stored["date"]},
                        {
                            "$set": {
                                "reopen_note": "",
                                "previously_accepted_signed_gap_hours": None,
                                "gap_reopened_at": None,
                            }
                        },
                    )

            row = {
                "id": stored.get("id") or (f"missing:{uid}:{day}" if is_missing else f"gap:{uid}:{day}"),
                "user_id": uid,
                "date": day,
                "full_name": user.get("full_name") or user.get("name") or stored.get("full_name") or "User",
                "department": user.get("department") or "",
                "role": urole,
                "expected_hours": target.get("expected_hours") or 0,
                "logged_hours": logged,
                "worked_hours": worked,
                "gap_hours": abs(signed) if compare_ready else (0 if not is_missing else (worked or target.get("expected_hours") or 0)),
                "signed_gap_hours": signed,
                "has_checkin": has_checkin,
                "has_checkout": has_checkout,
                "compare_ready": compare_ready,
                "tasks_completed": int(tasks_by_key.get((uid, day), 0)),
                "status": stored.get("status") or status,
                "exceptions": exceptions or stored.get("exceptions") or [],
                "action_status": action_status,
                "action_type": stored.get("action_type"),
                "action_by_name": stored.get("action_by_name"),
                "action_by_role": stored.get("action_by_role"),
                "escalated": bool(stored.get("escalated")),
                "employee_notified": bool(stored.get("employee_notified")),
                "member_reason": stored.get("member_reason") or "",
                "previously_accepted_signed_gap_hours": stored.get("previously_accepted_signed_gap_hours"),
                "reopen_note": _clean_reopen_note(
                    stored.get("reopen_note"),
                    stored.get("previously_accepted_signed_gap_hours"),
                ),
            }
            items.append(_to_item(row, is_missing=is_missing))

    items.sort(
        key=lambda r: (
            0 if r.get("escalated") or r.get("action_status") == "escalated" else 1,
            0 if r.get("action_status") == "waiting_on_reviewer" else 1,
            r.get("date") or "",
            r.get("full_name") or "",
        ),
        reverse=False,
    )
    return items


@router.post("/inbox/{score_id}/actions")
async def act_on_exception(
    score_id: str,
    body: ExceptionActionRequest,
    current_user: dict = Depends(require_lead_or_hr),
):
    action = (body.action or "").strip().lower()
    if action not in ("explain", "correct", "review", "escalate", "accept", "ask_again"):
        raise HTTPException(status_code=400, detail="Unknown action. Use explain, correct, review, escalate, accept, or ask_again.")

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

    member = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Employee not found.")
    member_role = str(member.get("role") or "").lower()
    if role == "team_lead":
        if member_role not in ("team_member",):
            raise HTTPException(status_code=403, detail="Team leads only act on their team members.")
        lead_dept = (current_user.get("department") or "").strip().lower()
        mem_dept = (member.get("department") or "").strip().lower()
        if not lead_dept:
            raise HTTPException(status_code=403, detail="Your account has no department assigned.")
        if not mem_dept or lead_dept != mem_dept:
            raise HTTPException(status_code=403, detail="This employee is outside your department.")
        if user_id == current_user.get("id"):
            raise HTTPException(status_code=403, detail="Your own log is reviewed by HR.")
    else:
        if member_role not in ("team_member", "team_lead"):
            raise HTTPException(status_code=403, detail="HR inbox covers team members and team leads only.")
        if user_id == current_user.get("id"):
            raise HTTPException(status_code=403, detail="Your own log is reviewed by Admin.")

    now_iso = datetime.now(timezone.utc).isoformat()
    actor_name = current_user.get("full_name") or current_user.get("name") or "Reviewer"
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
    score_id_value = raw_id if raw_id and not raw_id.startswith(("missing:", "gap:")) else f"dls-{uuid.uuid4().hex[:12]}"
    live = await live_day_hours(user_id, date_str)
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
                "department": member.get("department") or "",
                "role": member_role,
                "action_status": new_status,
                "action_type": action if action in ("explain", "correct", "ask_again") else (score or {}).get("action_type"),
                "action_by": current_user.get("id"),
                "action_by_name": actor_name,
                "action_by_role": role,
                "action_at": now_iso,
                "escalated": set_escalated,
                "employee_notified": already_notified or ping,
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
        await db.notifications.insert_one({
            "id": f"notif_{uuid.uuid4().hex[:10]}",
            "user_id": user_id,
            "title": "Daily log follow-up",
            "message": message,
            "missing_dates": [date_str],
            "created_at": now_iso,
            "read": False,
        })

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
    range: str = Query("today", description="today | week"),
    current_user: dict = Depends(require_management_role),
):
    db = get_database()
    date_str = date or pkt_today()
    range_key = "week" if str(range).lower() == "week" else "today"
    window = await recent_company_workdays(7, start_date=SYSTEM_START_DATE) if range_key == "week" else [date_str]
    parsed_days = [parse_iso_date(d) for d in window if parse_iso_date(d)]
    off_idx = await load_off_day_index(min(parsed_days), max(parsed_days)) if parsed_days else None
    empty = SnapshotResponse(date=date_str, range=range_key)
    if db is None:
        return empty

    users = await db.users.find(
        {"is_active": {"$ne": False}, "role": {"$in": list(LOGGERS_ROLES)}},
        {"_id": 0, "hashed_password": 0},
    ).to_list(500)

    targets = await batch_expected_targets(users, window)
    all_user_ids = [u.get("id") for u in users if u.get("id")]
    att_by_key: dict = {}
    if all_user_ids:
        att_docs_early = await db.attendance_records.find(
            {"user_id": {"$in": all_user_ids}, "date": {"$in": window}},
            {"_id": 0, "user_id": 1, "date": 1, "work_hours": 1, "check_in": 1, "punch_in": 1, "check_out": 1, "punch_out": 1, "status": 1, "is_wfh": 1},
        ).to_list(4000)
        for rec in att_docs_early:
            if rec.get("user_id") and rec.get("date"):
                att_by_key[(rec["user_id"], rec["date"])] = rec

    expected_people = []
    for user in users:
        uid = user.get("id")
        if not uid:
            continue
        skip_all = True
        for day in window:
            target = targets.get((uid, day)) or {}
            att = att_by_key.get((uid, day)) or {}
            try:
                workday = off_idx.is_workday_iso(day) if off_idx is not None else True
            except Exception:
                workday = True
            if workday and not person_day_is_leave(target, att):
                skip_all = False
                break
        if not skip_all:
            expected_people.append(user)

    logger_ids = [u.get("id") for u in expected_people if u.get("id")]
    employees_expected = len(expected_people)

    entries = await db.daily_log_entries.find({"date": {"$in": window}}, {"_id": 0}).to_list(8000)
    logged_hours = 0.0
    tasks_completed = 0
    hours_by_user: dict = {uid: 0.0 for uid in logger_ids}
    days_logged_by_user: dict = {uid: set() for uid in logger_ids}
    submitted_ids = set()
    for entry in entries:
        uid = entry.get("user_id")
        try:
            hrs = float(entry.get("hours_utilized") or 0)
        except (TypeError, ValueError):
            hrs = 0.0
        logged_hours += hrs
        if uid:
            submitted_ids.add(uid)
            if uid in hours_by_user:
                hours_by_user[uid] += hrs
            if uid in days_logged_by_user and entry.get("date"):
                days_logged_by_user[uid].add(entry.get("date"))
        if str(entry.get("task_status") or "") == "Completed":
            tasks_completed += 1

    expected_hours = 0.0
    for user in expected_people:
        uid = user.get("id")
        for day in window:
            target = targets.get((uid, day)) or {}
            att = att_by_key.get((uid, day)) or {}
            if person_day_is_leave(target, att):
                continue
            expected_hours += float(target.get("expected_hours") or 0)

    logs_submitted = 0
    if range_key == "today":
        logs_submitted = sum(1 for u in expected_people if u.get("id") in submitted_ids)
    else:
        logs_submitted = sum(1 for u in expected_people if days_logged_by_user.get(u.get("id")))

    worked_by_user: dict = {uid: 0.0 for uid in logger_ids}
    checkin_by_user: dict = {uid: False for uid in logger_ids}
    checkout_by_user: dict = {uid: False for uid in logger_ids}
    worked_hours = 0.0
    for (uid, day), rec in att_by_key.items():
        if uid not in worked_by_user:
            continue
        if person_day_is_leave(targets.get((uid, day)) or {}, rec):
            continue
        try:
            hrs = float(rec.get("work_hours") or 0)
        except (TypeError, ValueError):
            hrs = 0.0
        worked_hours += hrs
        worked_by_user[uid] += hrs
        if rec.get("check_in") or rec.get("punch_in"):
            checkin_by_user[uid] = True
        if rec.get("check_out") or rec.get("punch_out"):
            checkout_by_user[uid] = True

    unallocated = round(max(0.0, worked_hours - logged_hours), 2)

    scores = await db.daily_log_day_scores.find(
        {"date": {"$in": window}, "status": {"$in": ["amber", "red"]}},
        {"_id": 0},
    ).to_list(2000)
    open_scores = []
    for s in scores:
        if person_day_is_leave(
            targets.get((s.get("user_id"), s.get("date"))) or {},
            att_by_key.get((s.get("user_id"), s.get("date"))),
        ):
            continue
        action = s.get("action_status") or "open"
        if action in ("reviewed", "cleared"):
            probe = {
                "action_status": action,
                "accepted_signed_gap_hours": s.get("accepted_signed_gap_hours"),
            }
            apply_accepted_gap_state(
                probe,
                status=s.get("status") or "amber",
                exceptions=s.get("exceptions") or [],
                signed_gap=float(s.get("signed_gap_hours") or 0),
                previous_signed_gap=s.get("signed_gap_hours"),
            )
            if probe.get("action_status") in ("reviewed", "cleared"):
                continue
        open_scores.append(s)
    open_request_ids = list({
        s.get("user_id")
        for s in scores
        if s.get("user_id") and (s.get("action_status") or "open") in ("waiting_on_employee", "waiting_on_reviewer")
    })

    past_days = [day for day in window if day < date_str]
    past_expected_ids = set()
    for user in expected_people:
        uid = user.get("id")
        for day in past_days:
            target = targets.get((uid, day)) or {}
            if person_day_is_leave(target, att_by_key.get((uid, day))):
                continue
            try:
                if off_idx is not None:
                    if not off_idx.is_workday_iso(day):
                        continue
                else:
                    from datetime import datetime as dt
                    if not is_workday(dt.strptime(day, "%Y-%m-%d")):
                        continue
            except Exception:
                continue
            past_expected_ids.add(uid)
            break

    dept_map: dict = {}
    people: List[SnapshotPerson] = []
    for user in expected_people:
        uid = user.get("id")
        dept = user.get("department") or "Unassigned"
        logged_h = round(hours_by_user.get(uid, 0.0), 2)
        worked_h = round(worked_by_user.get(uid, 0.0), 2)
        did_log = bool(days_logged_by_user.get(uid) if range_key == "week" else uid in submitted_ids)
        has_checkin = bool(checkin_by_user.get(uid))
        has_checkout = bool(checkout_by_user.get(uid))
        compare_ready = has_checkout or worked_h > 0
        signed = signed_hours_gap(logged_h, worked_h) if compare_ready else 0.0
        on_leave = all(
            person_day_is_leave(targets.get((uid, day)) or {}, att_by_key.get((uid, day)))
            for day in window
        )
        due = (not on_leave) and bool(did_log or has_checkout or worked_h > 0 or uid in past_expected_ids)
        if dept not in dept_map:
            dept_map[dept] = {"name": dept, "total": 0, "logged": 0, "missing": 0, "worked_hours": 0.0, "logged_hours": 0.0}
        dept_map[dept]["total"] += 1
        if did_log:
            dept_map[dept]["logged"] += 1
        elif due:
            dept_map[dept]["missing"] += 1
        dept_map[dept]["worked_hours"] += worked_h
        dept_map[dept]["logged_hours"] += logged_h
        people.append(SnapshotPerson(
            user_id=uid,
            full_name=user.get("full_name") or user.get("name") or "User",
            department=dept,
            role=str(user.get("role") or "team_member"),
            logged=did_log,
            worked_hours=worked_h,
            logged_hours=logged_h,
            gap_hours=abs(signed),
            signed_gap_hours=signed,
            has_open_request=uid in open_request_ids,
            has_checkin=has_checkin,
            has_checkout=has_checkout,
            due=due,
            is_full_leave=on_leave,
        ))

    missing_count = sum(1 for p in people if p.due and not p.logged)
    due_count = sum(1 for p in people if p.due)
    exception_count = len(open_scores) + missing_count
    compliance = round((logs_submitted / due_count) * 100, 1) if due_count else 100.0
    noun = "this week" if range_key == "week" else ("today" if date_str == pkt_today() else f"on {date_str}")
    if range_key == "today" and date_str == pkt_today() and due_count == 0:
        summary = (
            f"Today's shift has not started yet. {employees_expected} people expected — "
            "status waits until they check out."
        )
    else:
        summary = (
            f"{logs_submitted} of {employees_expected} people logged {noun}. "
            f"Team was at work {round(worked_hours, 1)}h and accounted for {round(logged_hours, 1)}h in the log."
        )

    highlights: List[SnapshotHighlight] = []
    mismatch = sorted(open_scores, key=lambda s: float(s.get("gap_hours") or 0), reverse=True)
    if mismatch:
        top = mismatch[0]
        highlights.append(SnapshotHighlight(
            label="Biggest hours gap",
            value=f"{top.get('full_name')} · {top.get('logged_hours')}h logged / {top.get('worked_hours') or top.get('expected_hours')}h at work",
            user_name=top.get("full_name"),
        ))
    highlights.append(SnapshotHighlight(label="Didn't log", value=str(missing_count)))

    hr_exceptions = [_to_item(s) for s in open_scores if str(s.get("role") or "").lower() == "hr"]
    top_exceptions = [_to_item(s) for s in open_scores[:8]]

    departments = [
        SnapshotDepartment(
            name=v["name"],
            total=v["total"],
            logged=v["logged"],
            missing=v["missing"],
            worked_hours=round(v["worked_hours"], 2),
            logged_hours=round(v["logged_hours"], 2),
        )
        for v in dept_map.values()
    ]

    due_ids = {p.user_id for p in people if p.due}
    missed_workdays = 0
    for user in expected_people:
        uid = user.get("id")
        logged_set = days_logged_by_user.get(uid) or set()
        for day in window:
            target = targets.get((uid, day)) or {}
            if person_day_is_leave(target, att_by_key.get((uid, day))):
                continue
            try:
                if off_idx is not None:
                    if not off_idx.is_workday_iso(day):
                        continue
                else:
                    from datetime import datetime as dt
                    if not is_workday(dt.strptime(day, "%Y-%m-%d")):
                        continue
            except Exception:
                continue
            if day not in logged_set:
                if day == date_str and uid not in due_ids:
                    continue
                missed_workdays += 1

    return SnapshotResponse(
        date=date_str,
        range=range_key,
        employees_expected=employees_expected,
        logs_submitted=logs_submitted,
        compliance_pct=compliance,
        expected_hours=round(expected_hours, 2),
        logged_hours=round(logged_hours, 2),
        unallocated_hours=unallocated,
        tasks_completed=tasks_completed,
        estimate_variance_hours=0.0,
        rework_hours=0.0,
        exception_count=exception_count,
        summary=summary,
        worked_hours=round(worked_hours, 2),
        missed_workdays=missed_workdays,
        highlights=highlights,
        hr_exceptions=hr_exceptions,
        top_exceptions=top_exceptions,
        departments=departments,
        people=people,
        open_request_user_ids=open_request_ids,
    )

