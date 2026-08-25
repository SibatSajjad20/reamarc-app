"""1:1 mobile device binding. Punch is rejected unless the phone UUID matches the user."""
from datetime import datetime, timezone
from typing import Optional
import uuid

from fastapi import HTTPException, status

from app.database import get_database

# Enforce 1:1 binding in production.
ENFORCE_ONE_DEVICE_ONE_ACCOUNT = True

# False until the Android APK is rolled out to everyone.
# Desktop / laptop check-in stays available while this is False.
# When True, every punch must come from a bound phone with biometrics.
ENFORCE_MOBILE_PUNCH_ONLY = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _format_device(doc: dict, user_doc: Optional[dict] = None) -> dict:
    user_name = None
    user_email = None
    if user_doc:
        user_name = user_doc.get("full_name") or user_doc.get("name")
        user_email = user_doc.get("email")
    return {
        "id": doc.get("id"),
        "user_id": doc.get("user_id"),
        "user_name": user_name,
        "user_email": user_email,
        "device_uuid": doc.get("device_uuid"),
        "device_name": doc.get("device_name"),
        "platform": doc.get("platform") or "android",
        "has_push_token": bool(doc.get("push_token")),
        "is_active": bool(doc.get("is_active", True)),
        "last_seen": doc.get("last_seen"),
        "created_at": doc.get("created_at"),
    }


async def assert_device_login_allowed(user_id: str, device_uuid: str) -> None:
    """Block login when this phone belongs to someone else, or this user is bound elsewhere."""
    if not ENFORCE_ONE_DEVICE_ONE_ACCOUNT:
        return
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")
    uuid_clean = (device_uuid or "").strip()
    if not uuid_clean:
        return

    owned = await db.mobile_devices.find_one(
        {"device_uuid": uuid_clean, "is_active": True},
        {"_id": 0},
    )
    if owned and owned.get("user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This phone is registered to another employee. Check-in is locked to one account per device.",
        )

    existing = await db.mobile_devices.find_one(
        {"user_id": user_id, "is_active": True},
        {"_id": 0},
    )
    if existing and existing.get("device_uuid") != uuid_clean:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is locked to another phone. Ask HR to transfer the device, then log in again.",
        )


async def register_device(
    user: dict,
    device_uuid: str,
    device_name: Optional[str] = None,
    platform: str = "android",
    push_token: Optional[str] = None,
) -> dict:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")

    user_id = user.get("id")
    uuid_clean = (device_uuid or "").strip()
    if not user_id or not uuid_clean:
        raise HTTPException(status_code=400, detail="Device UUID is required.")

    await assert_device_login_allowed(user_id, uuid_clean)

    now = _now_iso()
    existing = await db.mobile_devices.find_one(
        {"user_id": user_id, "device_uuid": uuid_clean, "is_active": True},
        {"_id": 0},
    )
    if existing:
        updates = {
            "last_seen": now,
            "device_name": device_name or existing.get("device_name"),
            "platform": platform or existing.get("platform"),
        }
        if push_token:
            updates["push_token"] = push_token.strip()
        await db.mobile_devices.update_one({"id": existing["id"]}, {"$set": updates})
        existing.update(updates)
        return _format_device(existing, user)

    doc = {
        "id": f"dev_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "device_uuid": uuid_clean,
        "device_name": (device_name or "").strip() or None,
        "platform": platform if platform in ("ios", "android") else "android",
        "push_token": (push_token or "").strip() or None,
        "is_active": True,
        "last_seen": now,
        "created_at": now,
    }
    await db.mobile_devices.insert_one(doc)
    doc.pop("_id", None)
    return _format_device(doc, user)


async def get_active_device_for_user(user_id: str) -> Optional[dict]:
    db = get_database()
    if db is None:
        return None
    return await db.mobile_devices.find_one(
        {"user_id": user_id, "is_active": True},
        {"_id": 0},
    )


