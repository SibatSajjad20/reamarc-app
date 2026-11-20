"""Content calendar monthly report (no AI): counting and grouping only.

One Mongo aggregation pulls the few fields the report needs for the report month
and the month after it; everything else is plain Python grouping.

Month placement matches the web overview (``contentCalendarExpectations.ts``):
an item belongs to the month of its ``publish_date``, else its ``design_due``,
else its ``created_at``. The publishing calendar only places items that have a
real ``publish_date``.

Client audience never receives internal stage names, share tokens, notes,
assignees, design owners or revision notes: stages are folded into buckets.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

from app.schemas.content_calendar import canonicalize_creative_type
from app.services.content_calendar_workflow import (
    PIPELINE_STAGES,
    normalize_stage,
    stage_owner,
    stage_scope_clause,
    visible_stages,
)

COLLECTION_NAME = "content_calendar_items"
MONTH_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
AT_RISK_DAYS = 7
LIST_LIMIT = 200
MAX_ITEMS = 5000

# Client-facing buckets, in pipeline order.
BUCKET_ORDER = [
    "posted",
    "approved_scheduled",
    "awaiting_review",
    "in_revision",
    "in_production",
    "rejected",
]
BUCKET_LABELS = {
    "posted": "Posted",
    "approved_scheduled": "Approved & scheduled",
    "awaiting_review": "Awaiting your review",
    "in_revision": "In revision",
    "in_production": "In production",
    "rejected": "Rejected",
}
REVIEW_KIND_LABELS = {
    "Content Client Review": "Content review",
    "Creative Client Review": "Creative review",
}
_STAGE_BUCKET = {
    "Content": "in_production",
    "Content Internal Review": "in_production",
    "Creative Production": "in_production",
    "Creative Internal Review": "in_production",
    "Content Client Review": "awaiting_review",
    "Creative Client Review": "awaiting_review",
    "Content Revision": "in_revision",
    "Creative Revision": "in_revision",
    "Ready to Post": "approved_scheduled",
    "Posted": "posted",
    "Rejected": "rejected",
}


class ReportError(ValueError):
    pass


def stage_bucket(stage: Any) -> str:
    return _STAGE_BUCKET.get(normalize_stage(stage), "in_production")


def parse_month(value: str) -> Tuple[date, date, date]:
    """Return (first day, first day of next month, first day of the month after)."""
    m = MONTH_RE.match(str(value or "").strip())
    if not m:
        raise ReportError("month must be YYYY-MM")
    year, month = int(m.group(1)), int(m.group(2))
    if year < 2000 or year > 2100:
        raise ReportError("month is out of range")
    start = date(year, month, 1)
    nxt = date(year + (month // 12), month % 12 + 1, 1)
    after = date(nxt.year + (nxt.month // 12), nxt.month % 12 + 1, 1)
    return start, nxt, after


def type_key(value: Any) -> str:
    return canonicalize_creative_type(value).strip().lower()


def type_label(value: Any) -> str:
    return canonicalize_creative_type(value) or "Not set"


def _date_part(value: Any) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "").strip()
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", text)
    return m.group(1) if m else ""


def effective_date(item: Dict[str, Any]) -> str:
    return _date_part(item.get("publish_date")) or _date_part(item.get("design_due")) or _date_part(item.get("created_at"))


def _parse_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value or "").strip()
    if not text:
        return None
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        d = _date_part(text)
        if not d:
            return None
        dt = datetime.fromisoformat(d)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _clean(value: Any, limit: int = 160) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def _channels(item: Dict[str, Any]) -> List[str]:
    raw = item.get("channels") or []
    if isinstance(raw, str):
        raw = [raw]
    out: List[str] = []
    for ch in raw:
        c = _clean(ch, 40)
        if c and c not in out:
            out.append(c)
    return out


def _primary_asset(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Same pick as the portal cards: first image, else video, else link, else first."""
    atts = [a for a in (item.get("attachments") or []) if isinstance(a, dict)]
    if not atts:
        return None
    atts.sort(key=lambda a: (0 if a.get("role") == "primary" else 1, a.get("order") or 0))
    pick = (
        next((a for a in atts if a.get("kind") == "image"), None)
        or next((a for a in atts if a.get("kind") == "video"), None)
        or next((a for a in atts if a.get("kind") == "link"), None)
        or atts[0]
    )
    # Only the fields the portal's thumb resolver needs; the same authorized
    # /thumbs and /uploads URLs the client already receives in the list.
    return {
        "kind": pick.get("kind") or "other",
        "url": pick.get("url") or "",
        "thumbnail_url": pick.get("thumbnail_url") or None,
        "google_drive_url": pick.get("google_drive_url") or None,
    }


