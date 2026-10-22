"""
backend/app/core/owner_audit.py
Tamper-evident, insert-only audit log for owner actions with cryptographic hash chain.
No update or delete code paths exist.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bson import json_util


def _format_dt(dt: Any) -> str:
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
    return str(dt)


async def record_owner_audit_event(
    global_db: Any,
    action: str,
    actor_user_id: Optional[str] = None,
    target_company_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Appends an immutable audit entry to owner_audit with previous hash chain link."""
    raw_now = datetime.now(timezone.utc)
    # BSON datetimes have millisecond precision; truncate to ensure exact match on read
    now = raw_now.replace(microsecond=(raw_now.microsecond // 1000) * 1000)
    details_cleaned = dict(details or {})

    # Strip any potential secrets or sensitive values
    for secret_key in ("password", "token", "secret", "refresh_token", "hash"):
        if secret_key in details_cleaned:
            details_cleaned[secret_key] = "[REDACTED]"

    # Find the latest audit record to get previous hash
    last_record = await global_db.owner_audit.find_one(
        {},
        sort=[("created_at", -1), ("_id", -1)]
    )
    prev_hash = last_record["hash"] if (last_record and "hash" in last_record) else ("0" * 64)

    # Compute deterministic SHA-256 hash using canonical datetime string
    canonical_repr = (
        f"{prev_hash}|{_format_dt(now)}|{action}|"
        f"{actor_user_id or ''}|{target_company_id or ''}|"
        f"{json_util.dumps(details_cleaned, sort_keys=True)}"
    )
    curr_hash = hashlib.sha256(canonical_repr.encode("utf-8")).hexdigest()

    entry = {
        "id": f"audit_{uuid.uuid4().hex[:16]}",
        "prev_hash": prev_hash,
        "hash": curr_hash,
        "action": action,
        "actor_user_id": actor_user_id,
        "target_company_id": target_company_id,
        "details": details_cleaned,
        "created_at": now,
    }

    await global_db.owner_audit.insert_one(entry)
    return entry


async def verify_owner_audit_chain(global_db: Any) -> tuple[bool, List[str]]:
    """Validates the entire owner_audit hash chain from genesis to head."""
    cursor = global_db.owner_audit.find({}).sort("created_at", 1)
    expected_prev = "0" * 64
    errors = []

    async for doc in cursor:
        prev_h = doc.get("prev_hash")
        curr_h = doc.get("hash")
        if prev_h != expected_prev:
            errors.append(f"Chain break at record {doc.get('id')}: prev_hash {prev_h} != expected {expected_prev}")

        canonical_repr = (
            f"{prev_h}|{_format_dt(doc.get('created_at'))}|{doc.get('action')}|"
            f"{doc.get('actor_user_id') or ''}|{doc.get('target_company_id') or ''}|"
            f"{json_util.dumps(doc.get('details', {}), sort_keys=True)}"
        )
        calculated_h = hashlib.sha256(canonical_repr.encode("utf-8")).hexdigest()
        if calculated_h != curr_h:
            errors.append(f"Content tampering at record {doc.get('id')}: hash {curr_h} != recalculated {calculated_h}")

        expected_prev = curr_h

    return (len(errors) == 0, errors)
