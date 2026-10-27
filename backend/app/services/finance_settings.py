"""Finance settings, accounts initialization, and service catalog management."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pymongo import ASCENDING, IndexModel

from app.schemas.finance import (
    BankAccountConfig,
    FinanceSettingsBase,
    FinanceSettingsUpdate,
    FinanceServiceCreate,
    FinanceServiceUpdate,
)

logger = logging.getLogger(__name__)

DEFAULT_SERVICES_LIST = [
    "Digital Marketing Strategy",
    "Social Media Marketing (SMM)",
    "Social Media Management",
    "Performance Marketing Services",
    "Search Engine Optimization (SEO)",
    "Website Design and Development",
    "Website Maintenance and Support",
    "Branding and Brand Identity Design",
    "Logo Design and Graphic Design",
    "Content Creation and Copywriting",
    "Video Editing and Promotional Videos",
    "Video Scripts and Storyboarding",
    "Professional Video Shoots",
    "Professional Photography Shoots",
    "Drone Video Shoots and Aerial Photography",
    "Google Business Profile Management",
    "Marketing Analytics, Tracking, and Reporting",
    "Campaign Management and Optimization",
    "Digital Marketing Consultation",
    "Business Promotion and Online Brand Awareness",
    "Professional Video Shoots + Photography Shoots",
]

# New companies get bank slots with no account details; invoices cannot be issued
# until the company enters its own (see has_bank_details / issue_invoice).
DEFAULT_BANK_ACCOUNTS = [
    BankAccountConfig(bank_id="meezan", bank_name="Meezan Bank"),
    BankAccountConfig(bank_id="abl", bank_name="Allied Bank Limited"),
]

BANK_DETAILS_REQUIRED_MESSAGE = (
    "Add your bank account number or IBAN in Finance settings before issuing invoices."
)


def has_bank_details(settings: Optional[Dict[str, Any]]) -> bool:
    for b in (settings or {}).get("bank_accounts") or []:
        if not isinstance(b, dict):
            continue
        if str(b.get("account_number") or "").strip() or str(b.get("iban") or "").strip():
            return True
    return False


async def _company_display_name(db, company_id: str) -> str:
    try:
        from app.core.tenant import get_global_db

        gdb = get_global_db()
        src = gdb if gdb is not None else db
        doc = await src["companies"].find_one({"id": company_id}, {"name": 1})
        return str((doc or {}).get("name") or "").strip()
    except Exception:
        return ""


async def ensure_finance_indexes(db) -> None:
    """Ensure indexes on all finance collections."""
    if db is None:
        return
    try:
        # Settings: unique per company
        await db["finance_settings"].create_indexes([
            IndexModel([("company_id", ASCENDING)], unique=True, name="uniq_finance_settings_company"),
        ])
        # Accounts: unique (company_id, code)
        await db["finance_accounts"].create_indexes([
            IndexModel([("company_id", ASCENDING), ("code", ASCENDING)], unique=True, name="uniq_finance_acc_company_code"),
        ])
        # Services: (company_id, name)
        await db["finance_services"].create_indexes([
            IndexModel([("company_id", ASCENDING), ("name", ASCENDING)], name="idx_finance_services_comp_name"),
            IndexModel([("company_id", ASCENDING), ("is_active", ASCENDING)], name="idx_finance_services_active"),
        ])
        # Invoices
        await db["invoices"].create_indexes([
            IndexModel([("company_id", ASCENDING), ("number", ASCENDING)], unique=True, name="uniq_invoice_number"),
            IndexModel([("company_id", ASCENDING), ("workspace_id", ASCENDING)], name="idx_invoice_workspace"),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)], name="idx_invoice_status"),
            IndexModel([("company_id", ASCENDING), ("due_date", ASCENDING)], name="idx_invoice_due_date"),
            IndexModel([("company_id", ASCENDING), ("issue_date", ASCENDING)], name="idx_invoice_issue_date"),
            IndexModel([("share_token", ASCENDING)], sparse=True, name="idx_invoice_share_token"),
        ])
        # Receipts
        await db["receipts"].create_indexes([
            IndexModel([("company_id", ASCENDING), ("number", ASCENDING)], unique=True, name="uniq_receipt_number"),
            IndexModel([("company_id", ASCENDING), ("workspace_id", ASCENDING)], name="idx_receipt_workspace"),
            IndexModel([("company_id", ASCENDING), ("date", ASCENDING)], name="idx_receipt_date"),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)], name="idx_receipt_status"),
        ])
        # Ledger
        await db["finance_ledger"].create_indexes([
            IndexModel([("company_id", ASCENDING), ("account_code", ASCENDING), ("date", ASCENDING)], name="idx_ledger_acc_date"),
            IndexModel([("company_id", ASCENDING), ("source_type", ASCENDING), ("source_id", ASCENDING)], name="idx_ledger_source"),
        ])
        # Transfers
        await db["finance_transfers"].create_indexes([
            IndexModel([("company_id", ASCENDING), ("date", ASCENDING)], name="idx_transfers_date"),
        ])
        # Recurring
        await db["recurring_invoices"].create_indexes([
            IndexModel([("company_id", ASCENDING), ("is_active", ASCENDING), ("next_run_date", ASCENDING)], name="idx_recurring_due"),
        ])
        # Audit
        await db["finance_audit"].create_indexes([
            IndexModel([("company_id", ASCENDING), ("created_at", ASCENDING)], name="idx_finance_audit_time"),
        ])
        logger.info("Finance collection indexes ensured successfully")
    except Exception as exc:
        logger.warning(f"Error ensuring finance indexes: {exc}")


async def get_or_init_finance_settings(db, company_id: str) -> Dict[str, Any]:
    """Retrieve finance settings for company, initializing defaults on first call."""
    coll = db["finance_settings"]
    doc = await coll.find_one({"company_id": company_id})
    if doc:
        return doc

    base = FinanceSettingsBase(
        company_name=await _company_display_name(db, company_id),
        bank_accounts=DEFAULT_BANK_ACCOUNTS,
    )
    doc = base.model_dump()
    doc["id"] = f"fset_{uuid.uuid4().hex[:12]}"
    doc["company_id"] = company_id
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        await coll.insert_one(doc)
    except Exception:
        # Concurrent insert handled
        doc = await coll.find_one({"company_id": company_id})

    # Also seed initial accounts and services on first settings initialization
    await seed_default_accounts(db, company_id)
    await seed_default_services(db, company_id)

    return doc


async def update_finance_settings(
    db,
    company_id: str,
    payload: FinanceSettingsUpdate,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Update company finance settings, recording old and new values in finance_audit."""
    before = await get_or_init_finance_settings(db, company_id)
    coll = db["finance_settings"]
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        return await coll.find_one({"company_id": company_id})

    changes = {
        k: {"old": before.get(k), "new": v}
        for k, v in update_data.items()
        if before.get(k) != v
    }
    now = datetime.now(timezone.utc).isoformat()
    update_data["updated_at"] = now
    await coll.update_one({"company_id": company_id}, {"$set": update_data})
    if changes:
        await db["finance_audit"].insert_one({
            "id": f"aud_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "action": "settings_bank_update" if "bank_accounts" in changes else "settings_update",
            "entity_type": "finance_settings",
            "entity_id": before.get("id"),
            "details": {"changes": changes},
            "user_id": user_id,
            "user_name": user_name,
            "created_at": now,
        })
    return await coll.find_one({"company_id": company_id})


