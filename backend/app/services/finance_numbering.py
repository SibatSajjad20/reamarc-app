"""Atomic sequential numbering for Invoices and Receipts per company."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from pymongo import ReturnDocument

logger = logging.getLogger(__name__)


async def get_next_number(
    db,
    company_id: str,
    doc_type: str,  # "invoice" or "receipt"
    prefix: Optional[str] = None,
    year: Optional[int] = None,
) -> str:
    """Atomically increment and return the next formatted number for a document type.
    
    Example invoice: INV-2026-0001
    Example receipt: RCT-2026-0001
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
    
    # If prefix ends with hyphen or dash, format as PREFIX{year}-{seq:04d}
    if prefix.endswith("-"):
        return f"{prefix}{year}-{seq:04d}"
    else:
        return f"{prefix}-{year}-{seq:04d}"
