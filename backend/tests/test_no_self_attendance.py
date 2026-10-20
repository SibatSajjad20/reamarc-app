"""Throwaway-DB coverage for HR/Ops/Admin attendance and request gates."""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

TEST_DB = "reamarc_no_self_attendance_test"
assert "test" in TEST_DB
assert TEST_DB != "reamarc_db"
assert "reamarc_db" not in TEST_DB

os.environ["MONGODB_DB_NAME"] = TEST_DB
os.environ["MONGODB_URL"] = "mongodb://127.0.0.1:27017"
os.environ.setdefault("SECRET_KEY", "test-secret-key-min-32-characters-long!!")
os.environ["IS_PRODUCTION"] = "false"
os.environ["COOKIE_SECURE"] = "false"
os.environ["ENVIRONMENT"] = "development"

from app.config import settings  # noqa: E402

object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
object.__setattr__(settings, "MONGODB_URL", "mongodb://127.0.0.1:27017")
object.__setattr__(settings, "IS_PRODUCTION", False)

assert "test" in settings.MONGODB_DB_NAME
assert settings.MONGODB_DB_NAME != "reamarc_db"
assert "localhost" in settings.MONGODB_URL or "127.0.0.1" in settings.MONGODB_URL

from fastapi.testclient import TestClient  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from app.services.attendance_permissions import (  # noqa: E402
    can_change_attendance,
    can_review_request,
)
from fastapi import HTTPException  # noqa: E402

API = "/api/v1"
DATE = "2026-10-20"

USERS = {
    "hr1": {
        "id": "hr1",
        "email": "hr1@test.local",
        "full_name": "HR One",
        "name": "HR One",
        "role": "hr",
        "department": "HR",
        "primary_department": "HR",
        "is_active": True,
        "access": {"attendance": True, "daily_log": True},
    },
    "ops1": {
        "id": "ops1",
        "email": "ops1@test.local",
        "full_name": "Ops One",
        "name": "Ops One",
        "role": "operations",
        "department": "operations",
        "primary_department": "operations",
        "is_active": True,
        "access": {"attendance": True, "daily_log": False},
    },
    "admin1": {
        "id": "admin1",
        "email": "admin1@test.local",
        "full_name": "Admin One",
        "name": "Admin One",
        "role": "admin",
        "department": "operations",
        "primary_department": "operations",
        "is_active": True,
        "access": {"attendance": True, "daily_log": True},
    },
    "tm1": {
        "id": "tm1",
        "email": "tm1@test.local",
        "full_name": "Team Member One",
        "name": "Team Member One",
        "role": "team_member",
        "department": "content",
        "primary_department": "content",
        "is_active": True,
        "access": {"attendance": True, "daily_log": True},
    },
}


