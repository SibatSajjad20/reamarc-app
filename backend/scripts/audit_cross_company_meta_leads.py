"""Read-only audit: non-Reamarc CRM leads sourced from Reamarc Meta pages.

Dry-run only. Refuses to run unless the database name ends with `_test_db`
or `--i-know-this-is-live-readonly` is passed.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Set

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))


def _assert_safe_db(db_name: str, live_ok: bool) -> None:
    name = (db_name or "").strip()
    if name.endswith("_test_db"):
        return
    if live_ok:
        return
    raise SystemExit(
        "Refusing to run: database name must end with '_test_db' "
        "or pass --i-know-this-is-live-readonly."
    )


async def _run(args: argparse.Namespace, db=None) -> Dict[str, Any]:
    from motor.motor_asyncio import AsyncIOMotorClient

    from app.config import settings
    from app.core.integrations import REAMARC_TENANT_IDS, is_reamarc_company

    _assert_safe_db(getattr(settings, "MONGODB_DB_NAME", "") or "", args.i_know_this_is_live_readonly)
    client = None
    if db is None:
        client = AsyncIOMotorClient(settings.MONGODB_URL)
        db = client[settings.MONGODB_DB_NAME]
    if db is None:
        if client is not None:
            client.close()
        raise SystemExit("Database unavailable.")

    try:
        env_page = (settings.CRM_META_PAGE_ID or "").strip()
        reamarc_pages: Set[str] = set()
        if env_page:
            reamarc_pages.add(env_page)
        cursor = db.crm_meta_pages.find(
            {"$or": [{"company_id": {"$in": list(REAMARC_TENANT_IDS)}}, {"company_id": {"$exists": False}}]},
            {"page_id": 1, "company_id": 1},
        )
        async for doc in cursor:
            pid = str(doc.get("page_id") or "").strip()
            cid = doc.get("company_id")
            if pid and (is_reamarc_company(cid) or (not cid and pid == env_page)):
                reamarc_pages.add(pid)

        companies: Dict[str, Dict[str, Any]] = {}
        async for lead in db.crm_leads.find({}, {"id": 1, "company_id": 1, "attribution": 1, "raw_payload": 1}):
            cid = lead.get("company_id") or "company_reamarc"
            if is_reamarc_company(cid):
                continue
            attr = lead.get("attribution") or {}
            payload = lead.get("raw_payload") or {}
            meta = payload.get("meta_lead") if isinstance(payload, dict) else {}
            page_id = str(
                attr.get("page_id")
                or (meta or {}).get("page_id")
                or ""
            ).strip()
            if not page_id or page_id not in reamarc_pages:
                continue
            bucket = companies.setdefault(cid, {"company_id": cid, "count": 0, "sample_ids": []})
            bucket["count"] += 1
            if len(bucket["sample_ids"]) < 20 and lead.get("id"):
                bucket["sample_ids"].append(str(lead["id"]))

        return {
            "reamarc_page_ids": sorted(reamarc_pages),
            "companies": list(companies.values()),
            "total_copied_leads": sum(c["count"] for c in companies.values()),
        }
    finally:
        if client is not None:
            client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit Meta leads copied into non-Reamarc companies (read-only).")
    parser.add_argument("--json", dest="json_path", help="Write JSON report to this path.")
    parser.add_argument(
        "--i-know-this-is-live-readonly",
        action="store_true",
        help="Allow running against a non-_test_db database (still read-only).",
    )
    args = parser.parse_args()
    report = asyncio.run(_run(args))
    text = json.dumps(report, indent=2)
    if args.json_path:
        Path(args.json_path).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
