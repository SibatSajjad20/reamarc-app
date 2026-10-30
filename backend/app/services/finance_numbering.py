"""Atomic sequential numbering for Invoices and Receipts per company."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Optional
from pymongo import ReturnDocument

logger = logging.getLogger(__name__)

_FULL_YEAR_IN_NUMBER = re.compile(r"-(?:19|20)(\d{2})-")


def format_document_number(number: Optional[str]) -> str:
    """Display helper: INV-2026-0005 -> INV-26-0005. Two-digit years are unchanged."""
    if not number:
        return number or ""
    return _FULL_YEAR_IN_NUMBER.sub(r"-\1-", str(number), count=1)


async def get_next_number(
    db,
    company_id: str,
    doc_type: str,  # "invoice" or "receipt"
    prefix: Optional[str] = None,
    year: Optional[int] = None,
) -> str:
    """Atomically increment and return the next formatted number for a document type.

    Example invoice: INV-26-0001
    Example receipt: RCT-26-0001
    Counters still key off the full calendar year so sequences do not collide.
    """
    if year is None:
        year = datetime.now(timezone.utc).year

    default_prefix = "INV-" if doc_type == "invoice" else "RCT-"
    prefix = (prefix or default_prefix).strip()

    counter_coll = db["finance_counters"]
    counter_id = f"{company_id}:{doc_type}:{year}"

    doc = await counter_coll.find_one_and_update(
        {"_id": counter_id, "company_id": company_id, "year": year, "type": doc_type},
        {"$inc": {"seq": 1}, "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    seq = doc.get("seq", 1)
    year_short = year % 100

    if prefix.endswith("-"):
        return f"{prefix}{year_short:02d}-{seq:04d}"
    return f"{prefix}-{year_short:02d}-{seq:04d}"