def _expectation_lines(workspace: Dict[str, Any]) -> List[Dict[str, Any]]:
    exp = workspace.get("content_expectations") or {}
    lines = exp.get("lines") if isinstance(exp, dict) else None
    out = []
    for line in lines or []:
        if not isinstance(line, dict):
            continue
        if type_key(line.get("creative_type")) == "story":
            continue  # stories never count toward the plan (matches the web overview)
        has = bool(line.get("included")) or line.get("expected") is not None or line.get("expected_max") is not None
        if has and str(line.get("creative_type") or "").strip():
            out.append(line)
    return out


def _line_progress(line: Dict[str, Any], posted: int, month_key: str) -> Dict[str, Any]:
    """Port of progressForLine() in contentCalendarExpectations.ts."""
    paused = month_key in (line.get("skip_months") or [])
    mn = line.get("expected")
    mx = line.get("expected_max") if line.get("expected_max") is not None else mn
    if paused:
        return {"expected": None, "paused": True, "delivered": 0, "leftover": 0, "extra": 0}
    if mn is None:
        return {"expected": None, "paused": False, "delivered": posted, "leftover": 0, "extra": 0}
    mn = max(0, int(mn))
    ceiling = mn if mx is None else max(mn, int(mx))
    return {
        "expected": mn,
        "paused": False,
        "delivered": min(posted, mn),
        "leftover": max(0, mn - posted),
        "extra": max(0, posted - ceiling),
    }


def _row_status(expected: Optional[int], paused: bool, posted: int, in_progress: int) -> str:
    if paused:
        return "paused"
    if expected is None:
        return "no_plan"
    if posted >= expected:
        return "met"
    if posted + in_progress >= expected:
        return "on_track"
    return "at_risk"


def _counted(values: Iterable[str]) -> List[Dict[str, Any]]:
    counts: Dict[str, int] = {}
    for v in values:
        counts[v] = counts.get(v, 0) + 1
    return [{"label": k, "count": n} for k, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))]


def client_workspace_ids(viewer: Dict[str, Any]) -> List[str]:
    raw = viewer.get("workspace_ids") or []
    if isinstance(raw, str):
        raw = [raw]
    ids = [str(v).strip() for v in raw if str(v).strip()]
    single = str(viewer.get("workspace_id") or "").strip()
    if single and single not in ids:
        ids.append(single)
    return ids


def _name_regex(name: str) -> Dict[str, Any]:
    collapsed = re.sub(r"\s+", " ", name).strip()
    parts = [re.escape(p) for p in collapsed.split(" ") if p]
    return {"$regex": "^\\s*" + "\\s+".join(parts) + "\\s*$", "$options": "i"}