async def seed_default_accounts(db, company_id: str) -> None:
    """Ensure CASH, ABL, and MEEZAN exist in finance_accounts for the company."""
    coll = db["finance_accounts"]
    accounts_to_seed = [
        {
            "id": f"acc_cash_{company_id}",
            "company_id": company_id,
            "code": "cash",
            "name": "Cash in Hand",
            "bank_name": "Cash",
            "account_number": "CASH-MAIN",
            "iban": "",
            "currency": "PKR",
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": f"acc_abl_{company_id}",
            "company_id": company_id,
            "code": "abl",
            "name": "Allied Bank Limited",
            "bank_name": "Allied Bank Limited",
            "account_number": "",
            "iban": "",
            "currency": "PKR",
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": f"acc_meezan_{company_id}",
            "company_id": company_id,
            "code": "meezan",
            "name": "Meezan Bank",
            "bank_name": "Meezan Bank",
            "account_number": "",
            "iban": "",
            "currency": "PKR",
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]

    for acc in accounts_to_seed:
        existing = await coll.find_one({"company_id": company_id, "code": acc["code"]})
        if not existing:
            try:
                await coll.insert_one(acc)
            except Exception:
                pass


async def seed_default_services(db, company_id: str) -> None:
    """Ensure the 21 standard agency services exist in finance_services for company."""
    coll = db["finance_services"]
    now = datetime.now(timezone.utc).isoformat()
    for name in DEFAULT_SERVICES_LIST:
        existing = await coll.find_one({"company_id": company_id, "name": name})
        if not existing:
            service_doc = {
                "id": f"srv_{uuid.uuid4().hex[:10]}",
                "company_id": company_id,
                "name": name,
                "default_rate": 0,
                "currency": "PKR",
                "description": "",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
            try:
                await coll.insert_one(service_doc)
            except Exception:
                pass


async def get_services(db, company_id: str, active_only: bool = True) -> List[Dict[str, Any]]:
    """List service catalog items for company."""
    coll = db["finance_services"]
    query: Dict[str, Any] = {"company_id": company_id}
    if active_only:
        query["is_active"] = True
    cursor = coll.find(query).sort("name", ASCENDING)
    results = await cursor.to_list(length=200)
    if not results:
        # First-time seed
        await seed_default_services(db, company_id)
        cursor = coll.find(query).sort("name", ASCENDING)
        results = await cursor.to_list(length=200)
    return results


async def create_service(
    db, company_id: str, payload: FinanceServiceCreate
) -> Dict[str, Any]:
    """Create a new service catalog item."""
    coll = db["finance_services"]
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc["id"] = f"srv_{uuid.uuid4().hex[:10]}"
    doc["company_id"] = company_id
    doc["created_at"] = now
    doc["updated_at"] = now
    await coll.insert_one(doc)
    return doc


async def update_service(
    db, company_id: str, service_id: str, payload: FinanceServiceUpdate
) -> Optional[Dict[str, Any]]:
    """Update an existing service catalog item."""
    coll = db["finance_services"]
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        return await coll.find_one({"company_id": company_id, "id": service_id})
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await coll.find_one_and_update(
        {"company_id": company_id, "id": service_id},
        {"$set": update_data},
        return_document=True,
    )
    return result
