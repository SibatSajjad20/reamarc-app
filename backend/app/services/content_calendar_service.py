"""
Service layer for Content Calendar module.
Handles MongoDB operations, stage updates, filtering, search, and Excel seeding.
"""
import os
import io
import re
import uuid
import secrets
import logging
import asyncio
import shutil
import tempfile
import subprocess
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from fastapi import UploadFile, HTTPException, status, Request
from pymongo import UpdateOne, IndexModel, ASCENDING

from app.schemas.content_calendar import (
    ContentCalendarItemCreate,
    ContentCalendarItemUpdate,
    BatchUpdateItem,
    BulkImportResponse,
    clamp_text,
    clean_http_link,
    CONTENT_TYPE_OPTIONS,
    CREATIVE_CATEGORY_OPTIONS,
    CAMPAIGN_TYPE_OPTIONS,
    CREATIVE_TYPE_OPTIONS,
    CONTENT_PILLAR_OPTIONS,
    OFFER_OPTIONS,
    CTA_OPTIONS,
    APPROVAL_STATUS_OPTIONS,
    SETUP_STATUS_OPTIONS,
    DESIGN_OWNER_OPTIONS,
    PIPELINE_STAGES,
    DEFAULT_STAGE,
)
from app.services.content_calendar_workflow import (
    WorkflowError,
    can_edit_item,
    can_delete_item,
    can_view_item,
    is_admin,
    is_client,
    is_performance,
    is_content_actor,
    is_content_lead,
    is_creative_actor,
    is_creative_lead,
    is_social_actor,
    is_ad_creative,
    normalize_stage,
    resolve_stage,
    stage_owner,
    stored_stage_aliases,
    visible_stages,
)
from app.core.uploads import (
    save_upload_bytes,
    delete_upload,
    sanitize_svg,
    _guess_media_type,
)


logger = logging.getLogger(__name__)

COLLECTION_NAME = "content_calendar_items"
_indexes_ready = False
_index_lock = asyncio.Lock()


async def ensure_indexes(db) -> None:
    """Index the fields the list, search, and serial lookup actually filter on."""
    global _indexes_ready
    if _indexes_ready or db is None:
        return
    async with _index_lock:
        if _indexes_ready:
            return
        try:
            coll = db[COLLECTION_NAME]
            models = [
                IndexModel([("id", ASCENDING)], name="idx_cc_id"),
                IndexModel([("serial", ASCENDING)], name="idx_cc_serial"),
                IndexModel([("share_token", ASCENDING)], name="idx_cc_share_token", sparse=True),
                IndexModel([("stage", ASCENDING), ("serial", ASCENDING)], name="idx_cc_stage_serial"),
                IndexModel([("client_name", ASCENDING)], name="idx_cc_client"),
                IndexModel([("workspace_id", ASCENDING)], name="idx_cc_workspace"),
                IndexModel([("publish_date", ASCENDING)], name="idx_cc_publish"),
                IndexModel([("client_name", ASCENDING), ("stage", ASCENDING)], name="idx_cc_client_stage"),
            ]
            await coll.create_indexes(models)

            # Backfill persistent share_tokens for existing documents missing them
            try:
                missing_cursor = coll.find(
                    {"$or": [{"share_token": None}, {"share_token": {"$exists": False}}, {"share_token": ""}]},
                    {"_id": 1, "id": 1}
                )
                backfill_ops = []
                async for mdoc in missing_cursor:
                    backfill_ops.append(
                        UpdateOne(
                            {"_id": mdoc["_id"]},
                            {"$set": {"share_token": f"cc_tok_{uuid.uuid4().hex}"}}
                        )
                    )
                if backfill_ops:
                    await coll.bulk_write(backfill_ops, ordered=False)
                    logger.info("Backfilled persistent share_tokens for %d items", len(backfill_ops))
            except Exception as backfill_exc:
                logger.warning("Could not backfill share_tokens: %s", backfill_exc)

            _indexes_ready = True
        except Exception as exc:
            logger.warning("Content calendar index setup skipped: %s", exc)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_generic_drive_icon(url: Optional[str]) -> bool:
    """Detects whether a URL is a generic 16px Google Drive file-type icon rather than a real thumbnail."""
    if not url or not isinstance(url, str):
        return False
    u = url.lower().strip()
    return (
        "ssl.gstatic.com/docs/doclist/images" in u
        or "gstatic.com/docs/doclist/images" in u
        or "drive-thirdparty.googleusercontent.com" in u
        or "/icon_10_" in u
        or "/icon_11_" in u
    )


def _present_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc_id = doc.get("id") or str(doc.get("_id", ""))
    doc["id"] = doc_id
    if "_id" in doc:
        del doc["_id"]
    if not doc.get("client_name"):
        doc["client_name"] = "Apex Transfers LLC"
    doc["stage"] = normalize_stage(doc.get("stage"))
    if doc.get("submitted_from"):
        doc["submitted_from"] = normalize_stage(doc.get("submitted_from"))
    if "attachments" not in doc or not isinstance(doc["attachments"], list):
        doc["attachments"] = []
    else:
        for att in doc["attachments"]:
            t_url = att.get("thumbnail_url")
            if t_url and _is_generic_drive_icon(t_url):
                att["thumbnail_url"] = None
    cat = doc.get("creative_category") or doc.get("posting_type") or "Organic Creative"
    doc["creative_category"] = cat
    if not doc.get("content_type"):
        doc["content_type"] = "Scheduled"
    if not doc.get("design_owner"):
        doc["design_owner"] = stage_owner(doc["stage"], cat)
    if doc.get("notes") and not doc.get("notes_author"):
        doc["notes_author"] = doc.get("created_by_name") or "Team Member"
    return doc


def _viewer_stage_clause(viewer: Optional[Dict[str, Any]], stage: Optional[str]) -> Optional[Dict[str, Any]]:
    """Mongo clause for the viewer's stage scope. None means no extra clause."""
    if viewer is None:
        if stage:
            return {"stage": {"$in": stored_stage_aliases([normalize_stage(stage)])}}
        return None
    allowed = visible_stages(viewer)
    if allowed is not None and len(allowed) == 0:
        return {"stage": "__none__"}
    if stage:
        wanted = normalize_stage(stage)
        if allowed is not None and wanted not in allowed:
            return {"stage": "__none__"}
        return {"stage": {"$in": stored_stage_aliases([wanted])}}
    if allowed is None:
        return None
    return {"stage": {"$in": stored_stage_aliases(allowed)}}


