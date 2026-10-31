from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional, List
import asyncio
import logging

from fastapi import APIRouter, Depends, Request
from zoneinfo import ZoneInfo

from app.core.security import get_current_user
from app.database import get_database
from app.services.company_members import company_member_users
from app.models.user import UserRole
from app.schemas.dashboard import (
    DashboardSummaryResponse,
    CrmSummarySection,
    ContentSummarySection,
    WebsiteSummarySection,
    ApprovalsSummarySection,
    AttendanceTodaySummarySection,
    LogsSummarySection,
    DashboardMetaSection,
)
from app.services.crm_access import is_crm_user, visibility_filter
from app.services.content_calendar_access import can_access_content_calendar
from app.services.website_project_workflow import is_admin_or_ops, is_website_lead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

PKT_TIMEZONE = ZoneInfo("Asia/Karachi")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_and_yesterday_iso():
    now_pkt = datetime.now(PKT_TIMEZONE)
    today_iso = now_pkt.strftime("%Y-%m-%d")
    yesterday_iso = (now_pkt - timedelta(days=1)).strftime("%Y-%m-%d")
    return today_iso, yesterday_iso


async def _build_crm_section(db, user: Dict[str, Any], now_iso: str) -> Optional[CrmSummarySection]:
    from app.services.permissions import load_ctx, resolve, level_gte
    ctx = load_ctx(user)
    if not level_gte("sales", resolve(ctx, "sales"), "own"):
        return None

    vis = await visibility_filter(user)
    base: Dict[str, Any] = dict(vis or {})
    pipeline = [
        {"$match": base},
        {
            "$facet": {
                "stages": [
                    {"$match": {"stage": {"$ne": None}, "outcome": None}},
                    {"$group": {"_id": "$stage", "count": {"$sum": 1}}},
                ],
                "total": [
                    {"$match": {"outcome": None}},
                    {"$count": "count"},
                ],
                "overdueFollowUps": [
                    {
                        "$match": {
                            "outcome": None,
                            "next_follow_up_at": {"$ne": None, "$lt": now_iso},
                        }
                    },
                    {"$count": "count"},
                ],
                "unassigned": [
                    {"$match": {"outcome": None, "assigned_to": None}},
                    {"$count": "count"},
                ],
            }
        },
    ]

    try:
        res = await db.crm_leads.aggregate(pipeline).to_list(1)
        if not res:
            return CrmSummarySection(stages={}, total=0, overdueFollowUps=0, unassigned=0)
        f = res[0]
        stages_map = {row["_id"]: row["count"] for row in (f.get("stages") or []) if row.get("_id")}
        total = f["total"][0]["count"] if f.get("total") and len(f["total"]) > 0 else 0
        overdue = f["overdueFollowUps"][0]["count"] if f.get("overdueFollowUps") and len(f["overdueFollowUps"]) > 0 else 0
        unassigned = f["unassigned"][0]["count"] if f.get("unassigned") and len(f["unassigned"]) > 0 else 0
        return CrmSummarySection(
            stages=stages_map,
            total=total,
            overdueFollowUps=overdue,
            unassigned=unassigned,
        )
    except Exception as exc:
        logger.warning(f"Error building CRM dashboard summary: {exc}")
        return CrmSummarySection(stages={}, total=0, overdueFollowUps=0, unassigned=0)


