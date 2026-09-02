"""Encrypt plaintext ad_account_credentials in MongoDB.

Run from the backend/ directory:

    python -m app.migrate_ad_credentials
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from app.core.encryption import encrypt_string
from app.database import close_mongo_connection, connect_to_mongo, get_database

logger = logging.getLogger("app.migrate_ad_credentials")

_SECRET_FIELDS = ("access_token", "refresh_token", "developer_token", "client_secret")


async def migrate_ad_credentials() -> Dict[str, Any]:
    await connect_to_mongo()
    db = get_database()
    if db is None:
        raise RuntimeError("Database unavailable.")

    scanned = 0
    updated = 0
    skipped = 0
    cursor = db.ad_account_credentials.find({})
    async for doc in cursor:
        scanned += 1
        updates: Dict[str, str] = {}
        for field in _SECRET_FIELDS:
            value = doc.get(field)
            if not value or not str(value).strip():
                continue
            text = str(value)
            if text.startswith("gAAAAA"):
                continue
            updates[field] = encrypt_string(text)
        if not updates:
            skipped += 1
            continue
        filt = {"_id": doc["_id"]} if "_id" in doc else {"id": doc.get("id")}
        await db.ad_account_credentials.update_one(filt, {"$set": updates})
        updated += 1
        logger.info("Encrypted credentials for account_id=%s", doc.get("account_id"))

    return {"scanned": scanned, "updated": updated, "already_encrypted": skipped}


async def _main() -> None:
    logging.basicConfig(level=logging.INFO)
    result = await migrate_ad_credentials()
    logger.info("Migration complete: %s", result)
    print(result)
    await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(_main())
