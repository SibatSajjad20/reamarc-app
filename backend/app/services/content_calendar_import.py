"""Mapped Excel import: preview, apply, history, restore.

Create still assigns system serials. Update matches Record ID then exact serial.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from pymongo.errors import PyMongoError

from app.schemas.content_calendar import (
    ContentCalendarItemCreate,
    clamp_text,
)
from app.services.content_calendar_service import (
    COLLECTION_NAME,
    _now_iso,
    _present_doc,
    bulk_import_items,
    sanitize_spreadsheet_string,
)
from app.services.content_calendar_workflow import (
    can_delete_item,
    can_edit_item,
)

JOBS_COLL = "content_calendar_import_jobs"
SNAPSHOT_TTL_DAYS = 30
MAX_ROWS = 1000

ALLOWED_UPDATE_FIELDS = {
    "campaign_type",
    "creative_type",
    "content_pillar",
    "content_concept",
    "offer",
    "production_direction",
    "primary_text",
    "headlines_hooks",
    "content_on_creative",
    "cta",
    "captions_hashtags",
    "design_due",
    "draft_preview_link",
    "final_asset_link",
    "setup_status",
    "notes",
    "publish_date",
    "channels",
    "content_type",
    "creative_category",
    "posting_type",
}

LOCKED_FIELDS = {
    "stage",
    "approval_status",
    "design_owner",
    "submitted_from",
    "assignee_id",
    "assignee_name",
    "revision_note",
    "share_token",
    "attachments",
    "created_by",
    "created_at",
}

MATCH_FIELDS = {"id", "serial"}


def _job_id() -> str:
    return f"ccimp_{uuid.uuid4().hex[:16]}"


def _norm(val: Any) -> Optional[str]:
    if val is None:
        return None
    text = str(val).strip()
    return text or None


def _values_equal(a: Any, b: Any) -> bool:
    if a is None and (b is None or b == ""):
        return True
    if b is None and (a is None or a == ""):
        return True
    if isinstance(a, list) or isinstance(b, list):
        return [str(x) for x in (a or [])] == [str(x) for x in (b or [])]
    return str(a if a is not None else "") == str(b if b is not None else "")


def _clean_incoming(field: str, value: Any) -> Tuple[Optional[Any], Optional[str]]:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, None
    if field == "channels":
        if isinstance(value, list):
            return [str(ch)[:40] for ch in value[:12]], None
        parts = [p.strip()[:40] for p in str(value).split(",") if p.strip()]
        return parts[:12], None
    if not isinstance(value, str):
        value = str(value)
    value = sanitize_spreadsheet_string(value.strip())
    try:
        return clamp_text(field, value), None
    except ValueError as exc:
        return None, str(exc)


async def _lookup_maps(db, rows: List[Dict[str, Any]]) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    coll = db[COLLECTION_NAME]
    ids = []
    serials = []
    for row in rows:
        values = row.get("values") or row
        rid = _norm(values.get("id"))
        serial = _norm(values.get("serial"))
        if rid:
            ids.append(rid)
        if serial:
            serials.append(serial)
    clauses: List[Dict[str, Any]] = []
    if ids:
        clauses.append({"id": {"$in": ids}})
    if serials:
        clauses.append({"serial": {"$in": serials}})
    by_id: Dict[str, Dict[str, Any]] = {}
    by_serial: Dict[str, Dict[str, Any]] = {}
    if not clauses:
        return by_id, by_serial
    cursor = coll.find({"$or": clauses})
    docs = await cursor.to_list(MAX_ROWS * 2)
    for doc in docs:
        presented = _present_doc(dict(doc))
        if presented.get("id"):
            by_id[str(presented["id"])] = presented
        if presented.get("serial"):
            by_serial[str(presented["serial"])] = presented
            by_serial[str(presented["serial"]).upper()] = presented
    return by_id, by_serial


def _match_existing(
    values: Dict[str, Any],
    by_id: Dict[str, Dict[str, Any]],
    by_serial: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    rid = _norm(values.get("id"))
    if rid and rid in by_id:
        return by_id[rid]
    serial = _norm(values.get("serial"))
    if serial:
        return by_serial.get(serial) or by_serial.get(serial.upper())
    return None


def _selected_update_fields(selected: List[str]) -> List[str]:
    out = []
    for field in selected:
        if field in LOCKED_FIELDS or field in MATCH_FIELDS:
            continue
        if field in ALLOWED_UPDATE_FIELDS:
            out.append(field)
    return out


def _preview_one(
    *,
    row_no: int,
    values: Dict[str, Any],
    mode: str,
    unmatched: str,
    merge_policy: str,
    selected_fields: List[str],
    existing: Optional[Dict[str, Any]],
    viewer: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    errors: List[str] = []
    changes: List[Dict[str, Any]] = []
    fate = "skip"

    if mode == "create":
        fate = "create"
        concept = _norm(values.get("content_concept"))
        if not concept:
            errors.append("Content concept is required for new campaigns.")
        for field in selected_fields:
            if field in MATCH_FIELDS or field in LOCKED_FIELDS:
                continue
            incoming, err = _clean_incoming(field, values.get(field))
            if err:
                errors.append(err)
                continue
            if incoming is None:
                continue
            changes.append({"field": field, "before": None, "after": incoming})
        if errors:
            fate = "error"
        return {
            "row": row_no,
            "fate": fate,
            "serial": None,
            "item_id": None,
            "content_concept": concept,
            "errors": errors,
            "changes": changes,
        }

    if existing is None:
        if mode == "update" or unmatched == "skip":
            fate = "skip" if mode == "mixed" else "error"
            if mode == "update":
                errors.append("No matching campaign for Serial or Record ID.")
                fate = "error"
            return {
                "row": row_no,
                "fate": fate,
                "serial": _norm(values.get("serial")),
                "item_id": _norm(values.get("id")),
                "content_concept": _norm(values.get("content_concept")),
                "errors": errors,
                "changes": [],
            }
        # mixed + insert unmatched
        return _preview_one(
            row_no=row_no,
            values=values,
            mode="create",
            unmatched=unmatched,
            merge_policy=merge_policy,
            selected_fields=selected_fields,
            existing=None,
            viewer=viewer,
        )

    if viewer is not None and not can_edit_item(viewer, existing):
        return {
            "row": row_no,
            "fate": "error",
            "serial": existing.get("serial"),
            "item_id": existing.get("id"),
            "content_concept": existing.get("content_concept"),
            "errors": ["You cannot edit this campaign at its current stage."],
            "changes": [],
        }

    update_fields = _selected_update_fields(selected_fields)
    for field in update_fields:
        incoming, err = _clean_incoming(field, values.get(field))
        if err:
            errors.append(err)
            continue
        if incoming is None:
            continue
        before = existing.get(field)
        if merge_policy == "fill_blanks" and before not in (None, "", []):
            continue
        if _values_equal(before, incoming):
            continue
        changes.append({"field": field, "before": before, "after": incoming})

    if errors:
        fate = "error"
    elif not changes:
        fate = "skip"
    else:
        fate = "update"

    return {
        "row": row_no,
        "fate": fate,
        "serial": existing.get("serial"),
        "item_id": existing.get("id"),
        "content_concept": existing.get("content_concept") or _norm(values.get("content_concept")),
        "stage": existing.get("stage"),
        "errors": errors,
        "changes": changes,
    }


async def preview_import(
    db,
    *,
    payload: Dict[str, Any],
    user_id: Optional[str],
    user_name: Optional[str],
    viewer: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    rows = payload.get("rows") or []
    if not rows:
        raise HTTPException(status_code=400, detail="No rows to preview.")
    if len(rows) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Import is limited to {MAX_ROWS} rows per file.")

    mode = payload.get("mode") or "update"
    unmatched = payload.get("unmatched") or "skip"
    merge_policy = payload.get("merge_policy") or "overwrite"
    selected_fields = list(payload.get("selected_fields") or [])
    if mode == "update" and not selected_fields:
        selected_fields = ["design_due", "publish_date"]

    by_id, by_serial = await _lookup_maps(db, rows)
    previews = []
    for idx, row in enumerate(rows):
        values = row.get("values") or {}
        row_no = int(row.get("row") or idx + 1)
        existing = _match_existing(values, by_id, by_serial) if mode != "create" else None
        previews.append(
            _preview_one(
                row_no=row_no,
                values=values,
                mode=mode,
                unmatched=unmatched,
                merge_policy=merge_policy,
                selected_fields=selected_fields,
                existing=existing,
                viewer=viewer,
            )
        )

    summary = {"create": 0, "update": 0, "skip": 0, "error": 0}
    for p in previews:
        summary[p["fate"]] = summary.get(p["fate"], 0) + 1

    job_id = _job_id()
    now = _now_iso()
    job = {
        "id": job_id,
        "filename": payload.get("filename") or "workbook.xlsx",
        "mode": mode,
        "unmatched": unmatched,
        "merge_policy": merge_policy,
        "mapping": payload.get("mapping") or {},
        "selected_fields": selected_fields,
        "default_client_name": payload.get("default_client_name"),
        "override_client": bool(payload.get("override_client")),
        "rows": rows,
        "preview_rows": previews,
        "summary": summary,
        "status": "previewed",
        "counts": {
            "inserted": 0,
            "updated": 0,
            "skipped": summary["skip"],
            "errors": summary["error"],
        },
        "snapshot": None,
        "created_by": user_id,
        "created_by_name": user_name,
        "created_at": now,
        "applied_at": None,
        "restored_at": None,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=SNAPSHOT_TTL_DAYS)).isoformat(),
    }
    await db[JOBS_COLL].insert_one(job)
    return _present_job(job, include_preview=True)


def _present_job(job: Dict[str, Any], include_preview: bool = False) -> Dict[str, Any]:
    out = {
        "id": job.get("id"),
        "filename": job.get("filename"),
        "mode": job.get("mode"),
        "unmatched": job.get("unmatched"),
        "merge_policy": job.get("merge_policy"),
        "mapping": job.get("mapping") or {},
        "selected_fields": job.get("selected_fields") or [],
        "summary": job.get("summary") or {},
        "status": job.get("status"),
        "counts": job.get("counts") or {},
        "created_by_name": job.get("created_by_name"),
        "created_at": job.get("created_at"),
        "applied_at": job.get("applied_at"),
        "restored_at": job.get("restored_at"),
        "can_restore": job.get("status") == "applied" and bool(job.get("snapshot")),
    }
    if include_preview:
        out["preview_rows"] = job.get("preview_rows") or []
        out["default_client_name"] = job.get("default_client_name")
        out["override_client"] = job.get("override_client")
    return out


async def apply_import(
    db,
    *,
    job_id: str,
    user_id: Optional[str],
    user_name: Optional[str],
    viewer: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    jobs = db[JOBS_COLL]
    job = await jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found.")
    if job.get("status") == "applied":
        return _present_job(job, include_preview=True)
    if job.get("status") not in ("previewed", "failed"):
        raise HTTPException(status_code=400, detail="This import cannot be applied.")

    previews = job.get("preview_rows") or []
    rows = job.get("rows") or []
    row_by_no = {int(r.get("row") or i + 1): r for i, r in enumerate(rows)}
    mode = job.get("mode") or "update"
    merge_policy = job.get("merge_policy") or "overwrite"

    create_items: List[ContentCalendarItemCreate] = []
    pending_updates: List[Tuple[str, Dict[str, Any]]] = []
    snapshot_updates: List[Dict[str, Any]] = []
    now = _now_iso()
    coll = db[COLLECTION_NAME]

    for preview in previews:
        fate = preview.get("fate")
        row_no = int(preview.get("row") or 0)
        raw = row_by_no.get(row_no) or {}
        values = raw.get("values") or {}
        if fate == "create":
            payload = {k: v for k, v in values.items() if k not in MATCH_FIELDS and k not in LOCKED_FIELDS and v not in (None, "")}
            if job.get("override_client") or not payload.get("client_name"):
                payload["client_name"] = job.get("default_client_name")
            if not payload.get("content_concept"):
                payload["content_concept"] = f"Asset {row_no}"
            try:
                create_items.append(ContentCalendarItemCreate(**payload))
            except Exception as exc:
                preview["fate"] = "error"
                preview["errors"] = [str(exc)]
        elif fate == "update":
            item_id = preview.get("item_id")
            if not item_id:
                continue
            current = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
            if not current:
                preview["fate"] = "error"
                preview["errors"] = ["Campaign disappeared before apply."]
                continue
            presented = _present_doc(dict(current))
            if viewer is not None and not can_edit_item(viewer, presented):
                preview["fate"] = "error"
                preview["errors"] = ["You cannot edit this campaign at its current stage."]
                continue
            previous: Dict[str, Any] = {}
            clean_set: Dict[str, Any] = {}
            for change in preview.get("changes") or []:
                field = change.get("field")
                if field not in ALLOWED_UPDATE_FIELDS:
                    continue
                incoming = change.get("after")
                before = presented.get(field)
                if merge_policy == "fill_blanks" and before not in (None, "", []):
                    continue
                previous[field] = before
                clean_set[field] = incoming
            if not clean_set:
                preview["fate"] = "skip"
                continue
            clean_set["updated_at"] = now
            snapshot_updates.append({"id": presented["id"], "previous": previous})
            pending_updates.append((presented["id"], clean_set))

    inserted_ids: List[str] = []
    inserted_count = 0
    updated_count = 0
    errors: List[str] = []

    if create_items:
        result = await bulk_import_items(
            db,
            items=create_items,
            upsert_by_serial=False,
            default_client_name=job.get("default_client_name"),
            user_id=user_id,
            user_name=user_name,
            viewer=viewer,
        )
        inserted_count = int(result.get("inserted_count") or 0)
        errors.extend(result.get("errors") or [])
        inserted_ids = [i for i in (result.get("inserted_ids") or []) if i]

    if pending_updates:
        try:
            for item_id, clean_set in pending_updates:
                result = await coll.update_one({"id": item_id}, {"$set": clean_set})
                if result.modified_count:
                    updated_count += 1
        except PyMongoError as exc:
            errors.append(str(exc))

    summary = job.get("summary") or {}
    job_status = "applied" if not errors or (inserted_count + updated_count) > 0 else "failed"
    snapshot = {
        "updates": snapshot_updates,
        "inserts": inserted_ids,
    }
    counts = {
        "inserted": inserted_count,
        "updated": updated_count,
        "skipped": int(summary.get("skip") or 0),
        "errors": len(errors) + int(summary.get("error") or 0),
    }
    await jobs.update_one(
        {"id": job_id},
        {
            "$set": {
                "status": job_status,
                "snapshot": snapshot,
                "counts": counts,
                "apply_errors": errors,
                "applied_at": _now_iso(),
                "preview_rows": previews,
            }
        },
    )
    job = await jobs.find_one({"id": job_id})
    presented = _present_job(job, include_preview=True)
    presented["apply_errors"] = errors
    return presented


async def list_import_jobs(db, limit: int = 30) -> List[Dict[str, Any]]:
    cursor = db[JOBS_COLL].find({}).sort("created_at", -1).limit(limit)
    jobs = await cursor.to_list(limit)
    return [_present_job(j) for j in jobs]


async def restore_import(
    db,
    *,
    job_id: str,
    viewer: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    jobs = db[JOBS_COLL]
    job = await jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found.")
    if job.get("status") == "restored":
        return _present_job(job)
    if job.get("status") != "applied" or not job.get("snapshot"):
        raise HTTPException(status_code=400, detail="This import has nothing to restore.")

    snapshot = job["snapshot"]
    coll = db[COLLECTION_NAME]
    now = _now_iso()
    restored_updates = 0
    deleted = 0

    for upd in snapshot.get("updates") or []:
        item_id = upd.get("id")
        previous = upd.get("previous") or {}
        if not item_id or not previous:
            continue
        current = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
        if not current:
            continue
        presented = _present_doc(dict(current))
        if viewer is not None and not can_edit_item(viewer, presented):
            continue
        previous = {k: v for k, v in previous.items() if k in ALLOWED_UPDATE_FIELDS}
        previous["updated_at"] = now
        await coll.update_one({"id": item_id}, {"$set": previous})
        restored_updates += 1

    for item_id in snapshot.get("inserts") or []:
        current = await coll.find_one({"id": item_id})
        if not current:
            continue
        presented = _present_doc(dict(current))
        if viewer is not None and not can_delete_item(viewer, presented):
            continue
        await coll.delete_one({"id": item_id})
        deleted += 1

    await jobs.update_one(
        {"id": job_id},
        {
            "$set": {
                "status": "restored",
                "restored_at": now,
                "restore_counts": {"fields_restored": restored_updates, "inserted_deleted": deleted},
            }
        },
    )
    job = await jobs.find_one({"id": job_id})
    out = _present_job(job)
    out["restore_counts"] = {"fields_restored": restored_updates, "inserted_deleted": deleted}
    return out