def _sync_db():
    client = MongoClient("mongodb://127.0.0.1:27017", serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    name = TEST_DB
    assert "test" in name and name != "reamarc_db"
    return client, client[name]


def _token(user_id: str) -> str:
    user = USERS[user_id]
    return create_access_token(
        {
            "sub": user["id"],
            "email": user["email"],
            "name": user["full_name"],
            "role": user["role"],
        }
    )


def _auth(user_id: str) -> dict:
    return {"Authorization": f"Bearer {_token(user_id)}"}


def _seed(db):
    db.users.delete_many({"id": {"$in": list(USERS.keys())}})
    db.leave_requests.delete_many({"id": {"$regex": "^lr_test_"}})
    db.attendance_records.delete_many({"user_id": {"$in": list(USERS.keys())}})
    db.daily_log_day_scores.delete_many({"user_id": {"$in": list(USERS.keys())}})
    db.users.insert_many(list(USERS.values()))
    rows = [
        {
            "id": "lr_test_tm1",
            "user_id": "tm1",
            "user_name": "Team Member One",
            "user_role": "team_member",
            "leave_type": "wfh",
            "start_date": DATE,
            "end_date": DATE,
            "reason": "WFH",
            "status": "pending",
        },
        {
            "id": "lr_test_ops1",
            "user_id": "ops1",
            "user_name": "Ops One",
            "user_role": "operations",
            "leave_type": "wfh",
            "start_date": DATE,
            "end_date": DATE,
            "reason": "WFH",
            "status": "pending",
        },
        {
            "id": "lr_test_hr1",
            "user_id": "hr1",
            "user_name": "HR One",
            "user_role": "hr",
            "leave_type": "wfh",
            "start_date": DATE,
            "end_date": DATE,
            "reason": "WFH",
            "status": "pending",
        },
        {
            "id": "lr_test_ops_own",
            "user_id": "ops1",
            "user_name": "Ops One",
            "user_role": "operations",
            "leave_type": "wfh",
            "start_date": "2026-10-21",
            "end_date": "2026-10-21",
            "reason": "own",
            "status": "pending",
        },
        {
            "id": "lr_test_hr_own",
            "user_id": "hr1",
            "user_name": "HR One",
            "user_role": "hr",
            "leave_type": "wfh",
            "start_date": "2026-10-21",
            "end_date": "2026-10-21",
            "reason": "own",
            "status": "pending",
        },
    ]
    db.leave_requests.insert_many(rows)


def _manual_entry(client: TestClient, actor: str, target: str):
    return client.post(
        f"{API}/attendance/admin/manual-entry",
        headers=_auth(actor),
        json={
            "user_id": target,
            "date": DATE,
            "check_in": "09:30",
            "check_out": "18:30",
            "status": "present",
            "notes": "test override",
        },
    )


def _review(client: TestClient, actor: str, request_id: str):
    return client.patch(
        f"{API}/leaves/requests/{request_id}/status",
        headers=_auth(actor),
        json={"status": "approved", "review_comments": "ok"},
    )


def test_attendance_and_request_gates_and_recompute():
    mongo, db = _sync_db()
    try:
        with TestClient(app) as client:
            _seed(db)

            assert _manual_entry(client, "hr1", "tm1").status_code == 200
            assert _manual_entry(client, "hr1", "ops1").status_code == 200
            assert _manual_entry(client, "hr1", "hr1").status_code == 403

            assert _manual_entry(client, "ops1", "tm1").status_code == 403
            assert _manual_entry(client, "ops1", "ops1").status_code == 403
            assert _manual_entry(client, "ops1", "hr1").status_code == 403

            assert _manual_entry(client, "admin1", "hr1").status_code == 200
            assert _manual_entry(client, "admin1", "admin1").status_code == 403

            rec = db.attendance_records.find_one({"user_id": "tm1", "date": DATE})
            assert rec and rec.get("id")
            override = client.patch(
                f"{API}/attendance/records/{rec['id']}/override",
                headers=_auth("hr1"),
                json={
                    "date": DATE,
                    "punch_in": "09:35",
                    "punch_out": "18:30",
                    "status": "present",
                    "notes": "record override",
                },
            )
            assert override.status_code == 200

            score = db.daily_log_day_scores.find_one({"user_id": "tm1", "date": DATE})
            assert score is not None
            assert score.get("role") == "team_member"

            assert _review(client, "ops1", "lr_test_tm1").status_code == 200
            assert _review(client, "ops1", "lr_test_ops_own").status_code == 403
            assert _review(client, "ops1", "lr_test_hr1").status_code == 403
            assert _review(client, "hr1", "lr_test_ops1").status_code == 200
            assert _review(client, "hr1", "lr_test_hr_own").status_code == 403
            assert _review(client, "admin1", "lr_test_hr1").status_code == 200
    finally:
        mongo.drop_database(TEST_DB)
        mongo.close()


def test_permission_helpers_raise_403():
    hr = USERS["hr1"]
    ops = USERS["ops1"]
    admin = USERS["admin1"]
    tm = USERS["tm1"]

    assert can_change_attendance(hr, tm) is True
    assert can_change_attendance(hr, ops) is True
    try:
        can_change_attendance(hr, hr)
        raise AssertionError("expected 403")
    except HTTPException as exc:
        assert exc.status_code == 403
        assert "own attendance" in str(exc.detail)

    for target in (tm, ops, hr):
        try:
            can_change_attendance(ops, target)
            raise AssertionError("expected 403")
        except HTTPException as exc:
            assert exc.status_code == 403

    assert can_change_attendance(admin, hr) is True
    try:
        can_change_attendance(admin, admin)
        raise AssertionError("expected 403")
    except HTTPException as exc:
        assert exc.status_code == 403

    assert can_review_request(ops, tm) is True
    try:
        can_review_request(ops, ops)
        raise AssertionError("expected 403")
    except HTTPException as exc:
        assert exc.status_code == 403
    try:
        can_review_request(ops, hr)
        raise AssertionError("expected 403")
    except HTTPException as exc:
        assert exc.status_code == 403

    assert can_review_request(hr, ops) is True
    try:
        can_review_request(hr, hr)
        raise AssertionError("expected 403")
    except HTTPException as exc:
        assert exc.status_code == 403
    assert can_review_request(admin, hr) is True
