"""Read-only audit: non-Reamarc companies whose stored attendance settings
contain Reamarc built-in office IPs or HQ lat/lng.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

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


async def _run(args: argparse.Namespace) -> dict:
    from app.config import settings
    from app.constants.office_location import OFFICE_LATITUDE, OFFICE_LONGITUDE, get_built_in_office_ips
    from app.core.integrations import is_reamarc_company
    from app.database import close_mongo_connection, connect_to_mongo, db_instance

    _assert_safe_db(getattr(settings, "MONGODB_DB_NAME", "") or "", args.i_know_this_is_live_readonly)
    await connect_to_mongo()
    db = db_instance.db
    if db is None:
        raise SystemExit("Database unavailable.")

    builtin = set(get_built_in_office_ips())
    hits = []
    async for doc in db.system_config.find({"key": "attendance_security"}):
        cid = doc.get("company_id")
        if is_reamarc_company(cid):
            continue
        ips = set()
        for key in ("office_public_ips", "office_ip_whitelist"):
            for item in doc.get(key) or []:
                text = str(item or "").strip()
                if text:
                    ips.add(text)
        lat = doc.get("office_latitude")
        lng = doc.get("office_longitude")
        has_ips = bool(ips & builtin)
        has_pin = (lat == OFFICE_LATITUDE and lng == OFFICE_LONGITUDE)
        if has_ips or has_pin:
            hits.append({
                "company_id": cid,
                "has_built_in_ips": has_ips,
                "has_reamarc_lat_lng": has_pin,
            })
    await close_mongo_connection()
    return {"companies": hits, "count": len(hits)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit Reamarc attendance defaults on other companies.")
    parser.add_argument("--json", dest="json_path")
    parser.add_argument("--i-know-this-is-live-readonly", action="store_true")
    args = parser.parse_args()
    report = asyncio.run(_run(args))
    text = json.dumps(report, indent=2)
    if args.json_path:
        Path(args.json_path).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