async def _build_content_section(db, user: Dict[str, Any]) -> Optional[ContentSummarySection]:
    from app.services.permissions import load_ctx, resolve, level_gte
    from app.services.content_calendar_workflow import is_admin as cc_is_admin, is_operations, stage_scope_clause
    ctx = load_ctx(user)
    if not level_gte("content_calendar", resolve(ctx, "content_calendar"), "view"):
        return None

    role = (user.get("role") or "").lower().strip()
    is_lead = role in ("team_lead", "lead", UserRole.TEAM_LEAD.value)
    is_admin_user = cc_is_admin(user) or role in ("admin", UserRole.ADMIN.value)
    is_ops = is_operations(user) or role in ("operations", "ops", UserRole.OPERATIONS.value)

    clauses: List[Dict[str, Any]] = [{"stage": {"$nin": ["Posted", "Rejected"]}}]
    if not is_admin_user and not is_ops:
        scope = stage_scope_clause(user)
        if scope:
            clauses.append(scope)
        if not is_lead:
            uid = user.get("id")
            clauses.append({"$or": [{"assignee_id": uid}, {"design_owner": uid}]})
    match_q: Dict[str, Any] = {"$and": clauses} if len(clauses) > 1 else clauses[0]

    pipeline = [
        {"$match": match_q},
        {"$group": {"_id": "$stage", "count": {"$sum": 1}}},
    ]

    try:
        rows = await db.content_calendar_items.aggregate(pipeline).to_list(100)
        raw_stages: Dict[str, int] = {r["_id"]: r["count"] for r in rows if r.get("_id")}

        # Roll up into standard 5 stages: Content, Creative, ClientReview, Revisions, ReadyToPost
        bucket_stages = {
            "Content": raw_stages.get("Content", 0) + raw_stages.get("Content Internal Review", 0),
            "Creative": raw_stages.get("Creative Production", 0) + raw_stages.get("Creative Internal Review", 0),
            "ClientReview": raw_stages.get("Content Client Review", 0) + raw_stages.get("Creative Client Review", 0),
            "Revisions": raw_stages.get("Content Revision", 0) + raw_stages.get("Creative Revision", 0),
            "ReadyToPost": raw_stages.get("Ready to Post", 0),
        }
        # Merge all raw stages as well so consumers have both
        merged_stages = {**raw_stages, **bucket_stages}
        active_total = sum(raw_stages.values())

        return ContentSummarySection(
            stages=merged_stages,
            activeTotal=active_total,
        )
    except Exception as exc:
        logger.warning(f"Error building Content dashboard summary: {exc}")
        return ContentSummarySection(stages={}, activeTotal=0)


async def _build_website_section(db, user: Dict[str, Any]) -> Optional[WebsiteSummarySection]:
    from app.services.permissions import load_ctx, resolve, level_gte
    ctx = load_ctx(user)
    if not level_gte("website", resolve(ctx, "website"), "view"):
        return None

    match_q: Dict[str, Any] = {"status": {"$ne": "archived"}}
    if not is_admin_or_ops(user) and not is_website_lead(user):
        # Scoped to own projects or tasks
        uid = user.get("id")
        if uid:
            task_docs = await db.website_project_tasks.find({"assignee_id": uid}, {"project_id": 1}).to_list(500)
            pids = list({t["project_id"] for t in task_docs if t.get("project_id")})
            match_q["$or"] = [{"manager_id": uid}, {"id": {"$in": pids}}]

    pipeline = [
        {"$match": match_q},
        {"$group": {"_id": "$stage", "count": {"$sum": 1}}},
    ]

    try:
        rows = await db.website_projects.aggregate(pipeline).to_list(100)
        stages_map: Dict[str, int] = {r["_id"]: r["count"] for r in rows if r.get("_id")}
        total = sum(stages_map.values())
        return WebsiteSummarySection(
            stages=stages_map,
            total=total,
        )
    except Exception as exc:
        logger.warning(f"Error building Website dashboard summary: {exc}")
        return WebsiteSummarySection(stages={}, total=0)


async def _build_approvals_section(db, user: Dict[str, Any]) -> Optional[ApprovalsSummarySection]:
    from app.services.permissions import load_ctx, get_user_primary_department
    import re
    ctx = load_ctx(user)
    role = ctx.role
    is_admin = role in ("admin", UserRole.ADMIN.value)
    is_ops = role in ("operations", UserRole.OPERATIONS.value)
    is_hr = role in ("hr", UserRole.HR.value)
    is_lead = role in ("team_lead", UserRole.TEAM_LEAD.value)

    if not (is_admin or is_ops or is_hr or is_lead):
        return None

    leave_q: Dict[str, Any] = {"status": "pending"}
    punch_q: Dict[str, Any] = {"status": "pending"}
    score_q: Dict[str, Any] = {"status": "non_compliant"}

    if is_lead and not (is_admin or is_ops or is_hr):
        # A5: Scope approvals to primary department
        primary_dept = get_user_primary_department(user)
        if primary_dept:
            dept_rgx = {"$regex": f"^{re.escape(primary_dept)}$", "$options": "i"}
            leave_q["$or"] = [{"primary_department": dept_rgx}, {"department": dept_rgx}]
            score_q["$or"] = [{"primary_department": dept_rgx}, {"department": dept_rgx}]

    try:
        leaves_cnt, punches_cnt, scores_cnt = await asyncio.gather(
            db.leave_requests.count_documents(leave_q),
            db.missed_punch_inquiries.count_documents(punch_q),
            db.daily_log_day_scores.count_documents(score_q),
        )
        return ApprovalsSummarySection(
            pendingLeaves=leaves_cnt,
            pendingMissedPunch=punches_cnt,
            pendingLogExceptions=scores_cnt,
        )
    except Exception as exc:
        logger.warning(f"Error building Approvals dashboard summary: {exc}")
        return ApprovalsSummarySection(pendingLeaves=0, pendingMissedPunch=0, pendingLogExceptions=0)