async def require_bound_device(user_id: str, device_uuid: Optional[str]) -> dict:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")
    uuid_clean = (device_uuid or "").strip()
    if not uuid_clean:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Check-in and check-out are only available on the Reamarc mobile app.",
        )

    match = await db.mobile_devices.find_one(
        {"user_id": user_id, "device_uuid": uuid_clean, "is_active": True},
        {"_id": 0},
    )
    if match:
        await db.mobile_devices.update_one({"id": match["id"]}, {"$set": {"last_seen": _now_iso()}})
        return match

    if not ENFORCE_ONE_DEVICE_ONE_ACCOUNT:
        return {"user_id": user_id, "device_uuid": uuid_clean, "is_active": True}

    other_phone = await db.mobile_devices.find_one(
        {"device_uuid": uuid_clean, "is_active": True},
        {"_id": 0},
    )
    if other_phone:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This phone is registered to another employee.",
        )
    bound = await get_active_device_for_user(user_id)
    if bound:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is locked to another phone. Ask HR to transfer the device.",
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="This phone is not registered. Log in on the mobile app to bind your device.",
    )


async def enforce_mobile_punch(
    user_id: str,
    device_uuid: Optional[str],
    biometric_verified: Optional[bool],
    is_mocked: Optional[bool],
) -> dict:
    uuid_clean = (device_uuid or "").strip()
    if not ENFORCE_MOBILE_PUNCH_ONLY and not uuid_clean:
        return {}
    if is_mocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Virtual location detected. Turn off mock / fake GPS apps and try again.",
        )
    if biometric_verified is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unlock with Face ID, fingerprint, or your device PIN to punch.",
        )
    return await require_bound_device(user_id, device_uuid)


async def list_active_devices() -> list:
    db = get_database()
    if db is None:
        return []
    docs = await db.mobile_devices.find({"is_active": True}, {"_id": 0}).to_list(200)
    user_ids = [d.get("user_id") for d in docs if d.get("user_id")]
    users = {}
    if user_ids:
        async for u in db.users.find(
            {"$or": [{"id": {"$in": user_ids}}, {"_id": {"$in": user_ids}}]},
            {"_id": 1, "id": 1, "email": 1, "full_name": 1, "name": 1},
        ):
            uid = u.get("id") or str(u.get("_id"))
            users[uid] = u
            if u.get("id"):
                users[u["id"]] = u
            if "_id" in u:
                users[str(u["_id"])] = u
    return [_format_device(d, users.get(d.get("user_id"))) for d in docs]


async def transfer_device(user_id: Optional[str] = None, device_id: Optional[str] = None) -> dict:
    """Unbind the employee's phone so the next mobile login can register a new one."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable.")
    if not user_id and not device_id:
        raise HTTPException(status_code=400, detail="User ID or Device ID is required.")

    query: dict = {"is_active": True}
    if device_id:
        query["id"] = device_id
    elif user_id:
        query["user_id"] = user_id

    user_name = None
    if user_id:
        user = await db.users.find_one({"$or": [{"id": user_id}, {"_id": user_id}]}, {"_id": 0, "full_name": 1, "name": 1})
        if user:
            user_name = user.get("full_name") or user.get("name")

    result = await db.mobile_devices.update_many(
        query,
        {"$set": {"is_active": False, "push_token": None, "last_seen": _now_iso()}},
    )
    label = user_name or user_id or device_id or "device"
    return {
        "user_id": user_id,
        "device_id": device_id,
        "unbound": result.modified_count,
        "message": (
            f"Device unbound for {label} ({result.modified_count} device record(s) deactivated). "
            "They can log in on a new phone."
        ),
    }


async def active_devices(user_ids: Optional[list] = None) -> list:
    db = get_database()
    if db is None:
        return []
    query: dict = {"is_active": True}
    if user_ids:
        query["user_id"] = {"$in": user_ids}
    return await db.mobile_devices.find(query, {"_id": 0}).to_list(500)


async def devices_with_push_tokens(user_ids: Optional[list] = None) -> list:
    docs = await active_devices(user_ids)
    return [d for d in docs if d.get("push_token")]


async def reset_all_devices() -> int:
    """Purges all registered mobile device bindings for a clean slate."""
    db = get_database()
    if db is None:
        return 0
    result = await db.mobile_devices.delete_many({})
    return result.deleted_count