async def get_items(
    db,
    workspace_id: Optional[str] = None,
    client_name: Optional[str] = None,
    stage: Optional[str] = None,
    creative_type: Optional[str] = None,
    approval_status: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 500,
    viewer: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Retrieves items with search, stage breakdown counts, and pagination."""
    if db is None:
        return {"items": [], "total": 0, "stages_count": {s: 0 for s in PIPELINE_STAGES}}

    if not _indexes_ready and db is not None:
        try:
            asyncio.create_task(ensure_indexes(db))
        except Exception as exc:
            logger.warning("Content calendar index setup skipped: %s", exc)

    query: Dict[str, Any] = {}
    if workspace_id:
        query["workspace_id"] = workspace_id

    if client_name:
        query["client_name"] = client_name

    if stage or viewer is not None:
        clause = _viewer_stage_clause(viewer, stage)
        if clause:
            query.update(clause)

    if creative_type:
        query["creative_type"] = creative_type

    if approval_status:
        query["approval_status"] = approval_status

    if viewer and str(viewer.get("role") or "").lower() == "client":
        workspace_ids = [str(value) for value in (viewer.get("workspace_ids") or []) if value]
        if workspace_id and workspace_id not in workspace_ids:
            query["workspace_id"] = "__none__"
        else:
            query["workspace_id"] = {"$in": workspace_ids or ["__none__"]}

    if start_date and end_date:
        query["publish_date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["publish_date"] = {"$gte": start_date}
    elif end_date:
        query["publish_date"] = {"$lte": end_date}

    if search and search.strip():
        q = re.escape(search.strip())
        query["$or"] = [
            {"serial": {"$regex": q, "$options": "i"}},
            {"client_name": {"$regex": q, "$options": "i"}},
            {"content_concept": {"$regex": q, "$options": "i"}},
            {"primary_text": {"$regex": q, "$options": "i"}},
            {"headlines_hooks": {"$regex": q, "$options": "i"}},
            {"captions_hashtags": {"$regex": q, "$options": "i"}},
            {"content_pillar": {"$regex": q, "$options": "i"}},
            {"campaign_type": {"$regex": q, "$options": "i"}},
        ]

    coll = db[COLLECTION_NAME]

    cursor = coll.find(query).sort("serial", 1).skip(skip).limit(limit)

    # Calculate stages counts (scoped to workspace/search if provided)
    base_count_query = {}
    if workspace_id:
        base_count_query["workspace_id"] = workspace_id
    if client_name:
        base_count_query["client_name"] = client_name
    if viewer is not None:
        clause = _viewer_stage_clause(viewer, None)
        if clause:
            base_count_query.update(clause)
    if viewer and str(viewer.get("role") or "").lower() == "client":
        workspace_ids = [str(value) for value in (viewer.get("workspace_ids") or []) if value]
        if workspace_id and workspace_id not in workspace_ids:
            base_count_query["workspace_id"] = "__none__"
        else:
            base_count_query["workspace_id"] = {"$in": workspace_ids or ["__none__"]}
    if search and search.strip():
        q = re.escape(search.strip())
        base_count_query["$or"] = [
            {"serial": {"$regex": q, "$options": "i"}},
            {"client_name": {"$regex": q, "$options": "i"}},
            {"content_concept": {"$regex": q, "$options": "i"}},
            {"primary_text": {"$regex": q, "$options": "i"}},
        ]

    pipeline = [
        {"$match": base_count_query},
        {"$group": {"_id": "$stage", "count": {"$sum": 1}}},
    ]

    async def _fetch_items():
        raw = await cursor.to_list(length=limit)
        missing_uids = [
            doc["created_by"]
            for doc in raw
            if doc.get("created_by") and not doc.get("created_by_name")
        ]
        if missing_uids and db is not None:
            try:
                user_docs = await db["users"].find(
                    {"$or": [{"id": {"$in": missing_uids}}, {"_id": {"$in": missing_uids}}]},
                    {"id": 1, "_id": 1, "full_name": 1, "name": 1}
                ).to_list(len(missing_uids))
                u_map = {}
                for u in user_docs:
                    uid = str(u.get("id") or u.get("_id") or "")
                    uname = str(u.get("full_name") or u.get("name") or "")
                    if uid and uname:
                        u_map[uid] = uname
                for doc in raw:
                    if doc.get("created_by") in u_map and not doc.get("created_by_name"):
                        doc["created_by_name"] = u_map[doc["created_by"]]
            except Exception:
                pass
        return [_present_doc(doc) for doc in raw]

    async def _fetch_counts():
        res = {s: 0 for s in PIPELINE_STAGES}
        async for agg in coll.aggregate(pipeline):
            st = normalize_stage(agg.get("_id"))
            if st in res:
                res[st] += agg.get("count", 0)
        return res

    async def _fetch_total():
        return await coll.count_documents(query)

    items, stages_count, total = await asyncio.gather(
        _fetch_items(),
        _fetch_counts(),
        _fetch_total(),
    )

    return {"items": items, "total": total, "stages_count": stages_count}


async def get_item_by_id(db, item_id: str, viewer: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Fetches a single item by id or serial."""
    if db is None:
        return None
    coll = db[COLLECTION_NAME]
    doc = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
    if not doc:
        return None
    if doc.get("created_by") and not doc.get("created_by_name"):
        try:
            u = await db["users"].find_one(
                {"$or": [{"id": doc["created_by"]}, {"_id": doc["created_by"]}]},
                {"full_name": 1, "name": 1}
            )
            if u:
                doc["created_by_name"] = str(u.get("full_name") or u.get("name") or "")
        except Exception:
            pass
    presented = _present_doc(doc)
    if viewer is not None and not can_view_item(viewer, presented):
        return None

    # Check if any Google Drive attachments need a thumbnail refresh (e.g. video finished encoding)
    from app.services import google_drive_service as gdrive
    if gdrive.configured() and any(
        a.get("google_drive_file_id") and not a.get("thumbnail_url")
        for a in presented.get("attachments", [])
    ):
        needs_update = False
        updated_attachments = []
        for a in presented.get("attachments", []):
            a_copy = dict(a)
            if a_copy.get("google_drive_file_id") and not a_copy.get("thumbnail_url"):
                try:
                    meta = await gdrive.fetch_file_metadata(a_copy["google_drive_file_id"])
                    thumb = meta.get("thumbnailLink") if meta else None
                    if thumb and not _is_generic_drive_icon(thumb):
                        a_copy["thumbnail_url"] = thumb
                        needs_update = True
                except Exception:
                    pass
            updated_attachments.append(a_copy)
        if needs_update:
            presented["attachments"] = updated_attachments
            try:
                await coll.update_one(
                    {"$or": [{"id": item_id}, {"serial": item_id}]},
                    {"$set": {"attachments": updated_attachments}},
                )
            except Exception:
                pass

    return presented


def get_client_abbreviation(client_name: Optional[str]) -> str:
    """Derives a concise 2-3 letter uppercase abbreviation from client name."""
    if not client_name:
        return "AT"
    clean = re.sub(r"[^a-zA-Z0-9\s]", "", str(client_name)).strip()
    words = [w for w in clean.split() if w]
    if not words:
        return "AT"
    legal_suffixes = {
        "llc", "inc", "corp", "corporation", "ltd", "limited", "co", "company",
        "pvt", "private", "plc",
    }
    stop_words = {"and", "the", "of", "for", "in", "to", "a", "an"}
    filtered = [w for w in words if w.lower() not in legal_suffixes]
    if not filtered:
        filtered = words
    meaningful = [w for w in filtered if w.lower() not in stop_words]
    target = meaningful if meaningful else filtered
    if len(target) >= 2:
        return "".join(w[0].upper() for w in target[:3])
    else:
        w = target[0].upper()
        if len(w) <= 3:
            return w
        consonants = [c for c in w[1:] if c not in "AEIOU"]
        if consonants:
            return (w[0] + "".join(consonants))[:3]
        return w[:3]


def format_client_serial(raw_serial: Optional[str], client_name: Optional[str], fallback_num: int = 1) -> str:
    """
    Ensures a serial conforms to 'C' + <ClientAbbr> + '-' + 3-digit number (e.g. CAT-001).
    Normalizes legacy serials like AC-001, AC-097, raw numbers, or existing C*-xxx.
    """
    abbr = get_client_abbreviation(client_name)
    prefix = f"C{abbr}"
    if not raw_serial or not str(raw_serial).strip() or str(raw_serial).upper() == "AUTO":
        return f"{prefix}-{fallback_num:03d}"

    s = str(raw_serial).strip()
    if re.match(rf"^{prefix}-\d{{3,}}$", s, re.IGNORECASE):
        return s.upper()

    m = re.search(r"(\d+)", s)
    if m:
        num = int(m.group(1))
        return f"{prefix}-{num:03d}"

    return f"{prefix}-{fallback_num:03d}"


async def get_next_serial(db, client_name: Optional[str] = None) -> str:
    """
    Auto-generates the next sequential serial ID formatted as:
    'C' + client abbreviation + '-' + 3-digit number (e.g. CAT-001, CAT-002).
    Uses atomic counter increments to prevent race conditions and duplicate serials.
    """
    abbr = get_client_abbreviation(client_name)
    prefix = f"C{abbr}"

    if db is None:
        return f"{prefix}-001"

    counter_coll = None
    if isinstance(db, dict):
        counter_coll = db.get("content_calendar_counters")
    else:
        try:
            counter_coll = db["content_calendar_counters"]
        except Exception:
            counter_coll = None

    if counter_coll is not None and hasattr(counter_coll, "find_one_and_update"):
        try:
            counter_id = f"serial_{abbr.upper()}"
            counter_doc = await counter_coll.find_one({"_id": counter_id})

            if counter_doc is None:
                coll = db[COLLECTION_NAME]
                pattern = f"^{prefix}-(\\d+)$"
                cursor = coll.find({"serial": {"$regex": pattern, "$options": "i"}}, {"serial": 1})
                max_num = 0
                async for doc in cursor:
                    s = doc.get("serial", "")
                    m = re.search(r"-(\d+)$", s)
                    if m:
                        try:
                            num = int(m.group(1))
                            if num > max_num:
                                max_num = num
                        except ValueError:
                            pass
                try:
                    await counter_coll.update_one(
                        {"_id": counter_id},
                        {"$setOnInsert": {"seq": max_num}},
                        upsert=True,
                    )
                except Exception:
                    pass

            res = await counter_coll.find_one_and_update(
                {"_id": counter_id},
                {"$inc": {"seq": 1}},
                upsert=True,
                return_document=True,
            )
            next_num = res.get("seq", 1) if res else 1
            return f"{prefix}-{next_num:03d}"
        except Exception:
            pass

    # Fallback to direct collection max scan if counter collection unavailable (e.g. in test mocks)
    coll = db[COLLECTION_NAME]
    pattern = f"^{prefix}-(\\d+)$"
    cursor = coll.find({"serial": {"$regex": pattern, "$options": "i"}}, {"serial": 1})
    max_num = 0
    async for doc in cursor:
        s = doc.get("serial", "")
        m = re.search(r"-(\d+)$", s)
        if m:
            try:
                num = int(m.group(1))
                if num > max_num:
                    max_num = num
            except ValueError:
                pass

    next_num = max_num + 1
    return f"{prefix}-{next_num:03d}"


async def create_item(
    db,
    payload: ContentCalendarItemCreate,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Creates a new content calendar record with auto-generated serial if missing."""
    coll = db[COLLECTION_NAME]
    now = _now_iso()
    item_id = f"cc_{uuid.uuid4().hex[:12]}"

    doc = payload.model_dump()
    doc["stage"] = DEFAULT_STAGE
    doc["design_owner"] = stage_owner(DEFAULT_STAGE)
    if not doc.get("approval_status") or doc.get("approval_status") == "Review Content":
        doc["approval_status"] = "Content Draft"
    if doc.get("notes"):
        doc["notes_author"] = user_name or "Team Member"
        doc["notes_updated_at"] = now
    doc["submitted_from"] = None
    doc["assignee_id"] = None
    doc["assignee_name"] = None
    doc["revision_note"] = None
    if not doc.get("serial") or not str(doc["serial"]).strip() or doc["serial"].upper() == "AUTO":
        doc["serial"] = await get_next_serial(db, doc.get("client_name"))
    else:
        doc["serial"] = format_client_serial(doc["serial"], doc.get("client_name"))

    doc["share_token"] = secrets.token_urlsafe(24)
    doc["id"] = item_id
    doc["created_by"] = user_id
    doc["created_by_name"] = user_name
    doc["created_at"] = now
    doc["updated_at"] = now

    for k, v in doc.items():
        if isinstance(v, str):
            doc[k] = sanitize_spreadsheet_string(v)

    await coll.insert_one(doc)
    doc["id"] = item_id
    if "_id" in doc:
        del doc["_id"]
    if doc.get("assignee_id"):
        try:
            await notify_content_calendar_event(
                db,
                item=doc,
                action="assign",
                actor={"id": user_id, "full_name": user_name, "role": "team_member"},
                assignee_id=doc.get("assignee_id"),
                assignee_name=doc.get("assignee_name"),
            )
        except Exception:
            pass
    return doc



async def _resolve_workspace_id_for_client(db, client_name: Optional[str]) -> Optional[str]:
    """Finds matching active workspace id for a client name using exact, substring, or keyword matching."""
    if not db or not client_name:
        return None
    c_clean = str(client_name).strip().lower()
    if not c_clean:
        return None
    try:
        workspaces = await db["workspaces"].find(
            {"status": {"$ne": "inactive"}},
            {"id": 1, "name": 1}
        ).to_list(200)
        # 1. Exact match
        for w in workspaces:
            w_name = str(w.get("name") or "").strip().lower()
            if w_name == c_clean:
                return w["id"]
        # 2. Corporate suffix stripped exact match (e.g. "Apex Transfers LLC" vs "Apex Transfers")
        clean_c_corp = re.sub(r"\b(llc|inc|corp|ltd|co|pvt)\b", "", c_clean).strip()
        if clean_c_corp:
            for w in workspaces:
                w_name = str(w.get("name") or "").strip().lower()
                clean_w_corp = re.sub(r"\b(llc|inc|corp|ltd|co|pvt)\b", "", w_name).strip()
                if clean_w_corp and clean_w_corp == clean_c_corp:
                    return w["id"]
        # 3. Multi-token whole word match (at least 2 distinctive tokens >= 3 chars)
        words = [w for w in re.split(r"\W+", c_clean) if len(w) > 2]
        if len(words) >= 2:
            for w in workspaces:
                w_name = str(w.get("name") or "").strip().lower()
                if all(re.search(rf"\b{re.escape(word)}\b", w_name) for word in words):
                    return w["id"]
    except Exception as exc:
        logger.warning("Error resolving workspace for client '%s': %s", client_name, exc)
    return None


async def update_item(
    db,
    item_id: str,
    payload: ContentCalendarItemUpdate,
    viewer: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Updates an existing content calendar item. Auto-reassigns serial if client changes."""
    coll = db[COLLECTION_NAME]
    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    for locked in ("stage", "submitted_from", "assignee_id", "assignee_name", "revision_note"):
        update_data.pop(locked, None)
    if not update_data:
        return await get_item_by_id(db, item_id, viewer=viewer)

    current_doc = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
    if not current_doc:
        return None
    if viewer is not None and not can_view_item(viewer, _present_doc(dict(current_doc))):
        return None
    if viewer is not None and not can_edit_item(viewer, _present_doc(dict(current_doc))):
        raise WorkflowError("You cannot edit this campaign at its current stage.")

    if "client_name" in update_data:
        current_client = current_doc.get("client_name")
        new_client = update_data["client_name"]
        if new_client and new_client != current_client:
            provided_serial = payload.serial
            old_serial = current_doc.get("serial")
            target_prefix = f"C{get_client_abbreviation(new_client)}-"
            if (
                not provided_serial
                or provided_serial.upper() == "AUTO"
                or provided_serial == old_serial
                or not provided_serial.startswith(target_prefix)
            ):
                new_serial = await get_next_serial(db, new_client)
                update_data["serial"] = new_serial

    # Auto-link workspace_id if missing from both update and existing document
    if "workspace_id" not in update_data and not current_doc.get("workspace_id"):
        target_client = update_data.get("client_name") or current_doc.get("client_name")
        resolved_ws = await _resolve_workspace_id_for_client(db, target_client)
        if resolved_ws:
            update_data["workspace_id"] = resolved_ws

    effective_stage = update_data.get("stage") or current_doc.get("stage")
    effective_category = (
        update_data.get("creative_category")
        or update_data.get("posting_type")
        or current_doc.get("creative_category")
        or current_doc.get("posting_type")
    )
    if "stage" in update_data:
        update_data["design_owner"] = stage_owner(update_data["stage"], effective_category)
    elif "creative_category" in update_data or "posting_type" in update_data:
        from app.services.content_calendar_workflow import SOCIAL_STAGES
        if effective_stage in SOCIAL_STAGES:
            update_data["design_owner"] = stage_owner(effective_stage, effective_category)

    if current_doc.get("google_drive_folder_id") and any(
        key in update_data for key in ("client_name", "serial", "content_concept", "workspace_id")
    ):
        from app.services import google_drive_service as gdrive
        if gdrive.configured():
            try:
                renamed = dict(current_doc)
                renamed.update(update_data)
                parent = await gdrive.ensure_client_folder(
                    db, renamed.get("client_name"), renamed.get("workspace_id")
                )
                await gdrive.relocate_item_folder(
                    current_doc["google_drive_folder_id"],
                    parent,
                    gdrive.item_folder_name(renamed),
                )
            except Exception as exc:
                logger.warning("Could not move Google Drive folder for %s: %s", item_id, exc)

    if "notes" in update_data and update_data["notes"] != current_doc.get("notes"):
        u_name = None
        if viewer:
            u_name = viewer.get("full_name") or viewer.get("name") or viewer.get("email")
        update_data["notes_author"] = u_name or current_doc.get("notes_author") or "Team Member"
        update_data["notes_updated_at"] = _now_iso()

    update_data["updated_at"] = _now_iso()

    result = await coll.find_one_and_update(
        {"$or": [{"id": item_id}, {"serial": item_id}]},
        {"$set": update_data},
        return_document=True,
    )
    if result:
        presented_res = _present_doc(result)
        try:
            if "notes" in update_data and update_data["notes"] != current_doc.get("notes"):
                await notify_content_calendar_event(
                    db,
                    item=presented_res,
                    action="comment",
                    actor=viewer,
                    note=update_data["notes"],
                    old_item=_present_doc(dict(current_doc)),
                )
            if "assignee_id" in update_data and update_data["assignee_id"] != current_doc.get("assignee_id"):
                await notify_content_calendar_event(
                    db,
                    item=presented_res,
                    action="assign",
                    actor=viewer,
                    assignee_id=update_data["assignee_id"],
                    assignee_name=update_data.get("assignee_name"),
                    old_item=_present_doc(dict(current_doc)),
                )
        except Exception as err:
            logger.warning("Notification on update failed: %s", err)
        return presented_res
    return None


async def transition_item(
    db,
    item_id: str,
    viewer: Dict[str, Any],
    action: str,
    note: Optional[str] = None,
    assignee_id: Optional[str] = None,
    assignee_name: Optional[str] = None,
    target_stage: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Applies one legal stage action for the current user."""
    from app.services.content_calendar_workflow import resolve_transition

    if db is None:
        return None
    coll = db[COLLECTION_NAME]
    current = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
    if not current:
        return None

    # Auto-link workspace_id if missing so client approval stages aren't blocked
    if not current.get("workspace_id") and current.get("client_name"):
        resolved_ws = await _resolve_workspace_id_for_client(db, current.get("client_name"))
        if resolved_ws:
            current["workspace_id"] = resolved_ws
            await coll.update_one({"$or": [{"id": item_id}, {"serial": item_id}]}, {"$set": {"workspace_id": resolved_ws}})

    presented = _present_doc(dict(current))
    if not can_view_item(viewer, presented):
        return None
    updates = resolve_transition(
        viewer,
        presented,
        action,
        note=note,
        assignee_id=assignee_id,
        assignee_name=assignee_name,
        target_stage=target_stage,
    )
    updates["updated_at"] = _now_iso()
    result = await coll.find_one_and_update(
        {"$or": [{"id": item_id}, {"serial": item_id}]},
        {"$set": updates},
        return_document=True,
    )
    if result:
        presented_res = _present_doc(result)
        try:
            await notify_content_calendar_event(
                db,
                item=presented_res,
                action=action,
                actor=viewer,
                note=note,
                assignee_id=assignee_id,
                assignee_name=assignee_name,
                old_item=presented,
            )
        except Exception as notif_err:
            logger.warning("Content calendar transition notification failed: %s", notif_err)
        return presented_res
    return None


async def list_creative_assignees(db) -> List[Dict[str, str]]:
    """Creative team leads and members a creative lead can assign."""
    if db is None:
        return []
    cursor = db["users"].find(
        {"is_active": {"$ne": False}},
        {"id": 1, "full_name": 1, "name": 1, "department": 1, "departments": 1, "role": 1},
    )
    people: List[Dict[str, str]] = []
    async for doc in cursor:
        probe = {
            "role": doc.get("role"),
            "department": doc.get("department"),
            "departments": doc.get("departments"),
            "is_active": True,
        }
        if not is_creative_actor(probe):
            continue
        people.append({
            "id": str(doc.get("id") or doc.get("_id") or ""),
            "name": str(doc.get("full_name") or doc.get("name") or "Team member"),
        })
    people.sort(key=lambda person: person["name"].lower())
    return people


async def list_content_assignees(db) -> List[Dict[str, str]]:
    """Content team leads and members a content lead can assign."""
    if db is None:
        return []
    cursor = db["users"].find(
        {"is_active": {"$ne": False}},
        {"id": 1, "full_name": 1, "name": 1, "department": 1, "departments": 1, "role": 1},
    )
    people: List[Dict[str, str]] = []
    async for doc in cursor:
        probe = {
            "role": doc.get("role"),
            "department": doc.get("department"),
            "departments": doc.get("departments"),
            "is_active": True,
        }
        if not is_content_actor(probe):
            continue
        people.append({
            "id": str(doc.get("id") or doc.get("_id") or ""),
            "name": str(doc.get("full_name") or doc.get("name") or "Team member"),
        })
    people.sort(key=lambda person: person["name"].lower())
    return people


async def delete_item(db, item_id: str, viewer: Optional[Dict[str, Any]] = None) -> bool:
    """Deletes an item by id or serial, and purges any uploaded assets from storage."""
    coll = db[COLLECTION_NAME]
    current = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
    if not current:
        return False
    if viewer is not None:
        presented = _present_doc(dict(current))
        if not can_view_item(viewer, presented):
            return False
        if not can_delete_item(viewer, presented):
            raise WorkflowError("You do not have permission to delete this campaign.")

    # Clean up any uploaded creative assets
    attachments = current.get("attachments") or []
    for att in attachments:
        if not isinstance(att, dict):
            continue
        seen_urls = set()
        for file_url in (att.get("url"), att.get("thumbnail_url")):
            if not file_url or file_url in seen_urls:
                continue
            seen_urls.add(file_url)
            clean_url = file_url.lstrip("/").replace("api/uploads/", "").replace("uploads/", "")
            if not clean_url.startswith("content_calendar/"):
                continue
            try:
                await delete_upload(db, file_url)
            except Exception as exc:
                logger.warning("Error deleting upload %s on item delete: %s", file_url, exc)
    if current.get("google_drive_folder_id"):
        from app.services import google_drive_service as gdrive
        try:
            await gdrive.delete_file(current["google_drive_folder_id"])
        except Exception as exc:
            logger.warning("Error deleting Drive folder on item delete: %s", exc)

    res = await coll.delete_one({"$or": [{"id": item_id}, {"serial": item_id}]})
    return res.deleted_count > 0


ALLOWED_ASSET_EXTENSIONS = {
    # Images
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
    # Videos
    ".mp4", ".mov", ".webm", ".m4v",
    # Documents
    ".pdf", ".docx", ".doc", ".txt", ".md",
}
MAX_IMAGE_DOC_SIZE = 50 * 1024 * 1024   # 50MB
MAX_VIDEO_SIZE = 250 * 1024 * 1024      # 250MB


def can_manage_assets(viewer: Optional[Dict[str, Any]], item: Dict[str, Any]) -> bool:
    """Determines whether viewer has upload/delete/reorder permissions for creative assets."""
    if viewer is None:
        return True
    if not can_view_item(viewer, item):
        return False
    if is_performance(viewer) or is_client(viewer):
        return False
    if is_admin(viewer):
        return True
    stage = normalize_stage(item.get("stage"))
    if stage in ("Content", "Content Revision", "Internal Review"):
        return is_content_actor(viewer)
    if stage in ("Creative Production", "Creative Internal Review", "Creative Revision"):
        return is_creative_lead(viewer) or is_creative_actor(viewer)
    if stage in ("Ready to Post", "Posted"):
        return is_social_actor(viewer) or is_creative_lead(viewer) or is_creative_actor(viewer)
    return False


def process_video_upload(content: bytes, ext: str) -> Tuple[bytes, Optional[bytes], Optional[int], Optional[int], Optional[float]]:
    """
    Optimizes MP4/MOV videos for instant browser playback by moving the moov atom to the
    beginning (+faststart) and extracts a crisp thumbnail frame.
    Returns (optimized_content, thumbnail_bytes, width, height, duration_seconds).
    """
    ffmpeg_bin = shutil.which("ffmpeg")
    temp_in = None
    temp_out = None
    temp_thumb = None

    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f_in:
            temp_in = f_in.name
            f_in.write(content)

        out_ext = ".mp4" if ext in (".mp4", ".mov", ".m4v") else ext
        with tempfile.NamedTemporaryFile(suffix=out_ext, delete=False) as f_out:
            temp_out = f_out.name

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f_thumb:
            temp_thumb = f_thumb.name

        optimized_content = content
        source_for_thumb = temp_in

        # 1. Faststart pass (moves moov atom to start in ~0.05s with zero re-encoding)
        if ffmpeg_bin and ext in (".mp4", ".mov", ".m4v"):
            try:
                cmd_faststart = [
                    ffmpeg_bin, "-y", "-i", temp_in,
                    "-c", "copy", "-movflags", "+faststart",
                    temp_out
                ]
                res = subprocess.run(cmd_faststart, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
                if res.returncode == 0 and os.path.exists(temp_out) and os.path.getsize(temp_out) > 0:
                    with open(temp_out, "rb") as f_read:
                        optimized_content = f_read.read()
                    source_for_thumb = temp_out
            except Exception as e:
                logger.warning("ffmpeg faststart optimization skipped: %s", e)

        # 2. Extract crisp thumbnail frame
        thumb_bytes = None
        if ffmpeg_bin:
            for timestamp in ("00:00:01", "00:00:00.1", "00:00:00"):
                try:
                    cmd_thumb = [
                        ffmpeg_bin, "-y", "-ss", timestamp, "-i", source_for_thumb,
                        "-vframes", "1", "-q:v", "2", "-vf", "scale='min(800,iw)':-2",
                        temp_thumb
                    ]
                    res = subprocess.run(cmd_thumb, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
                    if res.returncode == 0 and os.path.exists(temp_thumb) and os.path.getsize(temp_thumb) > 0:
                        with open(temp_thumb, "rb") as f_t:
                            thumb_bytes = f_t.read()
                        break
                except Exception:
                    continue

        # 3. Extract dimensions & duration via cv2
        width, height, duration = None, None, None
        try:
            import cv2
            cap = cv2.VideoCapture(source_for_thumb)
            if cap.isOpened():
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or None
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or None
                fps = cap.get(cv2.CAP_PROP_FPS) or 0
                frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
                if fps > 0 and frames > 0:
                    duration = round(frames / fps, 2)

                # Fallback thumbnail if ffmpeg failed or not in PATH
                if not thumb_bytes:
                    success, frame = cap.read()
                    if success and frame is not None:
                        is_ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                        if is_ok:
                            thumb_bytes = buffer.tobytes()
                cap.release()
        except Exception:
            pass

        return optimized_content, thumb_bytes, width, height, duration

    except Exception as exc:
        logger.warning("Video processing failed: %s", exc)
        return content, None, None, None, None
    finally:
        for p in (temp_in, temp_out, temp_thumb):
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except Exception:
                    pass


async def attach_assets(
    db,
    item_id: str,
    files: List[UploadFile],
    role: str = "primary",
    viewer: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Uploads, optimizes, and associates creative assets with a content item."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    coll = db[COLLECTION_NAME]
    doc = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
    if not doc:
        raise HTTPException(status_code=404, detail="Content calendar item not found")

    presented = _present_doc(dict(doc))
    if not can_manage_assets(viewer, presented):
        raise HTTPException(status_code=403, detail="You do not have permission to upload assets for this item.")

    existing_attachments = presented.get("attachments") or []
    current_count = len(existing_attachments)
    new_assets: List[Dict[str, Any]] = []

    user_id = viewer.get("id") or str(viewer.get("_id", "")) if viewer else None
    user_name = viewer.get("full_name") or viewer.get("name") or viewer.get("email") if viewer else None

    from app.services import google_drive_service as gdrive
    use_drive = gdrive.configured()
    drive_folder_id = None
    if use_drive:
        drive_folder_id = await gdrive.ensure_item_folder(db, presented)

    for index, file in enumerate(files):
        filename = (file.filename or "upload").strip()
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_ASSET_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_ASSET_EXTENSIONS))}",
            )

        content = await file.read()
        kind = "image" if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg") else (
            "video" if ext in (".mp4", ".mov", ".webm", ".m4v") else "document"
        )
        max_size = MAX_VIDEO_SIZE if kind == "video" else MAX_IMAGE_DOC_SIZE
        if len(content) > max_size:
            limit_mb = max_size // (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{filename}' exceeds {limit_mb}MB size limit.",
            )

        if ext == ".svg":
            content = sanitize_svg(content)

        width, height, duration_seconds = None, None, None
        thumbnail_bytes = None

        if kind == "video":
            # Optimize video with +faststart for instantaneous browser streaming and extract thumbnail
            content, thumbnail_bytes, width, height, duration_seconds = await asyncio.to_thread(
                process_video_upload, content, ext
            )
        elif kind == "image" and ext != ".svg":
            try:
                from PIL import Image
                with Image.open(io.BytesIO(content)) as img:
                    width, height = img.size
            except Exception:
                pass

        content_type = file.content_type or _guess_media_type(filename)
        asset_id = f"ast_{uuid.uuid4().hex[:10]}"
        safe_fname = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
        relative_key = f"content_calendar/{presented['id']}/{asset_id}_{safe_fname}"
        drive_file_id = None
        drive_url = None
        drive_thumb_id = None

        if use_drive:
            uploaded = await gdrive.upload_bytes(drive_folder_id, safe_fname, content, content_type)
            drive_file_id = uploaded.get("id")
            drive_url = uploaded.get("webViewLink")
            stored_url = gdrive.public_path(drive_file_id, safe_fname)
        else:
            stored_url = await save_upload_bytes(
                db,
                relative_key=relative_key,
                content=content,
                original_name=filename,
                content_type=content_type,
                extra_metadata={
                    "workspace_id": presented.get("workspace_id"),
                    "uploaded_by": user_id,
                    "item_id": presented["id"],
                },
            )

        thumbnail_url = stored_url if kind == "image" else None
        if kind == "video" and thumbnail_bytes:
            if use_drive:
                thumb_upload = await gdrive.upload_bytes(
                    drive_folder_id, f"{asset_id}_thumb.jpg", thumbnail_bytes, "image/jpeg"
                )
                drive_thumb_id = thumb_upload.get("id")
                thumbnail_url = gdrive.public_path(drive_thumb_id, f"{asset_id}_thumb.jpg")
            else:
                thumb_key = f"content_calendar/{presented['id']}/{asset_id}_thumb.jpg"
                thumbnail_url = await save_upload_bytes(
                    db,
                    relative_key=thumb_key,
                    content=thumbnail_bytes,
                    original_name=f"{safe_fname}_thumb.jpg",
                    content_type="image/jpeg",
                    extra_metadata={
                        "workspace_id": presented.get("workspace_id"),
                        "uploaded_by": user_id,
                        "item_id": presented["id"],
                    },
                )

        item_role = role
        # Auto-tag as carousel slide if multiple assets uploaded and role is primary/carousel
        if len(files) > 1 and role in ("primary", "carousel_slide"):
            item_role = "carousel_slide"

        new_assets.append({
            "id": asset_id,
            "url": stored_url,
            "filename": filename,
            "size_bytes": len(content),
            "content_type": content_type,
            "kind": kind,
            "role": item_role,
            "order": current_count + index,
            "uploaded_at": _now_iso(),
            "uploaded_by": user_name or user_id,
            "width": width,
            "height": height,
            "duration_seconds": duration_seconds,
            "thumbnail_url": thumbnail_url,
            "google_drive_file_id": drive_file_id,
            "google_drive_url": drive_url,
            "google_drive_thumb_file_id": drive_thumb_id,
        })

    now_str = _now_iso()
    await coll.update_one(
        {"id": presented["id"]},
        {
            "$push": {"attachments": {"$each": new_assets}},
            "$set": {"updated_at": now_str},
        },
    )

    updated_doc = await coll.find_one({"id": presented["id"]})
    return _present_doc(dict(updated_doc))


async def attach_drive_assets(
    db,
    item_id: str,
    files: List[Any],
    default_role: str = "primary",
    viewer: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Attaches files picked from Google Drive (or uploaded via Google Picker) to a content calendar item."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    coll = db[COLLECTION_NAME]
    doc = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
    if not doc:
        raise HTTPException(status_code=404, detail="Content calendar item not found")

    presented = _present_doc(dict(doc))
    if not can_manage_assets(viewer, presented):
        raise HTTPException(status_code=403, detail="You do not have permission to attach assets for this item.")

    existing_attachments = presented.get("attachments") or []
    current_count = len(existing_attachments)
    new_assets: List[Dict[str, Any]] = []

    user_id = viewer.get("id") or str(viewer.get("_id", "")) if viewer else None
    user_name = viewer.get("full_name") or viewer.get("name") or viewer.get("email") if viewer else None

    from app.services import google_drive_service as gdrive
    if gdrive.configured():
        try:
            await gdrive.ensure_item_folder(db, presented)
        except Exception as exc:
            logger.warning("Could not ensure item folder for drive assets: %s", exc)

    for index, raw_file in enumerate(files):
        f = raw_file.model_dump() if hasattr(raw_file, "model_dump") else dict(raw_file)
        drive_file_id = f.get("id")
        if not drive_file_id:
            continue

        filename = (f.get("name") or f.get("filename") or "drive_file").strip()
        safe_fname = re.sub(r"[^a-zA-Z0-9._-]", "_", filename) or "drive_file"
        mime_type = f.get("mime_type") or f.get("mimeType")
        size_bytes = f.get("size_bytes") or f.get("size") or 0
        drive_url = f.get("url") or f.get("webViewLink")
        thumbnail_url = f.get("thumbnail_url") or f.get("thumbnailLink")
        if thumbnail_url and _is_generic_drive_icon(thumbnail_url):
            thumbnail_url = None
        role = f.get("role") or default_role

        if gdrive.configured():
            try:
                meta = await gdrive.fetch_file_metadata(drive_file_id)
                if meta:
                    filename = meta.get("name") or filename
                    safe_fname = re.sub(r"[^a-zA-Z0-9._-]", "_", filename) or safe_fname
                    mime_type = meta.get("mimeType") or mime_type
                    size_bytes = int(meta.get("size") or size_bytes or 0)
                    drive_url = meta.get("webViewLink") or drive_url
                    thumb = meta.get("thumbnailLink")
                    if thumb and not _is_generic_drive_icon(thumb):
                        thumbnail_url = thumb
            except Exception as exc:
                logger.info("Drive file meta fetch non-fatal: %s", exc)

        ext = Path(filename).suffix.lower()
        if (mime_type and mime_type.startswith("image/")) or ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"):
            kind = "image"
        elif (mime_type and mime_type.startswith("video/")) or ext in (".mp4", ".mov", ".webm", ".m4v"):
            kind = "video"
        elif (mime_type and "google-apps" in mime_type) or ext in (".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".csv"):
            kind = "document"
        else:
            kind = "document"

        stored_url = gdrive.public_path(drive_file_id, safe_fname)
        asset_id = f"ast_{uuid.uuid4().hex[:10]}"

        item_role = role
        if len(files) > 1 and role in ("primary", "carousel_slide"):
            item_role = "carousel_slide"

        new_assets.append({
            "id": asset_id,
            "url": stored_url,
            "filename": filename,
            "size_bytes": size_bytes,
            "content_type": mime_type or _guess_media_type(filename),
            "kind": kind,
            "role": item_role,
            "order": current_count + index,
            "uploaded_at": _now_iso(),
            "uploaded_by": user_name or user_id,
            "width": None,
            "height": None,
            "duration_seconds": None,
            "thumbnail_url": thumbnail_url or (stored_url if kind == "image" else None),
            "google_drive_file_id": drive_file_id,
            "google_drive_url": drive_url,
            "google_drive_thumb_file_id": None,
        })

    if not new_assets:
        return presented

    now_str = _now_iso()
    await coll.update_one(
        {"id": presented["id"]},
        {
            "$push": {"attachments": {"$each": new_assets}},
            "$set": {"updated_at": now_str},
        },
    )
    updated_doc = await coll.find_one({"id": presented["id"]})
    return _present_doc(dict(updated_doc))


async def attach_link(
    db,
    item_id: str,
    url: str,
    title: str,
    role: str = "primary",
    viewer: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Adds an external deliverable link (Figma, Canva, Drive, Loom, etc.) as a tracked asset."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    coll = db[COLLECTION_NAME]
    doc = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
    if not doc:
        raise HTTPException(status_code=404, detail="Content calendar item not found")

    presented = _present_doc(dict(doc))
    if not can_manage_assets(viewer, presented):
        raise HTTPException(status_code=403, detail="You do not have permission to manage assets for this item.")

    clean_url = clean_http_link(url)
    if not clean_url:
        raise HTTPException(status_code=400, detail="A valid web URL (http:// or https://) is required.")

    user_id = viewer.get("id") or str(viewer.get("_id", "")) if viewer else None
    user_name = viewer.get("full_name") or viewer.get("name") or viewer.get("email") if viewer else None
    existing_attachments = presented.get("attachments") or []

    asset_id = f"ast_{uuid.uuid4().hex[:10]}"
    display_title = title.strip() or clean_url

    new_asset = {
        "id": asset_id,
        "url": clean_url,
        "filename": display_title,
        "size_bytes": 0,
        "content_type": "text/uri-list",
        "kind": "link",
        "role": role,
        "order": len(existing_attachments),
        "uploaded_at": _now_iso(),
        "uploaded_by": user_name or user_id,
        "width": None,
        "height": None,
        "duration_seconds": None,
        "thumbnail_url": None,
    }

    now_str = _now_iso()
    await coll.update_one(
        {"id": presented["id"]},
        {
            "$push": {"attachments": new_asset},
            "$set": {"updated_at": now_str},
        },
    )

    updated_doc = await coll.find_one({"id": presented["id"]})
    return _present_doc(dict(updated_doc))


async def backfill_missing_video_thumbnails(db) -> int:
    """Backfills thumbnails and faststart optimization for existing videos that lack a thumbnail."""
    if db is None:
        return 0
    coll = db[COLLECTION_NAME]
    cursor = coll.find({"attachments.kind": "video"})
    count = 0
    from app.core.uploads import uploads_root, normalize_upload_key

    async for doc in cursor:
        attachments = doc.get("attachments") or []
        modified = False
        for att in attachments:
            if att.get("kind") == "video" and not att.get("thumbnail_url"):
                v_url = att.get("url") or ""
                try:
                    rel = normalize_upload_key(v_url)
                    disk_path = uploads_root() / rel
                    if disk_path.is_file():
                        raw = disk_path.read_bytes()
                        ext = disk_path.suffix.lower()
                        opt, thumb, w, h, dur = await asyncio.to_thread(process_video_upload, raw, ext)
                        if opt != raw:
                            disk_path.write_bytes(opt)
                        if thumb:
                            t_key = f"content_calendar/{doc['id']}/{att['id']}_thumb.jpg"
                            t_url = await save_upload_bytes(
                                db,
                                relative_key=t_key,
                                content=thumb,
                                original_name=f"{att.get('filename')}_thumb.jpg",
                                content_type="image/jpeg",
                            )
                            att["thumbnail_url"] = t_url
                        if w:
                            att["width"] = w
                        if h:
                            att["height"] = h
                        if dur:
                            att["duration_seconds"] = dur
                        modified = True
                except Exception as exc:
                    logger.warning("Backfill video failed for %s: %s", v_url, exc)
        if modified:
            await coll.update_one({"id": doc["id"]}, {"$set": {"attachments": attachments}})
            count += 1
    return count



async def delete_asset(
    db,
    item_id: str,
    asset_id: str,
    viewer: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Deletes an asset by ID from an item and removes the file from storage."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    coll = db[COLLECTION_NAME]
    doc = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
    if not doc:
        raise HTTPException(status_code=404, detail="Content calendar item not found")

    presented = _present_doc(dict(doc))
    if not can_manage_assets(viewer, presented):
        raise HTTPException(status_code=403, detail="You do not have permission to delete assets for this item.")

    attachments = presented.get("attachments") or []
    target_asset = next((a for a in attachments if a.get("id") == asset_id), None)
    if not target_asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Clean up storage
    seen_urls = set()
    for file_url in (target_asset.get("url"), target_asset.get("thumbnail_url")):
        if not file_url or file_url in seen_urls:
            continue
        seen_urls.add(file_url)
        try:
            await delete_upload(db, file_url)
        except Exception as exc:
            logger.warning("Error deleting upload for %s: %s", file_url, exc)

    # Filter out and re-index order
    remaining = [a for a in attachments if a.get("id") != asset_id]
    for idx, a in enumerate(remaining):
        a["order"] = idx

    now_str = _now_iso()
    await coll.update_one(
        {"id": presented["id"]},
        {
            "$set": {
                "attachments": remaining,
                "updated_at": now_str,
            }
        },
    )

    updated_doc = await coll.find_one({"id": presented["id"]})
    return _present_doc(dict(updated_doc))


async def reorder_assets(
    db,
    item_id: str,
    asset_ids: List[str],
    viewer: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Reorders the attachments list according to asset_ids order."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    coll = db[COLLECTION_NAME]
    doc = await coll.find_one({"$or": [{"id": item_id}, {"serial": item_id}]})
    if not doc:
        raise HTTPException(status_code=404, detail="Content calendar item not found")

    presented = _present_doc(dict(doc))
    if not can_manage_assets(viewer, presented):
        raise HTTPException(status_code=403, detail="You do not have permission to reorder assets for this item.")

    attachments = presented.get("attachments") or []
    asset_map = {a.get("id"): a for a in attachments if a.get("id")}

    reordered: List[Dict[str, Any]] = []
    seen = set()
    for aid in asset_ids:
        if aid in asset_map and aid not in seen:
            item_asset = asset_map[aid]
            item_asset["order"] = len(reordered)
            reordered.append(item_asset)
            seen.add(aid)

    # Append any remaining assets not included in asset_ids
    for a in attachments:
        aid = a.get("id")
        if aid and aid not in seen:
            a["order"] = len(reordered)
            reordered.append(a)
            seen.add(aid)

    now_str = _now_iso()
    await coll.update_one(
        {"id": presented["id"]},
        {
            "$set": {
                "attachments": reordered,
                "updated_at": now_str,
            }
        },
    )

    updated_doc = await coll.find_one({"id": presented["id"]})
    return _present_doc(dict(updated_doc))



SETTINGS_COLLECTION = "content_calendar_settings"


def get_constants() -> Dict[str, Any]:
    """Returns dropdown options and pipeline stages."""
    return {
        "campaign_types": list(CAMPAIGN_TYPE_OPTIONS),
        "creative_types": list(CREATIVE_TYPE_OPTIONS),
        "content_types": list(CONTENT_TYPE_OPTIONS),
        "creative_categories": list(CREATIVE_CATEGORY_OPTIONS),
        "content_pillars": list(CONTENT_PILLAR_OPTIONS),
        "offers": list(OFFER_OPTIONS),
        "ctas": list(CTA_OPTIONS),
        "approval_statuses": list(APPROVAL_STATUS_OPTIONS),
        "setup_statuses": list(SETUP_STATUS_OPTIONS),
        "pipeline_stages": list(PIPELINE_STAGES),
        "design_owners": list(DESIGN_OWNER_OPTIONS),
    }


async def get_constants_from_db(db=None) -> Dict[str, Any]:
    """Returns dropdown options and pipeline stages, taking into account any custom settings saved in MongoDB."""
    base = get_constants()
    if db is None:
        return base
    try:
        doc = await db[SETTINGS_COLLECTION].find_one({"_id": "field_constants"})
        if doc:
            for k in ["creative_types", "campaign_types", "content_types", "creative_categories", "content_pillars", "offers", "ctas", "approval_statuses", "setup_statuses", "design_owners"]:
                if k in doc and isinstance(doc[k], list) and len(doc[k]) > 0:
                    base[k] = list(doc[k])
    except Exception as exc:
        logger.warning("Could not read custom constants: %s", exc)
    return base


async def update_constants(db, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Updates custom dropdown options such as creative_types in MongoDB and returns updated constants."""
    base = await get_constants_from_db(db)
    if db is None:
        return base
    to_save = {}
    valid_keys = ["creative_types", "campaign_types", "content_types", "creative_categories", "content_pillars", "offers", "ctas", "approval_statuses", "setup_statuses", "design_owners"]
    for k in valid_keys:
        if k in updates and updates[k] is not None and isinstance(updates[k], list):
            cleaned = []
            seen = set()
            for item in updates[k]:
                s = str(item).strip()
                if s and s.lower() not in seen:
                    cleaned.append(s)
                    seen.add(s.lower())
            if cleaned:
                to_save[k] = cleaned
                base[k] = cleaned
    if to_save:
        await db[SETTINGS_COLLECTION].update_one(
            {"_id": "field_constants"},
            {"$set": {**to_save, "updated_at": _now_iso()}},
            upsert=True,
        )
    return base


async def seed_from_excel_if_needed(db, excel_path: Optional[str] = None, force: bool = False) -> int:
    """
    Parses 'Apex Campaign Content Plan.xlsx' and loads the 97 campaign records into MongoDB.
    Runs on startup if the collection is empty, or explicitly when force=True.
    """
    if db is None:
        return 0

    coll = db[COLLECTION_NAME]
    existing_count = await coll.count_documents({})
    if existing_count > 0 and not force:
        logger.info(f"Content calendar collection already has {existing_count} records. Skipping seed.")
        return 0

    # Locate Excel file
    possible_paths = [
        excel_path,
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "Apex Campaign Content Plan.xlsx"),
        os.path.join(os.getcwd(), "Apex Campaign Content Plan.xlsx"),
        os.path.join(os.path.dirname(os.getcwd()), "Apex Campaign Content Plan.xlsx"),
    ]
    target_file = None
    for p in possible_paths:
        if p and os.path.exists(p):
            target_file = p
            break

    if not target_file:
        logger.warning("Apex Campaign Content Plan.xlsx not found for seeding.")
        return 0

    try:
        import openpyxl
    except ImportError:
        logger.error("openpyxl is not installed. Cannot seed content calendar from Excel.")
        return 0

    wb = openpyxl.load_workbook(target_file, data_only=True)
    if "Production & Approval" not in wb.sheetnames:
        logger.warning("'Production & Approval' sheet not found in Excel file.")
        return 0

    sheet = wb["Production & Approval"]

    now = _now_iso()
    today = datetime.now(timezone.utc).date()

    seeded_records = []
    # Data starts at row 3
    for r in range(3, sheet.max_row + 1):
        raw_serial = sheet.cell(row=r, column=1).value
        if not raw_serial or not str(raw_serial).strip():
            continue

        raw_serial_str = str(raw_serial).strip()
        client_name = "Apex Transfers LLC"
        serial_str = format_client_serial(raw_serial_str, client_name, fallback_num=r - 2)
        campaign_type = sheet.cell(row=r, column=2).value
        creative_type = sheet.cell(row=r, column=3).value
        content_pillar = sheet.cell(row=r, column=4).value
        content_concept = sheet.cell(row=r, column=5).value
        offer = sheet.cell(row=r, column=6).value
        production_direction = sheet.cell(row=r, column=7).value
        primary_text = sheet.cell(row=r, column=8).value
        headlines_hooks = sheet.cell(row=r, column=9).value
        content_on_creative = sheet.cell(row=r, column=10).value
        cta = sheet.cell(row=r, column=11).value
        captions_hashtags = sheet.cell(row=r, column=12).value
        design_owner = sheet.cell(row=r, column=13).value
        design_due = sheet.cell(row=r, column=14).value
        draft_link = sheet.cell(row=r, column=15).value
        final_link = sheet.cell(row=r, column=16).value
        approval_status = sheet.cell(row=r, column=17).value
        setup_status = sheet.cell(row=r, column=18).value
        notes = sheet.cell(row=r, column=19).value

        # Derive intelligent pipeline stage based on approval / setup status
        app_status_str = str(approval_status or "").strip()
        setup_status_str = str(setup_status or "").strip()
        
        if setup_status_str == "Live":
            stage = "Posted"
        elif setup_status_str == "In Setup":
            stage = "Ready To Post"
        elif app_status_str == "Approved for Campaign":
            stage = "Approved"
        elif app_status_str == "Changes Requested":
            stage = "Revision"
        elif app_status_str == "Review Creative Draft":
            stage = "Design / Video Review"
        elif app_status_str == "Review Content":
            stage = "Content Review"
        elif app_status_str in ("Start Production", "Content Approved"):
            stage = "Design / Video"
        else:
            stage = "Content"
        stage = normalize_stage(stage)

        # Determine scheduled calendar date
        # If design_due has week like 'Wk 2', schedule relative to current month for visual demo
        publish_date = None
        due_str = str(design_due or "").strip().lower()
        week_match = re.search(r"wk\s*(\d+)", due_str)
        if week_match:
            wk_num = int(week_match.group(1))
            # Spread across upcoming days
            offset_days = (wk_num - 2) * 5 + (r % 5)
            sched_date = today + timedelta(days=offset_days)
            publish_date = sched_date.isoformat()
        else:
            # Spread items throughout current and next month
            offset_days = (r - 3) % 28
            sched_date = today + timedelta(days=offset_days)
            publish_date = sched_date.isoformat()

        # Derive sample channels based on creative type
        c_type_str = str(creative_type or "").strip().lower()
        if c_type_str in ("reel", "story"):
            channels = ["Instagram", "Facebook"]
        elif c_type_str == "video":
            channels = ["YouTube", "Facebook", "LinkedIn"]
        elif c_type_str == "carousel":
            channels = ["Instagram", "LinkedIn"]
        else:
            channels = ["Instagram", "Facebook", "LinkedIn"]

        item_id = f"cc_{uuid.uuid4().hex[:12]}"
        record = {
            "id": item_id,
            "serial": serial_str,
            "client_name": "Apex Transfers LLC",
            "campaign_type": str(campaign_type).strip() if campaign_type else "Acquire \u2013 Cold Audience Awareness",
            "creative_type": str(creative_type).strip() if creative_type else "Video",
            "content_pillar": str(content_pillar).strip() if content_pillar else "Production Advantage",
            "content_concept": str(content_concept).strip() if content_concept else f"Asset {serial_str}",
            "offer": str(offer).strip() if offer else "Sample Pack",
            "production_direction": str(production_direction).strip() if production_direction else None,
            "primary_text": str(primary_text).strip() if primary_text else None,
            "headlines_hooks": str(headlines_hooks).strip() if headlines_hooks else None,
            "content_on_creative": str(content_on_creative).strip() if content_on_creative else None,
            "cta": str(cta).strip() if cta else "Request Your Sample Pack",
            "captions_hashtags": str(captions_hashtags).strip() if captions_hashtags else None,
            "design_owner": str(design_owner).strip() if design_owner else "Content",
            "design_due": str(design_due).strip() if design_due else None,
            "draft_preview_link": str(draft_link).strip() if draft_link else None,
            "final_asset_link": str(final_link).strip() if final_link else None,
            "approval_status": str(approval_status).strip() if approval_status else "Review Content",
            "setup_status": str(setup_status).strip() if setup_status else "Not Started",
            "notes": str(notes).strip() if notes else None,
            "stage": stage,
            "publish_date": publish_date,
            "channels": channels,
            "workspace_id": None,
            "share_token": f"cc_tok_{uuid.uuid4().hex}",
            "created_by": "system_seed",
            "created_at": now,
            "updated_at": now,
        }
        seeded_records.append(record)

    if seeded_records:
        # Upsert records by serial to prevent duplicates
        count = 0
        for rec in seeded_records:
            await coll.update_one(
                {"serial": rec["serial"]},
                {"$setOnInsert": rec},
                upsert=True,
            )
            count += 1
        logger.info(f"Successfully seeded {count} Content Calendar records from {target_file}")
        return count

    return 0


def sanitize_spreadsheet_string(val: Any) -> Any:
    """Sanitizes text against formula injection attack characters."""
    if isinstance(val, str) and (val.startswith(("\t", "\r")) or val.strip().startswith(("=", "+", "-", "@"))):
        return "'" + val
    return val



async def batch_update_items(
    db,
    updates: List[BatchUpdateItem],
    viewer: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Executes multiple field edits in a single high-performance bulk_write operation.
    Eliminates rate-limit bottlenecks and reduces network round-trips for table editing.
    """
    if db is None or not updates:
        return {"updated": 0, "matched": 0}

    coll = db[COLLECTION_NAME]
    now = _now_iso()
    operations = []

    allowed_fields = {
        "serial",
        "client_name",
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

    for item in updates:
        if not item.id or not item.changes:
            continue

        clean_set: Dict[str, Any] = {}
        for k, v in item.changes.items():
            if k in allowed_fields:
                if k == "channels":
                    if isinstance(v, list):
                        clean_set[k] = [str(ch)[:40] for ch in v[:12]]
                    continue
                if isinstance(v, str):
                    v = clamp_text(k, v)
                elif v is not None:
                    continue
                clean_set[k] = v

        if not clean_set:
            continue

        current_doc = None
        if viewer is not None or "client_name" in clean_set:
            current_doc = await coll.find_one({"$or": [{"id": item.id}, {"serial": item.id}]})
        if viewer is not None:
            if not current_doc or not can_edit_item(viewer, _present_doc(dict(current_doc))):
                continue

        if "client_name" in clean_set:
            new_client = clean_set["client_name"]
            if current_doc and current_doc.get("client_name") != new_client:
                old_serial = current_doc.get("serial")
                provided_serial = clean_set.get("serial")
                target_prefix = f"C{get_client_abbreviation(new_client)}-"
                if (
                    not provided_serial
                    or provided_serial == old_serial
                    or not str(provided_serial).startswith(target_prefix)
                ):
                    new_serial = await get_next_serial(db, new_client)
                    clean_set["serial"] = new_serial

        clean_set["updated_at"] = now
        operations.append(
            UpdateOne(
                {"$or": [{"id": item.id}, {"serial": item.id}]},
                {"$set": clean_set},
            )
        )

    if not operations:
        return {"updated": 0, "matched": 0}

    result = await coll.bulk_write(operations, ordered=False)
    return {"updated": result.modified_count, "matched": result.matched_count}


async def bulk_import_items(
    db,
    items: List[ContentCalendarItemCreate],
    upsert_by_serial: bool = True,
    default_client_name: Optional[str] = None,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    viewer: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Imports a batch of content calendar items from an Excel upload.
    Supports upserting by serial or appending new records, auto-linking workspaces.
    """
    if db is None or not items:
        return {"total_processed": 0, "inserted_count": 0, "updated_count": 0, "errors": []}

    coll = db[COLLECTION_NAME]
    now = _now_iso()
    client_default = default_client_name or "Apex Transfers LLC"

    ws_list = []
    if db is not None:
        try:
            ws_list = await db["workspaces"].find({"status": {"$ne": "inactive"}}, {"id": 1, "name": 1}).to_list(200)
        except Exception:
            ws_list = []

    def _match_ws(name: str) -> Optional[str]:
        if not name or not ws_list:
            return None
        nc = name.strip().lower()
        for w in ws_list:
            wn = str(w.get("name") or "").strip().lower()
            if wn == nc:
                return w["id"]
        clean_c_corp = re.sub(r"\b(llc|inc|corp|ltd|co)\b", "", nc).strip()
        if clean_c_corp:
            for w in ws_list:
                wn = str(w.get("name") or "").strip().lower()
                clean_w_corp = re.sub(r"\b(llc|inc|corp|ltd|co)\b", "", wn).strip()
                if clean_w_corp and clean_w_corp == clean_c_corp:
                    return w["id"]
        return None

    inserted_count = 0
    updated_count = 0
    errors: List[str] = []

    if upsert_by_serial:
        operations = []
        for idx, item in enumerate(items):
            try:
                doc = item.model_dump()
                c_name = doc.get("client_name") or client_default
                doc["client_name"] = c_name

                if not doc.get("workspace_id"):
                    matched_ws_id = _match_ws(c_name)
                    if matched_ws_id:
                        doc["workspace_id"] = matched_ws_id

                serial = doc.get("serial")
                if not serial or not str(serial).strip() or str(serial).upper() == "AUTO" or not re.search(r"\d+", str(serial)):
                    serial = await get_next_serial(db, c_name)
                    doc["serial"] = serial
                else:
                    doc["serial"] = format_client_serial(serial, c_name, fallback_num=idx + 1)

                existing = None
                if hasattr(coll, "find_one"):
                    try:
                        found = await coll.find_one({"serial": doc["serial"]})
                        if isinstance(found, dict):
                            existing = found
                    except Exception:
                        existing = None

                if existing and viewer is not None and not can_edit_item(viewer, _present_doc(dict(existing))):
                    errors.append(f"Row {idx + 1} ({doc['serial']}): Not permitted to edit item in stage '{existing.get('stage')}'.")
                    continue

                # Strip workflow, identity, and locked fields from update ($set)
                for locked in ("stage", "approval_status", "design_owner", "attachments", "share_token", "created_by", "created_by_name", "created_at"):
                    doc.pop(locked, None)

                for k, v in doc.items():
                    if isinstance(v, str):
                        doc[k] = sanitize_spreadsheet_string(v)

                doc["updated_at"] = now

                # Prepare insert-only fields (must have ZERO overlap with doc to prevent Mongo error 40)
                insert_fields = {
                    "id": f"cc_{uuid.uuid4().hex[:12]}",
                    "share_token": f"cc_tok_{uuid.uuid4().hex}",
                    "stage": DEFAULT_STAGE,
                    "approval_status": "Content Draft",
                    "design_owner": stage_owner(DEFAULT_STAGE),
                    "created_by": user_id,
                    "created_by_name": user_name,
                    "created_at": now,
                }
                # Defensive check: ensure no keys in insert_fields conflict with doc
                insert_fields = {k: v for k, v in insert_fields.items() if k not in doc}

                operations.append(
                    UpdateOne(
                        {"serial": doc["serial"]},
                        {"$set": doc, "$setOnInsert": insert_fields},
                        upsert=True,
                    )
                )
            except Exception as e:
                errors.append(f"Row {idx + 1}: {str(e)}")

        if operations:
            res = await coll.bulk_write(operations, ordered=False)
            inserted_count = res.upserted_count
            updated_count = res.modified_count
    else:
        docs = []
        for idx, item in enumerate(items):
            try:
                doc = item.model_dump()
                c_name = doc.get("client_name") or client_default
                doc["client_name"] = c_name
                doc["stage"] = DEFAULT_STAGE
                doc["approval_status"] = "Content Draft"
                doc["design_owner"] = stage_owner(DEFAULT_STAGE)

                if not doc.get("workspace_id"):
                    matched_ws_id = _match_ws(c_name)
                    if matched_ws_id:
                        doc["workspace_id"] = matched_ws_id

                serial = doc.get("serial")
                if not serial or not str(serial).strip() or str(serial).upper() == "AUTO" or not re.search(r"\d+", str(serial)):
                    serial = await get_next_serial(db, c_name)
                    doc["serial"] = serial
                else:
                    doc["serial"] = format_client_serial(serial, c_name, fallback_num=idx + 1)

                doc["id"] = f"cc_{uuid.uuid4().hex[:12]}"
                doc["share_token"] = f"cc_tok_{uuid.uuid4().hex}"
                doc["created_by"] = user_id
                doc["created_by_name"] = user_name
                doc["created_at"] = now
                doc["updated_at"] = now
                docs.append(doc)
            except Exception as e:
                errors.append(f"Row {idx + 1}: {str(e)}")

        if docs:
            res = await coll.insert_many(docs, ordered=False)
            inserted_count = len(res.inserted_ids)

    return {
        "total_processed": len(items),
        "inserted_count": inserted_count,
        "updated_count": updated_count,
        "errors": errors,
    }


def check_review_link_expiration(doc: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Review links have no time-based expiration timer.
    They strictly expire ONLY when the campaign has been approved or changes have been requested.
    Returns (is_expired, message_detail).
    """
    stage = normalize_stage(doc.get("stage"))
    approval_status = str(doc.get("approval_status") or "").strip()

    # Active review stages are open and never expired
    if stage in ("Content Client Review", "Creative Client Review"):
        return False, None

    # Expired condition 1: Approved
    if approval_status in ("Approved", "Approved for Campaign", "Creative Approved", "Content Approved") or stage in ("Creative Production", "Ready to Post", "Posted"):
        return True, "Campaign review link has expired because this campaign has already been approved."

    # Expired condition 2: Changes Requested
    if approval_status == "Changes Requested" or stage in ("Content Revision", "Creative Revision"):
        return True, "Campaign review link has expired because changes have already been requested."

    # Draft / internal stages are accessible for preview if not approved and not changes requested
    return False, None


async def get_public_review_item(db, token: str) -> Dict[str, Any]:
    """Public lookup for client review strictly via cryptographically secure share_token."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable")
    clean_tok = str(token or "").strip()
    if not clean_tok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign review link not found.")
    coll = db[COLLECTION_NAME]
    doc = await coll.find_one({"share_token": clean_tok})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign review link not found.")

    # Ensure persistent share_token exists on document in MongoDB
    if not doc.get("share_token"):
        new_token = f"cc_tok_{uuid.uuid4().hex}"
        try:
            await coll.update_one({"_id": doc["_id"]}, {"$set": {"share_token": new_token}})
            doc["share_token"] = new_token
        except Exception as exc:
            logger.warning("Could not persist share_token for %s: %s", doc.get("id"), exc)

    presented = _present_doc(dict(doc))

    # Review links only expire once approved or changes requested
    is_expired, expire_msg = check_review_link_expiration(presented)
    if is_expired:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=expire_msg)

    # Rewrite attachment URLs to secure public review streaming endpoints so external guests can view media
    public_attachments = []
    for att in presented.get("attachments", []):
        if not isinstance(att, dict):
            continue
        att_copy = dict(att)
        att_id = att_copy.get("id")
        if att_copy.get("kind") != "link" and att_id:
            att_copy["url"] = f"/api/v1/content-calendar/public/review/{clean_tok}/assets/{att_id}"
            if att_copy.get("thumbnail_url"):
                att_copy["thumbnail_url"] = f"/api/v1/content-calendar/public/review/{clean_tok}/assets/{att_id}?thumb=1"
        public_attachments.append(att_copy)

    return {
        "id": presented["id"],
        "serial": presented.get("serial"),
        "client_name": presented.get("client_name"),
        "content_concept": presented.get("content_concept"),
        "campaign_type": presented.get("campaign_type"),
        "content_pillar": presented.get("content_pillar"),
        "stage": presented.get("stage"),
        "approval_status": presented.get("approval_status"),
        "primary_text": presented.get("primary_text"),
        "headlines_hooks": presented.get("headlines_hooks"),
        "content_on_creative": presented.get("content_on_creative"),
        "offer": presented.get("offer"),
        "cta": presented.get("cta"),
        "captions_hashtags": presented.get("captions_hashtags"),
        "production_direction": presented.get("production_direction"),
        "attachments": public_attachments,
        "publish_date": presented.get("publish_date"),
        "share_token": presented.get("share_token") or clean_tok,
        "revision_note": presented.get("revision_note"),
        "updated_at": presented.get("updated_at"),
    }


async def action_public_review_item(
    db,
    token: str,
    action: str,
    reviewer_name: Optional[str] = None,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    """Process an unauthenticated approval or change request strictly from a client magic link."""
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable")
    clean_tok = str(token or "").strip()
    if not clean_tok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign review link not found.")
    coll = db[COLLECTION_NAME]
    doc = await coll.find_one({"share_token": clean_tok})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign review link not found.")

    presented = _present_doc(dict(doc))
    stage = presented.get("stage")
    action_key = str(action or "").lower().strip().replace(" ", "_")
    now = _now_iso()
    who = str(reviewer_name or "").strip() or "Client"

    # Review links only expire once approved or changes requested
    is_expired, expire_msg = check_review_link_expiration(presented)
    if is_expired:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=expire_msg)

    if stage not in ("Content Client Review", "Creative Client Review"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This campaign is currently in '{stage}' and is not awaiting client review decisions.",
        )

    update_fields: Dict[str, Any] = {"updated_at": now}

    if action_key in ("approve", "approved"):
        if stage == "Content Client Review":
            update_fields["stage"] = "Creative Production"
            update_fields["submitted_from"] = None
            update_fields["assignee_id"] = None
            update_fields["assignee_name"] = None
            update_fields["approval_status"] = "Approved"
            msg = f"Content copy approved by {who}. Transferred to Creative Production."
        elif stage == "Creative Client Review":
            update_fields["stage"] = "Ready to Post"
            update_fields["submitted_from"] = None
            update_fields["approval_status"] = "Approved"
            msg = f"Creative deliverables approved by {who}. Moved to Ready to Post."
        else:
            msg = f"Campaign is currently in '{stage}' and already approved."
            return {"success": True, "message": msg, "stage": stage, "item": presented}

    elif action_key in ("request_revision", "revision"):
        rev_note = str(note or "").strip()
        if not rev_note:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please provide a revision note explaining the changes requested.",
            )
        full_note = f"[{who}]: {rev_note}"
        update_fields["revision_note"] = full_note
        update_fields["approval_status"] = "Changes Requested"
        if stage == "Creative Client Review":
            update_fields["stage"] = "Creative Revision"
            update_fields["submitted_from"] = None
            msg = f"Revision requested by {who}. Sent back to Creative Revision."
        else:
            update_fields["stage"] = "Content Revision"
            update_fields["submitted_from"] = None
            msg = f"Revision requested by {who}. Sent back to Content Revision."
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported action '{action}'.")

    await coll.update_one({"id": presented["id"]}, {"$set": update_fields})
    updated = await coll.find_one({"id": presented["id"]})
    doc_to_present = dict(updated) if updated else dict(presented)
    if not updated and update_fields:
        doc_to_present.update(update_fields)
    presented_after = _present_doc(doc_to_present)
    try:
        await notify_content_calendar_event(
            db,
            item=presented_after,
            action=action_key,
            actor={"full_name": who, "role": "client"},
            note=note,
            old_item=presented,
        )
    except Exception as notif_err:
        logger.warning("Public review notification failed: %s", notif_err)

    return {
        "success": True,
        "message": msg,
        "stage": update_fields.get("stage", stage),
        "item": presented_after,
    }


async def notify_content_calendar_event(
    db,
    item: Dict[str, Any],
    action: str,
    actor: Optional[Dict[str, Any]] = None,
    note: Optional[str] = None,
    assignee_id: Optional[str] = None,
    assignee_name: Optional[str] = None,
    old_item: Optional[Dict[str, Any]] = None,
) -> None:
    """Dispatches in-app notifications and web-push to all relevant stakeholders upon Content Calendar events."""
    if db is None:
        return
    try:
        from app.services.push_service import dispatch_to_users

        item_id = str(item.get("id") or item.get("_id") or "")
        serial = str(item.get("serial") or "Campaign")
        client_name = str(item.get("client_name") or "Client")
        stage = str(item.get("stage") or "Content")
        workspace_id = item.get("workspace_id")
        creator_id = str(item.get("created_by") or "")
        effective_assignee = str(assignee_id or item.get("assignee_id") or "")

        actor_name = "Team Member"
        actor_id = None
        actor_role = "team_member"
        if actor:
            actor_name = str(actor.get("full_name") or actor.get("name") or actor.get("email") or "Team Member")
            actor_id = str(actor.get("id") or actor.get("_id") or "") or None
            actor_role = str(actor.get("role") or "team_member")

        async def _find_content_leads() -> List[str]:
            uids = []
            async for u in db.users.find({"is_active": {"$ne": False}}, {"id": 1, "_id": 1, "role": 1, "department": 1, "departments": 1}):
                u["is_active"] = True
                if is_admin(u) or is_content_lead(u):
                    uids.append(str(u.get("id") or u.get("_id") or ""))
            return [u for u in uids if u]

        async def _find_creative_leads() -> List[str]:
            uids = []
            async for u in db.users.find({"is_active": {"$ne": False}}, {"id": 1, "_id": 1, "role": 1, "department": 1, "departments": 1}):
                u["is_active"] = True
                if is_admin(u) or is_creative_lead(u):
                    uids.append(str(u.get("id") or u.get("_id") or ""))
            return [u for u in uids if u]

        async def _find_client_users() -> List[str]:
            if not workspace_id:
                return []
            uids = []
            async for u in db.users.find(
                {"is_active": {"$ne": False}, "role": "client", "$or": [{"workspace_id": workspace_id}, {"workspace_ids": workspace_id}]},
                {"id": 1, "_id": 1}
            ):
                uids.append(str(u.get("id") or u.get("_id") or ""))
            return [u for u in uids if u]

        async def _find_social_actors() -> List[str]:
            uids = []
            async for u in db.users.find({"is_active": {"$ne": False}}, {"id": 1, "_id": 1, "role": 1, "department": 1, "departments": 1}):
                u["is_active"] = True
                if is_admin(u) or is_social_actor(u) or is_performance(u):
                    uids.append(str(u.get("id") or u.get("_id") or ""))
            return [u for u in uids if u]

        recipients: List[str] = []
        title = f"Campaign Update: {serial}"
        body = f"{serial} ({client_name}) updated by {actor_name}."

        act = str(action or "").lower().strip().replace(" ", "_")

        if act in ("assign", "assign_creative"):
            if effective_assignee:
                recipients = [effective_assignee]
                title = f"Campaign Assigned: {serial}"
                body = f"You were assigned to {serial} ({client_name}) for {stage} by {actor_name}."

        elif act == "submit":
            if stage == "Content Internal Review":
                recipients = await _find_content_leads()
                title = f"Content Ready for Review: {serial}"
                body = f"{actor_name} submitted {serial} ({client_name}) for internal content review."
            elif stage == "Creative Internal Review":
                recipients = await _find_creative_leads()
                title = f"Creative Ready for Review: {serial}"
                body = f"{actor_name} submitted {serial} ({client_name}) for internal creative review."
            else:
                recipients = await _find_content_leads()
                title = f"Campaign Submitted: {serial}"
                body = f"{actor_name} submitted {serial} ({client_name}) to {stage}."

        elif act in ("approve", "approved"):
            if stage in ("Content Client Review", "Creative Client Review"):
                client_uids = await _find_client_users()
                content_leads = await _find_content_leads()
                recipients = client_uids + content_leads
                title = f"Ready for Client Review: {serial}"
                body = f"{serial} ({client_name}) is approved internally and ready for client review in {stage}."
            elif stage == "Creative Production":
                # Approved by client
                recipients = await _find_content_leads() + await _find_creative_leads()
                if creator_id:
                    recipients.append(creator_id)
                if effective_assignee:
                    recipients.append(effective_assignee)
                title = f"Content Approved by Client: {serial} 🎉"
                body = f"{actor_name} approved content for {serial} ({client_name}). Advanced to Creative Production."
            elif stage == "Ready to Post":
                # Approved by client
                recipients = await _find_creative_leads() + await _find_social_actors()
                if creator_id:
                    recipients.append(creator_id)
                if effective_assignee:
                    recipients.append(effective_assignee)
                title = f"Creative Approved by Client: {serial} 🎉"
                body = f"{actor_name} approved deliverables for {serial} ({client_name}). Advanced to Ready to Post."
            else:
                recipients = await _find_content_leads()
                title = f"Campaign Approved: {serial}"
                body = f"{serial} ({client_name}) approved by {actor_name} to {stage}."

        elif act == "send_back":
            recipients = [u for u in [effective_assignee, creator_id] if u]
            if not recipients:
                recipients = await _find_content_leads()
            title = f"Changes Requested: {serial}"
            detail = f": {note}" if note else "."
            body = f"{actor_name} requested changes on {serial} ({client_name}){detail}"

        elif act in ("request_revision", "revision"):
            recipients = await _find_content_leads() + await _find_creative_leads()
            if creator_id:
                recipients.append(creator_id)
            if effective_assignee:
                recipients.append(effective_assignee)
            title = f"Client Requested Revision: {serial} ⚠️"
            detail = f": {note}" if note else "."
            body = f"{actor_name} requested revision on {serial} ({client_name}){detail}"

        elif act in ("post", "posted"):
            recipients = await _find_content_leads() + await _find_client_users()
            if creator_id:
                recipients.append(creator_id)
            title = f"Campaign Posted: {serial} 🚀"
            body = f"{serial} ({client_name}) marked as posted by {actor_name}."

        elif act in ("reject", "rejected"):
            recipients = await _find_content_leads() + await _find_creative_leads()
            if creator_id:
                recipients.append(creator_id)
            if effective_assignee:
                recipients.append(effective_assignee)
            title = f"Campaign Rejected: {serial} ❌"
            detail = f": {note}" if note else "."
            body = f"{serial} ({client_name}) was rejected by {actor_name}{detail}"

        elif act in ("return_to_creative", "return"):
            recipients = await _find_creative_leads()
            if creator_id:
                recipients.append(creator_id)
            if effective_assignee:
                recipients.append(effective_assignee)
            title = f"Campaign Returned to Creative: {serial} ↩️"
            detail = f": {note}" if note else "."
            body = f"{serial} ({client_name}) was returned to creative by {actor_name}{detail}"

        elif act == "comment":
            recipients = [u for u in [effective_assignee, creator_id] if u]
            if not recipients:
                recipients = await _find_content_leads()
            title = f"New Comment on {serial}"
            body = f"{actor_name}: {note[:120] if note else 'left a comment'}"

        elif act == "admin_move":
            recipients = [u for u in [effective_assignee, creator_id] if u]
            if not recipients:
                recipients = await _find_content_leads()
            title = f"Campaign Moved: {serial}"
            body = f"{actor_name} moved {serial} ({client_name}) to {stage}."

        cleaned_recipients = [str(r) for r in dict.fromkeys(recipients) if r]
        if not cleaned_recipients:
            return

        await dispatch_to_users(
            user_ids=cleaned_recipients,
            title=title,
            body=body,
            kind="content_calendar",
            sender_id=actor_id,
            sender_name=actor_name,
            sender_role=actor_role,
            data={
                "type": "content_calendar",
                "item_id": item_id,
                "serial": serial,
                "stage": stage,
                "action": act,
            },
        )
    except Exception as exc:
        logger.warning("Content calendar notification dispatch failed: %s", exc)



async def stream_public_asset(
    db,
    token: str,
    asset_id: str,
    thumb: bool = False,
    request: Request = None,
):
    """Streams a deliverable asset for a client viewing a campaign via a valid magic link."""
    clean_tok = str(token or "").strip()
    clean_aid = str(asset_id or "").strip()
    if not clean_tok or not clean_aid or db is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")

    coll = db[COLLECTION_NAME]
    doc = await coll.find_one({"share_token": clean_tok})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign review link not found.")

    presented = _present_doc(dict(doc))
    is_expired, expire_msg = check_review_link_expiration(presented)
    if is_expired:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=expire_msg)

    attachments = presented.get("attachments") or []
    target = next((a for a in attachments if isinstance(a, dict) and a.get("id") == clean_aid), None)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")

    target_url = target.get("thumbnail_url") if (thumb and target.get("thumbnail_url")) else target.get("url")
    if not target_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset file not found.")

    clean_url = target_url.lstrip("/").replace("api/uploads/", "").replace("uploads/", "")
    doc_id = str(presented.get("id") or "")
    doc_serial = str(presented.get("serial") or "")
    gdrive_id = str(target.get("google_drive_file_id") or "")
    gdrive_thumb_id = str(target.get("google_drive_thumb_file_id") or "")

    is_valid_internal = clean_url.startswith("content_calendar/") and (
        f"content_calendar/{doc_id}/" in clean_url
        or (doc_serial and f"content_calendar/{doc_serial}/" in clean_url)
        or clean_url.startswith("content_calendar/")
    )
    is_valid_gdrive = clean_url.startswith("gdrive/") and (
        (gdrive_id and gdrive_id in clean_url)
        or (gdrive_thumb_id and gdrive_thumb_id in clean_url)
    )

    if not (is_valid_internal or is_valid_gdrive):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this asset.")

    from app.core.uploads import open_upload_response
    range_header = request.headers.get("range") if request else None
    return await open_upload_response(db, target_url, download=False, range_header=range_header)

