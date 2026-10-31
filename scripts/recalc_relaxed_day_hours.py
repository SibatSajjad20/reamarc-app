#!/usr/bin/env python3
"""Recompute attendance hours for relaxed / cricket calendar days.

Use when people checked out before a relaxed day was added, or when an older
heal path rewrote working_hours_minutes without count_from_actual_check_in
(early arrivals clamped to shift start — e.g. 12:00–16:21 shown as 2h 21m on
an afternoon shift).

Default is DRY RUN (counts + sample diffs only). Nothing is written unless:
  --apply
  --yes-recalc-reamarc

Safety:
  - Resolves company by slug "reamarc" (or --company-id that must be reamarc).
  - Explicit database name: reamarc_db (override with --db).
  - Reads MONGO_URL from the environment only — never prints it.
  - Company-scoped: only attendance_records for that company_id (plus legacy
    null company_id docs for Reamarc).
  - Before --apply writes, saves a local JSON backup of every matched doc.

Usage (PowerShell — set MONGO_URL yourself, never paste it into chat):
  python scripts/recalc_relaxed_day_hours.py --date 2026-10-31
  python scripts/recalc_relaxed_day_hours.py --date 2026-10-31 --apply --yes-recalc-reamarc
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from pymongo import MongoClient

REAMARC_SLUG = "reamarc"
DEFAULT_DB = "reamarc_db"
DEFAULT_COMPANY_ID = "company_reamarc"


class _JsonEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, ObjectId):
            return {"$oid": str(o)}
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


def _parse_hhmm(value: Any) -> Optional[int]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    parts = s.split(":")
    if len(parts) < 2:
        return None
    try:
        h = int(parts[0])
        m = int(parts[1])
    except ValueError:
        return None
    if h < 0 or m < 0 or m >= 60:
        return None
    return h * 60 + m


def _fmt_hhmm(mins: int) -> str:
    mins = max(0, int(mins))
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _company_match(company_id: str) -> Any:
    if company_id == DEFAULT_COMPANY_ID:
        return {"$in": [DEFAULT_COMPANY_ID, None]}
    return company_id


def _resolve_company(db, company_id: Optional[str]) -> Tuple[str, str]:
    companies = db.client.get_database(db.name)  # same db; companies may be global
    # Prefer global-style lookup in the same DB first, then try without filter.
    doc = None
    if company_id:
        doc = db.companies.find_one({"id": company_id}) or db.companies.find_one({"_id": company_id})
        if not doc:
            # companies often live in the same reamarc_db
            pass
    if doc is None:
        doc = db.companies.find_one({"slug": REAMARC_SLUG}) or db.companies.find_one(
            {"id": DEFAULT_COMPANY_ID}
        )
    if not doc:
        # Soft fallback when companies collection is empty in a dump
        cid = company_id or DEFAULT_COMPANY_ID
        return cid, REAMARC_SLUG
    slug = str(doc.get("slug") or "").lower()
    cid = str(doc.get("id") or company_id or DEFAULT_COMPANY_ID)
    if slug and slug != REAMARC_SLUG:
        raise SystemExit(f"Refusing: company slug is '{slug}', expected '{REAMARC_SLUG}'.")
    if company_id and cid != company_id and company_id != DEFAULT_COMPANY_ID:
        raise SystemExit(f"Refusing: --company-id {company_id} does not resolve to Reamarc.")
    return cid, slug or REAMARC_SLUG


def _shift_for(db, company_id: str, user_id: str, date_str: str, rec: Dict[str, Any]) -> Dict[str, Any]:
    cid_q = _company_match(company_id)
    assignment = db.user_shift_assignments.find_one(
        {"user_id": user_id, "company_id": cid_q}
    ) or db.user_shift_assignments.find_one({"user_id": user_id})
    shift_id = None
    if assignment:
        for ov in assignment.get("date_overrides") or []:
            if ov.get("date") == date_str and ov.get("shift_id"):
                shift_id = ov["shift_id"]
                break
        shift_id = shift_id or assignment.get("shift_id")
    shift_id = shift_id or rec.get("shift_id")
    shift = None
    if shift_id:
        shift = db.shifts.find_one({"id": shift_id, "company_id": cid_q}) or db.shifts.find_one(
            {"id": shift_id}
        )
    if not shift:
        shift = {
            "id": "shift_afternoon",
            "name": "Afternoon",
            "start_time": "14:00",
            "end_time": "20:00",
            "break_duration_minutes": 0,
            "expected_hours": 6.0,
            "is_night_shift": False,
            "grace_period_minutes": 15,
        }
    return shift


def _calc_minutes(
    cin: str,
    cout: str,
    shift: Dict[str, Any],
    *,
    count_from_actual: bool,
    leave_from: Optional[str],
) -> Dict[str, Any]:
    """Minimal mirror of attendance_calculator for relaxed-day resync in a script."""
    # Import from the app when available (preferred); fall back to local math.
    try:
        repo_root = Path(__file__).resolve().parents[1]
        repo_backend = repo_root / "backend"
        for candidate in (repo_backend, repo_root):
            s = str(candidate)
            if s not in sys.path:
                sys.path.insert(0, s)
        from app.services.attendance_calculator import calculate_daily_attendance

        result = calculate_daily_attendance(
            check_in_time=cin,
            check_out_time=cout,
            shift_start=shift.get("start_time") or "09:30",
            shift_end=shift.get("end_time") or "18:30",
            break_duration_minutes=int(shift.get("break_duration_minutes") or 0),
            break_start_time=shift.get("break_start_time"),
            break_end_time=shift.get("break_end_time"),
            grace_period_minutes=int(shift.get("grace_period_minutes") or 0),
            expected_hours=float(shift.get("expected_hours") or 8.0),
            is_night_shift=bool(shift.get("is_night_shift")),
            count_from_actual_check_in=count_from_actual,
            waive_undertime_after=leave_from,
        )
        return {
            "working_hours_minutes": int(result.work_minutes),
            "work_hours": float(result.work_hours),
            "work_duration_formatted": result.work_duration_formatted,
            "overtime_minutes": int(result.overtime_minutes),
            "overtime_hours": float(result.overtime_hours),
            "overtime_formatted": result.overtime_formatted,
            "undertime_minutes": int(result.undertime_minutes),
            "undertime_hours": float(result.undertime_hours),
            "undertime_formatted": result.undertime_formatted,
            "pending_overtime_minutes": 0,
            "claimed_overtime_minutes": int(result.overtime_minutes),
            "overtime_status": "not_applicable",
        }
    except Exception as exc:
        # Pure fallback: gross span, optional clip to shift start, no break math.
        print(f"warning: calculator import failed ({exc}); using simple span math", file=sys.stderr)
        in_m = _parse_hhmm(cin) or 0
        out_m = _parse_hhmm(cout) or 0
        if out_m < in_m:
            out_m += 1440
        start_m = _parse_hhmm(shift.get("start_time") or "09:30") or 0
        effective = in_m if count_from_actual else max(in_m, start_m)
        gross = max(0, out_m - effective)
        return {
            "working_hours_minutes": gross,
            "work_hours": round(gross / 60.0, 4),
            "work_duration_formatted": _fmt_hhmm(gross),
            "overtime_minutes": 0,
            "overtime_hours": 0.0,
            "overtime_formatted": "+00:00",
            "undertime_minutes": 0,
            "undertime_hours": 0.0,
            "undertime_formatted": "-00:00",
            "pending_overtime_minutes": 0,
            "claimed_overtime_minutes": 0,
            "overtime_status": "not_applicable",
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", required=True, help="YYYY-MM-DD relaxed day to recalc")
    parser.add_argument("--db", default=DEFAULT_DB, help=f"Database name (default {DEFAULT_DB})")
    parser.add_argument("--company-id", default=None, help="Must resolve to Reamarc")
    parser.add_argument("--apply", action="store_true", help="Write updates (default: dry run)")
    parser.add_argument(
        "--yes-recalc-reamarc",
        action="store_true",
        help="Required with --apply as an explicit confirmation",
    )
    parser.add_argument(
        "--backup-dir",
        default=".",
        help="Directory for JSON backup before apply (default: cwd)",
    )
    args = parser.parse_args()

    mongo_url = os.environ.get("MONGO_URL") or os.environ.get("MONGODB_URI")
    if not mongo_url:
        print("ERROR: set MONGO_URL in the environment (do not paste it into chat).", file=sys.stderr)
        return 2
    if args.apply and not args.yes_recalc_reamarc:
        print("ERROR: --apply requires --yes-recalc-reamarc", file=sys.stderr)
        return 2

    date_str = args.date.strip()
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=8000)
    try:
        client.admin.command("ping")
    except Exception as exc:
        print(f"ERROR: cannot reach MongoDB: {exc}", file=sys.stderr)
        return 2

    db = client[args.db]
    company_id, slug = _resolve_company(db, args.company_id)
    print(f"database: {args.db}")
    print(f"company: Reamarc  id={company_id}  slug={slug}")
    print(f"date: {date_str}")

    cid_q = _company_match(company_id)
    cal = db.company_calendar.find_one(
        {
            "date": date_str,
            "event_type": "relaxed_day",
            "company_id": cid_q,
        }
    ) or db.company_calendar.find_one({"date": date_str, "event_type": "relaxed_day"})
    if not cal:
        print("No relaxed_day calendar row for this date in this company. Nothing to do.")
        return 0

    leave_from = str(cal.get("leave_from") or "16:00")
    exclude_ids = {str(x) for x in (cal.get("exclude_user_ids") or []) if x}
    exclude_wfh = bool(cal.get("exclude_wfh") if cal.get("exclude_wfh") is not None else True)
    print(f"relaxed day: title={cal.get('title')!r} leave_from={leave_from} exclude_wfh={exclude_wfh}")

    query = {"date": date_str, "company_id": cid_q}
    recs = list(db.attendance_records.find(query))
    # Also include legacy docs missing company_id when querying with $in that already covers None
    print(f"matched attendance_records: {len(recs)}")

    changes: List[Dict[str, Any]] = []
    for rec in recs:
        cin = rec.get("check_in") or rec.get("punch_in")
        cout = rec.get("check_out") or rec.get("punch_out")
        if not cin or not cout:
            continue
        uid = str(rec.get("user_id") or "")
        if uid in exclude_ids:
            continue
        is_wfh = bool(
            rec.get("is_wfh")
            or str(rec.get("status") or "").lower() == "wfh"
            or str(rec.get("location") or "").lower() == "wfh"
        )
        if exclude_wfh and is_wfh:
            continue
        shift = _shift_for(db, company_id, uid, date_str, rec)
        new_fields = _calc_minutes(
            str(cin),
            str(cout),
            shift,
            count_from_actual=True,
            leave_from=leave_from,
        )
        old_mins = int(rec.get("working_hours_minutes") or 0)
        new_mins = int(new_fields["working_hours_minutes"])
        if old_mins == new_mins and int(rec.get("undertime_minutes") or 0) == int(
            new_fields["undertime_minutes"]
        ):
            continue
        changes.append(
            {
                "user_id": uid,
                "user_name": rec.get("user_name") or rec.get("employee_name"),
                "check_in": cin,
                "check_out": cout,
                "shift": f"{shift.get('start_time')}-{shift.get('end_time')}",
                "old_minutes": old_mins,
                "new_minutes": new_mins,
                "old_formatted": rec.get("work_duration_formatted"),
                "new_formatted": new_fields["work_duration_formatted"],
                "fields": new_fields,
                "_id": rec.get("_id"),
            }
        )

    print(f"records that would change: {len(changes)}")
    for row in changes[:20]:
        print(
            f"  {row['user_name'] or row['user_id']}: "
            f"{row['check_in']}-{row['check_out']} ({row['shift']}) "
            f"{row['old_minutes']}m ({row['old_formatted']}) -> "
            f"{row['new_minutes']}m ({row['new_formatted']})"
        )
    if len(changes) > 20:
        print(f"  ... and {len(changes) - 20} more")

    if not args.apply:
        print("DRY RUN: nothing written. Re-run with --apply --yes-recalc-reamarc to update.")
        return 0

    backup_dir = Path(args.backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = backup_dir / f"relaxed-day-hours-backup-{date_str}-{stamp}.json"
    matched_ids = [c["_id"] for c in changes if c.get("_id") is not None]
    backup_docs = list(db.attendance_records.find({"_id": {"$in": matched_ids}})) if matched_ids else []
    backup_path.write_text(json.dumps(backup_docs, cls=_JsonEncoder, indent=2), encoding="utf-8")
    print(f"backup: {backup_path} ({len(backup_docs)} docs)")

    now_iso = datetime.now(timezone.utc).isoformat()
    updated = 0
    for row in changes:
        fields = dict(row["fields"])
        fields["updated_at"] = now_iso
        if int(fields.get("undertime_minutes") or 0) == 0:
            fields["undertime_reason"] = None
        result = db.attendance_records.update_one(
            {"_id": row["_id"]},
            {"$set": fields},
        )
        updated += int(result.modified_count or 0)
    print(f"updated: {updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