async def _build_attendance_today_section(db, user: Dict[str, Any], today_iso: str) -> Optional[AttendanceTodaySummarySection]:
    role = (user.get("role") or "").lower().strip()
    is_admin = role in ("admin", UserRole.ADMIN.value)
    is_hr = role in ("hr", UserRole.HR.value)

    if is_admin or is_hr:
        pipeline = [
            {"$match": {"date": today_iso}},
            {
                "$facet": {
                    "present": [
                        {"$match": {"status": {"$in": ["present", "half_day"]}, "is_wfh": {"$ne": True}}},
                        {"$count": "count"},
                    ],
                    "late": [
                        {"$match": {"is_late": True}},
                        {"$count": "count"},
                    ],
                    "remote": [
                        {"$match": {"$or": [{"is_wfh": True}, {"status": "wfh"}]}},
                        {"$count": "count"},
                    ],
                    "absent": [
                        {"$match": {"status": "absent"}},
                        {"$count": "count"},
                    ],
                    "onLeave": [
                        {"$match": {"status": {"$in": ["on_leave", "leave", "short_leave"]}}},
                        {"$count": "count"},
                    ],
                }
            },
        ]
        try:
            res = await db.attendance_records.aggregate(pipeline).to_list(1)
            if not res:
                return AttendanceTodaySummarySection()
            f = res[0]
            return AttendanceTodaySummarySection(
                present=f["present"][0]["count"] if f.get("present") and len(f["present"]) > 0 else 0,
                late=f["late"][0]["count"] if f.get("late") and len(f["late"]) > 0 else 0,
                remote=f["remote"][0]["count"] if f.get("remote") and len(f["remote"]) > 0 else 0,
                absent=f["absent"][0]["count"] if f.get("absent") and len(f["absent"]) > 0 else 0,
                onLeave=f["onLeave"][0]["count"] if f.get("onLeave") and len(f["onLeave"]) > 0 else 0,
            )
        except Exception as exc:
            logger.warning(f"Error building attendance today org summary: {exc}")
            return AttendanceTodaySummarySection()
    else:
        # Self attendance tally
        from app.services.access import is_tracked
        if not is_tracked(user, "attendance"):
            return None
        uid = user.get("id")
        if not uid:
            return None
        rec = await db.attendance_records.find_one({"user_id": uid, "date": today_iso}, {"_id": 0})
        if not rec:
            return AttendanceTodaySummarySection()
        status_val = str(rec.get("status") or "")
        is_wfh = bool(rec.get("is_wfh") or status_val == "wfh")
        is_late = bool(rec.get("is_late"))
        return AttendanceTodaySummarySection(
            present=1 if (status_val in ("present", "half_day") and not is_wfh) else 0,
            late=1 if is_late else 0,
            remote=1 if is_wfh else 0,
            absent=1 if status_val == "absent" else 0,
            onLeave=1 if status_val in ("on_leave", "leave", "short_leave") else 0,
        )