def build_match(workspace: Dict[str, Any], viewer: Dict[str, Any], lo: str, hi: str) -> Dict[str, Any]:
    ws_id = str(workspace.get("id") or "")
    ws_name = str(workspace.get("name") or "").strip()
    owner_or: List[Dict[str, Any]] = [{"workspace_id": ws_id}]
    if ws_name:
        # Legacy rows without a workspace_id still belong by exact client name,
        # but never rows already linked to a different workspace.
        owner_or.append({
            "workspace_id": {"$in": [None, ""]},
            "client_name": _name_regex(ws_name),
        })
    no_pub = {"$or": [{"publish_date": {"$exists": False}}, {"publish_date": None}, {"publish_date": ""}]}
    no_due = {"$or": [{"design_due": {"$exists": False}}, {"design_due": None}, {"design_due": ""}]}
    in_range = {"$gte": lo, "$lt": hi}
    date_or = [
        {"publish_date": in_range},
        {"$and": [no_pub, {"design_due": in_range}]},
        {"$and": [no_pub, no_due, {"created_at": in_range}]},
    ]
    clauses: List[Dict[str, Any]] = [{"$or": owner_or}, {"$or": date_or}]
    scope = stage_scope_clause(viewer, None)
    if scope:
        clauses.append(scope)
    return {"$and": clauses}


_PROJECTION = {
    "_id": 0,
    "id": 1,
    "serial": 1,
    "stage": 1,
    "creative_type": 1,
    "creative_category": 1,
    "posting_type": 1,
    "content_type": 1,
    "content_pillar": 1,
    "content_concept": 1,
    "channels": 1,
    "publish_date": 1,
    "design_due": 1,
    "created_at": 1,
    "updated_at": 1,
    "design_owner": 1,
    "assignee_name": 1,
    "attachments.kind": 1,
    "attachments.role": 1,
    "attachments.order": 1,
    "attachments.url": 1,
    "attachments.thumbnail_url": 1,
    "attachments.google_drive_url": 1,
}


async def fetch_items(db, workspace: Dict[str, Any], viewer: Dict[str, Any], start: date, after: date) -> List[Dict[str, Any]]:
    match = build_match(workspace, viewer, start.isoformat(), after.isoformat())
    pipeline = [
        {"$match": match},
        {"$project": _PROJECTION},
        {"$limit": MAX_ITEMS},
    ]
    return [doc async for doc in db[COLLECTION_NAME].aggregate(pipeline)]


