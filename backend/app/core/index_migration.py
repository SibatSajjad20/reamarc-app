"""Safe unique-index migration: company-scoped uniques replace global uniques.

Create the new unique index first (different name), then drop the old one.
Never deletes documents. Idempotent. Errors are logged per index; startup continues.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union

from pymongo.errors import DuplicateKeyError, OperationFailure, PyMongoError

logger = logging.getLogger("app.index_migration")

KeySpec = Sequence[Tuple[str, Any]]

# Tenant-collection unique indexes that must be compound with company_id first.
COMPANY_UNIQUE_INDEXES: List[Dict[str, Any]] = [
    {
        "collection": "crm_pipeline",
        "old_names": ["idx_crm_pipeline_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_crm_pipeline_id",
    },
    {
        "collection": "shifts",
        "old_names": ["idx_shift_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_shift_id",
    },
    {
        "collection": "crm_scheduler_slots",
        "old_names": ["uniq_crm_scheduler_slot"],
        "old_keys": [[("date", 1), ("slot_time", 1)]],
        "new_keys": [("company_id", 1), ("date", 1), ("slot_time", 1)],
        "name": "uniq_company_crm_scheduler_slot",
    },
    {
        "collection": "attendance_records",
        "old_names": ["idx_att_user_date", "idx_company_att_user_date"],
        "old_keys": [[("user_id", 1), ("date", 1)]],
        "new_keys": [("company_id", 1), ("user_id", 1), ("date", 1)],
        "name": "uniq_company_att_user_date",
    },
    {
        "collection": "leave_balances",
        "old_names": ["idx_leave_balance_user_year"],
        "old_keys": [[("user_id", 1), ("year", 1)]],
        "new_keys": [("company_id", 1), ("user_id", 1), ("year", 1)],
        "name": "uniq_company_leave_balance",
    },
    {
        "collection": "user_shift_assignments",
        "old_names": ["idx_user_shift"],
        "old_keys": [[("user_id", 1)]],
        "new_keys": [("company_id", 1), ("user_id", 1)],
        "name": "uniq_company_user_shift",
    },
    {
        "collection": "daily_log_day_scores",
        "old_names": [],
        "old_keys": [[("user_id", 1), ("date", 1)]],
        "new_keys": [("company_id", 1), ("user_id", 1), ("date", 1)],
        "name": "uniq_company_day_score",
    },
    {
        "collection": "mobile_push_receipts",
        "old_names": ["idx_push_receipt_unique"],
        "old_keys": [[("user_id", 1), ("date", 1), ("kind", 1)]],
        "new_keys": [("company_id", 1), ("user_id", 1), ("date", 1), ("kind", 1)],
        "name": "uniq_company_push_receipt",
    },
    {
        "collection": "crm_leads",
        "old_names": ["idx_crm_external_id"],
        "old_keys": [[("external_id", 1)]],
        "new_keys": [("company_id", 1), ("external_id", 1)],
        "name": "uniq_company_crm_external_id",
        "opts": {
            "partialFilterExpression": {
                "external_id": {"$exists": True, "$type": "string", "$gt": ""},
            },
        },
    },
    {
        "collection": "crm_leads",
        "old_names": ["idx_crm_lead_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_crm_lead_id",
    },
    {
        "collection": "crm_deals",
        "old_names": ["idx_crm_deal_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_crm_deal_id",
    },
    {
        "collection": "crm_assignment_rules",
        "old_names": ["idx_crm_rule_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_crm_rule_id",
    },
    {
        "collection": "crm_templates",
        "old_names": ["idx_crm_tpl_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_crm_tpl_id",
    },
    {
        "collection": "crm_ingest_sources",
        "old_names": ["idx_crm_ingest_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_crm_ingest_id",
    },
    {
        "collection": "website_projects",
        "old_names": ["idx_website_proj_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_website_proj_id",
    },
    {
        "collection": "website_project_tasks",
        "old_names": ["idx_website_task_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_website_task_id",
    },
    {
        "collection": "website_project_files",
        "old_names": ["idx_website_file_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_website_file_id",
    },
    {
        "collection": "website_project_activities",
        "old_names": ["idx_website_act_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_website_act_id",
    },
    {
        "collection": "website_project_gates",
        "old_names": ["idx_website_gate_proj_key"],
        "old_keys": [[("project_id", 1), ("gate_key", 1)]],
        "new_keys": [("company_id", 1), ("project_id", 1), ("gate_key", 1)],
        "name": "uniq_company_website_gate",
    },
    {
        "collection": "content_calendar_items",
        "old_names": ["idx_cc_id"],
        "old_keys": [[("id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1)],
        "name": "uniq_company_cc_id",
    },
    {
        "collection": "content_calendar_items",
        "old_names": ["idx_cc_serial"],
        "old_keys": [[("serial", 1)]],
        "new_keys": [("company_id", 1), ("serial", 1)],
        "name": "uniq_company_cc_serial",
    },
    {
        "collection": "daily_campaign_metrics",
        "old_names": ["uniq_campaign_date_metric"],
        "old_keys": [[("campaign_id", 1), ("date", 1)]],
        "new_keys": [("company_id", 1), ("campaign_id", 1), ("date", 1)],
        "name": "uniq_company_campaign_date_metric",
    },
    {
        "collection": "posts",
        "old_names": ["uniq_campaign_target_date"],
        "old_keys": [[("campaign_id", 1), ("target_date", 1)]],
        "new_keys": [("company_id", 1), ("campaign_id", 1), ("target_date", 1)],
        "name": "uniq_company_posts",
        "opts": {"sparse": True},
    },
    {
        "collection": "ad_account_credentials",
        "old_names": [],
        "old_keys": [[("workspace_id", 1), ("platform", 1), ("account_id", 1)]],
        "new_keys": [("company_id", 1), ("workspace_id", 1), ("platform", 1), ("account_id", 1)],
        "name": "uniq_company_ad_creds",
        "opts": {"sparse": True},
    },
    {
        "collection": "daily_log_entries",
        "old_names": [],
        "old_keys": [[("id", 1), ("workspace_id", 1)]],
        "new_keys": [("company_id", 1), ("id", 1), ("workspace_id", 1)],
        "name": "uniq_company_id_workspace_entry",
    },
    {
        "collection": "daily_log_columns",
        "old_names": [],
        "old_keys": [[("workspace_id", 1)]],
        "new_keys": [("company_id", 1), ("workspace_id", 1)],
        "name": "uniq_company_workspace_columns",
    },
    {
        "collection": "sync_jobs",
        "old_names": [],
        "old_keys": [[("job_key", 1)]],
        "new_keys": [("company_id", 1), ("job_key", 1)],
        "name": "uniq_company_sync_job",
    },
    {
        "collection": "system_config",
        "old_names": ["idx_system_config_key"],
        "old_keys": [[("key", 1)]],
        "new_keys": [("company_id", 1), ("key", 1)],
        "name": "uniq_company_system_config_key",
    },
    {
        "collection": "web_push_subscriptions",
        "old_names": ["idx_web_push_endpoint"],
        "old_keys": [[("endpoint", 1)]],
        "new_keys": [("endpoint", 1), ("company_id", 1)],
        "name": "uniq_web_push_endpoint_company",
    },
]


def _normalize_keys(keys: Union[str, KeySpec, Sequence[Any]]) -> List[Tuple[str, Any]]:
    if keys is None:
        return []
    if isinstance(keys, str):
        return [(keys, 1)]
    out: List[Tuple[str, Any]] = []
    for item in keys:
        if isinstance(item, (list, tuple)) and len(item) >= 2 and not isinstance(item[0], (list, tuple)):
            out.append((str(item[0]), item[1]))
        elif isinstance(item, str):
            out.append((item, 1))
        else:
            out.append((str(item), 1))
    return out


def _keys_equal(left: Any, right: Any) -> bool:
    return _normalize_keys(left or []) == _normalize_keys(right or [])


def _coll_name(coll: Any) -> str:
    return getattr(coll, "name", None) or getattr(coll, "full_name", "unknown")


async def _index_information(coll: Any) -> Dict[str, Any]:
    info = coll.index_information()
    if hasattr(info, "__await__"):
        info = await info
    return dict(info or {})


async def _drop_index(coll: Any, name: str) -> None:
    if not name or name == "_id_":
        return
    drop = coll.drop_index(name)
    if hasattr(drop, "__await__"):
        await drop


async def _create_index(coll: Any, keys: KeySpec, **opts: Any) -> Any:
    create = coll.create_index(list(keys), **opts)
    if hasattr(create, "__await__"):
        return await create
    return create


def _old_index_names(
    info: Dict[str, Any],
    old_names: Iterable[str],
    old_keys: Optional[List[Any]],
    keep_name: str,
) -> List[str]:
    names = set()
    for n in old_names or []:
        if n and n != "_id_" and n != keep_name and n in info:
            names.add(n)
    for spec in old_keys or []:
        want = _normalize_keys(spec)
        for iname, meta in info.items():
            if iname in ("_id_", keep_name):
                continue
            if _keys_equal(meta.get("key"), want):
                names.add(iname)
    return sorted(names)


async def ensure_company_unique_index(
    coll,
    old_names: list[str],
    old_keys: list,
    new_keys,
    name: str,
    **opts,
) -> bool:
    """Create `{company_id, ...}` unique index `name`, then drop old global uniques.

    Returns True if the new unique index is present afterwards.
    On DuplicateKey while building, logs the collection and leaves the old index.
    """
    coll_name = _coll_name(coll)
    new_keys_n = _normalize_keys(new_keys)
    try:
        info = await _index_information(coll)
    except Exception as exc:
        logger.warning("index_information failed on %s: %s", coll_name, exc)
        return False

    existing = info.get(name)
    if existing and existing.get("unique") and _keys_equal(existing.get("key"), new_keys_n):
        await _drop_listed_old(coll, info, old_names, old_keys, name)
        return True

    for iname, meta in list(info.items()):
        if iname == "_id_":
            continue
        if _keys_equal(meta.get("key"), new_keys_n):
            if meta.get("unique") and iname == name:
                await _drop_listed_old(coll, info, old_names, old_keys, name)
                return True
            # Same keys, different uniqueness or name: drop so the unique can be created.
            if iname != name:
                try:
                    await _drop_index(coll, iname)
                    logger.info("Dropped same-key index %s on %s before unique %s", iname, coll_name, name)
                except Exception as exc:
                    logger.warning("Could not drop same-key index %s on %s: %s", iname, coll_name, exc)
                    if not meta.get("unique"):
                        return False

    try:
        await _create_index(coll, new_keys_n, unique=True, name=name, **opts)
    except DuplicateKeyError as exc:
        logger.error(
            "DuplicateKey building unique index %s on %s; leaving old index in place. details=%s",
            name,
            coll_name,
            getattr(exc, "details", None) or str(exc),
        )
        return False
    except (OperationFailure, PyMongoError, Exception) as exc:
        logger.warning("Could not create unique index %s on %s: %s", name, coll_name, exc)
        return False

    try:
        info = await _index_information(coll)
    except Exception:
        info = {name: {"key": new_keys_n, "unique": True}}
    await _drop_listed_old(coll, info, old_names, old_keys, name)
    return True


async def _drop_listed_old(coll, info, old_names, old_keys, keep_name: str) -> None:
    coll_name = _coll_name(coll)
    for iname in _old_index_names(info, old_names, old_keys, keep_name):
        try:
            await _drop_index(coll, iname)
            logger.info("Dropped old unique index %s on %s", iname, coll_name)
        except Exception as exc:
            logger.warning("Could not drop old index %s on %s: %s", iname, coll_name, exc)


async def ensure_all_company_unique_indexes(db) -> None:
    for spec in COMPANY_UNIQUE_INDEXES:
        try:
            coll = db[spec["collection"]]
            await ensure_company_unique_index(
                coll,
                spec.get("old_names") or [],
                spec.get("old_keys") or [],
                spec["new_keys"],
                spec["name"],
                **(spec.get("opts") or {}),
            )
        except Exception as exc:
            logger.warning(
                "ensure_company_unique_index failed for %s/%s: %s",
                spec.get("collection"),
                spec.get("name"),
                exc,
            )