async def _build_logs_section(db, user: Dict[str, Any], today_iso: str, yesterday_iso: str) -> Optional[LogsSummarySection]:
    from app.services.permissions import load_ctx, resolve, level_gte, get_user_primary_department
    import re
    ctx = load_ctx(user)
    log_lvl = resolve(ctx, "daily_log")
    if not level_gte("daily_log", log_lvl, "department"):
        return None

    try:
        user_query: Dict[str, Any] = {
            "is_active": {"$ne": False},
            "role": {"$in": ["team_member", "member", UserRole.TEAM_MEMBER.value]},
        }
        if log_lvl != "all":
            # Team lead: scoped to primary department
            primary_dept = get_user_primary_department(user)
            if not primary_dept:
                return LogsSummarySection(missingToday=0, missingYesterday=0)
            dept_rgx = {"$regex": f"^{re.escape(primary_dept)}$", "$options": "i"}
            user_query["$or"] = [
                {"primary_department": dept_rgx},
                {"department": dept_rgx},
            ]

        # Expected loggers
        logger_users = await company_member_users(
            user_query,
            db=db,
            projection={"_id": 0, "hashed_password": 0},
            limit=500,
        )
        from app.services.access import is_tracked
        logger_users = [u for u in logger_users if is_tracked(u, "daily_log")]
        uids = [u["id"] for u in logger_users if u.get("id")]
        if not uids:
            return LogsSummarySection(missingToday=0, missingYesterday=0)

        # Count users who logged today and yesterday in parallel
        logged_today_uids = await db.daily_log_entries.distinct("user_id", {"user_id": {"$in": uids}, "date": today_iso})
        logged_yesterday_uids = await db.daily_log_entries.distinct("user_id", {"user_id": {"$in": uids}, "date": yesterday_iso})

        total_uids = len(uids)
        missing_today = max(0, total_uids - len(logged_today_uids))
        missing_yesterday = max(0, total_uids - len(logged_yesterday_uids))

        return LogsSummarySection(
            missingToday=missing_today,
            missingYesterday=missing_yesterday,
        )
    except Exception as exc:
        logger.warning(f"Error building Logs dashboard summary: {exc}")
        return LogsSummarySection(missingToday=0, missingYesterday=0)


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_database),
):
    if db is None:
        db = get_database()
    now_iso = _now_iso()
    today_iso, yesterday_iso = _today_and_yesterday_iso()

    crm_task = _build_crm_section(db, current_user, now_iso)
    content_task = _build_content_section(db, current_user)
    website_task = _build_website_section(db, current_user)
    approvals_task = _build_approvals_section(db, current_user)
    attendance_task = _build_attendance_today_section(db, current_user, today_iso)
    logs_task = _build_logs_section(db, current_user, today_iso, yesterday_iso)

    (
        crm_section,
        content_section,
        website_section,
        approvals_section,
        attendance_section,
        logs_section,
    ) = await asyncio.gather(
        crm_task,
        content_task,
        website_task,
        approvals_task,
        attendance_task,
        logs_task,
    )

    meta = DashboardMetaSection(
        generatedAt=now_iso,
        role=str(current_user.get("role") or ""),
        department=current_user.get("department"),
    )

    return DashboardSummaryResponse(
        crm=crm_section,
        content=content_section,
        website=website_section,
        approvals=approvals_section,
        attendanceToday=attendance_section,
        logs=logs_section,
        meta=meta,
    )


@router.get("/bootstrap")
async def get_dashboard_bootstrap(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_database),
):
    """One tenant-scoped, permission-scoped payload for dashboard first paint."""
    from app.services import attendance_service
    from app.services.access import is_tracked
    from app.routers.attendance import extract_client_ip, extract_detected_public_ip

    now_pkt = datetime.now(PKT_TIMEZONE)
    today_iso = now_pkt.strftime("%Y-%m-%d")
    monday = (now_pkt - timedelta(days=now_pkt.weekday())).strftime("%Y-%m-%d")
    role = str(current_user.get("role") or "").lower()
    is_admin = role == UserRole.ADMIN.value
    attendance_enabled = (not is_admin) and is_tracked(current_user, "attendance")
    daily_log_enabled = (not is_admin) and is_tracked(current_user, "daily_log")

    async def _none():
        return None

    async def _weekly_logs():
        if not daily_log_enabled:
            return []
        pipeline = [
            {
                "$match": {
                    "user_id": current_user["id"],
                    "date": {"$gte": monday, "$lte": today_iso},
                }
            },
            {
                "$group": {
                    "_id": "$date",
                    "hours": {"$sum": "$hours_utilized"},
                }
            },
            {"$project": {"_id": 0, "date": "$_id", "hours": 1}},
            {"$sort": {"date": 1}},
        ]
        rows = await db.daily_log_entries.aggregate(pipeline).to_list(7)
        for row in rows:
            row["hours"] = round(float(row.get("hours") or 0), 2)
        return rows

    # Critical path only: punch card, logged-this-week, present-this-month.
    # Never include the full daily matrix or the dashboard summary here.
    tasks = {
        "todayAttendance": attendance_service.get_today_status(
            user=current_user,
            client_ip=extract_client_ip(request),
            detected_public_ip=extract_detected_public_ip(request),
        ) if attendance_enabled else _none(),
        "timesheet": attendance_service.get_my_timesheet(
            user=current_user, year=now_pkt.year, month=now_pkt.month
        ) if attendance_enabled else _none(),
        "weeklyLogs": _weekly_logs(),
    }
    values = await asyncio.gather(*tasks.values())
    payload = dict(zip(tasks.keys(), values))
    payload["matrix"] = None
    payload["summary"] = None
    payload["dayTarget"] = None
    payload["meta"] = {
        "generatedAt": _now_iso(),
        "companyId": current_user.get("company_id"),
        "weekStart": monday,
        "today": today_iso,
    }
    return payload