def build_report(
    items: List[Dict[str, Any]],
    workspace: Dict[str, Any],
    month: str,
    *,
    audience: str,
    viewer: Optional[Dict[str, Any]] = None,
    today: Optional[date] = None,
    generated_at: Optional[datetime] = None,
    logo_url: Optional[str] = None,
) -> Dict[str, Any]:
    start, nxt, after = parse_month(month)
    client_mode = audience == "client"
    gen = generated_at or datetime.now(timezone.utc)
    today = today or gen.date()
    month_key = start.isoformat()[:7]
    next_key = nxt.isoformat()[:7]

    month_items: List[Dict[str, Any]] = []
    next_items: List[Dict[str, Any]] = []
    for it in items:
        d = effective_date(it)
        it["_date"] = d
        it["_stage"] = normalize_stage(it.get("stage"))
        it["_bucket"] = stage_bucket(it["_stage"])
        if d.startswith(month_key):
            month_items.append(it)
        elif d.startswith(next_key):
            next_items.append(it)

    active = [it for it in month_items if it["_bucket"] != "rejected"]
    posted_items = [it for it in month_items if it["_bucket"] == "posted"]

    # --- delivered vs expected by creative type -------------------------------
    lines = _expectation_lines(workspace)
    posted_by_type: Dict[str, int] = {}
    progress_by_type: Dict[str, int] = {}
    label_by_type: Dict[str, str] = {}
    for it in active:
        k = type_key(it.get("creative_type"))
        label_by_type.setdefault(k, type_label(it.get("creative_type")))
        if it["_bucket"] == "posted":
            posted_by_type[k] = posted_by_type.get(k, 0) + 1
        else:
            progress_by_type[k] = progress_by_type.get(k, 0) + 1

    rows: List[Dict[str, Any]] = []
    seen: set = set()
    planned = delivered = leftover = 0
    for line in lines:
        k = type_key(line.get("creative_type"))
        if k in seen:
            continue
        seen.add(k)
        posted = posted_by_type.get(k, 0)
        prog = _line_progress(line, posted, month_key)
        inprog = progress_by_type.get(k, 0)
        if prog["expected"] is not None:
            planned += prog["expected"]
            delivered += prog["delivered"]
            leftover += prog["leftover"]
        rows.append({
            "creative_type": type_label(line.get("creative_type")),
            "expected": prog["expected"],
            "posted": posted,
            "in_progress": inprog,
            "gap": prog["leftover"],
            "extra": prog["extra"],
            "status": _row_status(prog["expected"], prog["paused"], posted, inprog),
        })
    for k in sorted(set(posted_by_type) | set(progress_by_type)):
        if k in seen:
            continue
        posted, inprog = posted_by_type.get(k, 0), progress_by_type.get(k, 0)
        rows.append({
            "creative_type": label_by_type.get(k) or "Not set",
            "expected": None,
            "posted": posted,
            "in_progress": inprog,
            "gap": 0,
            "extra": 0,
            "status": "no_plan",
        })

    # --- pipeline + summary -----------------------------------------------------
    pipeline_counts = {b: 0 for b in BUCKET_ORDER}
    for it in month_items:
        pipeline_counts[it["_bucket"]] += 1
    pipeline = [
        {"key": b, "label": BUCKET_LABELS[b], "count": pipeline_counts[b]}
        for b in BUCKET_ORDER
        if b != "rejected" or pipeline_counts[b]
    ]

    summary = {
        "planned": planned,
        "delivered": delivered,
        "left": leftover,
        "posted": pipeline_counts["posted"],
        "approved_scheduled": pipeline_counts["approved_scheduled"],
        "awaiting_review": pipeline_counts["awaiting_review"],
        "in_revision": pipeline_counts["in_revision"],
        "in_production": pipeline_counts["in_production"],
        "rejected": pipeline_counts["rejected"],
        "total": len(month_items),
        "percent": round(delivered * 100 / planned) if planned else None,
    }

    # --- breakdowns (rejected work left out) -----------------------------------
    channel_vals: List[str] = []
    for it in active:
        chs = _channels(it)
        channel_vals.extend(chs or ["Not set"])
    breakdown = {
        "total": len(active),
        "channels": _counted(channel_vals),
        "content_pillars": _counted(_clean(it.get("content_pillar"), 80) or "Not set" for it in active),
        "creative_categories": _counted(
            _clean(it.get("creative_category") or it.get("posting_type"), 60) or "Organic Creative" for it in active
        ),
        "content_types": _counted(_clean(it.get("content_type"), 40) or "Scheduled" for it in active),
    }

    # --- publishing calendar: real publish dates only --------------------------
    calendar = []
    for it in month_items:
        pd = _date_part(it.get("publish_date"))
        if not pd.startswith(month_key) or it["_bucket"] not in ("posted", "approved_scheduled"):
            continue
        calendar.append({
            "date": pd,
            "creative_type": type_label(it.get("creative_type")),
            "status": it["_bucket"],
        })
    calendar.sort(key=lambda e: e["date"])

    def _title(it: Dict[str, Any]) -> str:
        return _clean(it.get("content_concept"), 140) or _clean(it.get("serial"), 40) or "Untitled"

    def _card(it: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": str(it.get("id") or ""),
            "serial": _clean(it.get("serial"), 40),
            "title": _title(it),
            "creative_type": type_label(it.get("creative_type")),
            "channels": _channels(it),
            "date": it["_date"],
            "thumb": _primary_asset(it),
        }

    posted_list = sorted((_card(it) for it in posted_items), key=lambda c: (c["date"], c["title"]))[:LIST_LIMIT]

    # --- action needed ---------------------------------------------------------
    window = month_items + next_items
    awaiting = []
    for it in window:
        if it["_bucket"] != "awaiting_review":
            continue
        upd = _parse_dt(it.get("updated_at")) or _parse_dt(it.get("created_at"))
        waiting = max(0, (gen - upd).days) if upd else None
        card = _card(it)
        card["review_kind"] = REVIEW_KIND_LABELS.get(it["_stage"], "Review")
        card["days_waiting"] = waiting
        if not client_mode:
            card["stage"] = it["_stage"]
        awaiting.append(card)
    awaiting.sort(key=lambda c: (-(c["days_waiting"] or 0), c["date"]))

    horizon = (today + timedelta(days=AT_RISK_DAYS)).isoformat()
    at_risk = []
    for it in window:
        if it["_bucket"] in ("posted", "rejected"):
            continue
        pd = _date_part(it.get("publish_date"))
        if not pd or pd > horizon:
            continue
        if it["_bucket"] == "approved_scheduled" and pd >= today.isoformat():
            continue  # approved and scheduled on time: not at risk
        card = _card(it)
        card["date"] = pd
        card["days_until"] = (date.fromisoformat(pd) - today).days
        card["status"] = it["_bucket"]
        card["status_label"] = BUCKET_LABELS[it["_bucket"]]
        if not client_mode:
            card["stage"] = it["_stage"]
        at_risk.append(card)
    at_risk.sort(key=lambda c: (c["date"], c["title"]))

    # --- next month --------------------------------------------------------------
    nm_counts: Dict[str, int] = {}
    for it in next_items:
        if it["_bucket"] == "rejected":
            continue
        lbl = type_label(it.get("creative_type"))
        nm_counts[lbl] = nm_counts.get(lbl, 0) + 1
    next_month = {
        "month": next_key,
        "total": sum(nm_counts.values()),
        "by_type": [{"creative_type": k, "count": v} for k, v in sorted(nm_counts.items(), key=lambda kv: (-kv[1], kv[0]))],
    }

    last_day = (nxt - timedelta(days=1)).isoformat()
    report: Dict[str, Any] = {
        "audience": "client" if client_mode else "internal",
        "workspace": {
            "id": str(workspace.get("id") or ""),
            "name": _clean(workspace.get("name"), 120) or "Client",
            "initials": _clean(workspace.get("initials"), 4),
            "logo_url": logo_url,
        },
        "period": {"month": month_key, "start": start.isoformat(), "end": last_day, "today": today.isoformat()},
        "generated_at": gen.isoformat(),
        "has_plan": bool(lines),
        "summary": summary,
        "by_type": rows,
        "pipeline": pipeline,
        "breakdown": breakdown,
        "calendar": calendar,
        "posted_items": posted_list,
        "action_needed": {"awaiting_review": awaiting[:LIST_LIMIT], "at_risk": at_risk[:LIST_LIMIT], "at_risk_days": AT_RISK_DAYS},
        "next_month": next_month,
    }

    if not client_mode:
        allowed = visible_stages(viewer) if viewer is not None else None
        stage_keys = PIPELINE_STAGES if allowed is None else allowed
        stage_counts = {s: 0 for s in stage_keys}
        for it in month_items:
            if it["_stage"] in stage_counts:
                stage_counts[it["_stage"]] += 1
        open_items = [it for it in month_items if it["_bucket"] not in ("posted", "rejected")]
        owners = _counted(
            _clean(it.get("design_owner"), 60) or stage_owner(it["_stage"], it.get("creative_category")) for it in open_items
        )
        assignees = _counted(_clean(it.get("assignee_name"), 80) or "Unassigned" for it in open_items)
        report["internal"] = {
            "stage_counts": [{"stage": s, "count": n} for s, n in stage_counts.items()],
            "internal_review": stage_counts.get("Content Internal Review", 0) + stage_counts.get("Creative Internal Review", 0),
            "workload_by_owner": owners,
            "workload_by_assignee": assignees,
        }

    for it in items:
        for k in ("_date", "_stage", "_bucket"):
            it.pop(k, None)
    return report


def local_today(tz_name: str) -> date:
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("Asia/Karachi")
    return datetime.now(tz).date()
