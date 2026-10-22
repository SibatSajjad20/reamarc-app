"""Confirm serve_upload answers Range with 206 against labelled reamarc_test_db data."""
from __future__ import annotations

import io
import os
import socket
import sys
from pathlib import Path

os.environ["MONGODB_DB_NAME"] = "reamarc_test_db"
os.environ.setdefault("ENVIRONMENT", "development")

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import pytest
from fastapi.testclient import TestClient
from gridfs import GridFSBucket
from pymongo import MongoClient

LABEL = "video-playback-range-206"
USER_ID = "test-user-video-playback-range-206"
EMAIL = "video.playback.range@reamarc.test"
RELATIVE_KEY = f"labelled/{LABEL}/clip.bin"
SAMPLE_BYTES = bytes(range(256)) * 8  # 2048 bytes


def _allow_local_or_mongo(address, *args, **kwargs):
    host = address[0] if isinstance(address, tuple) else str(address)
    host_l = str(host).lower()
    if (
        host_l in {"127.0.0.1", "localhost", "::1"}
        or host_l.endswith(".mongodb.net")
        or host_l.endswith(".mongo.cosmos.azure.com")
    ):
        return _ORIG_CREATE_CONNECTION(address, *args, **kwargs)
    raise RuntimeError(f"outbound connection blocked: {address}")


_ORIG_CREATE_CONNECTION = socket.create_connection


@pytest.fixture(scope="module")
def client():
    socket.create_connection = _allow_local_or_mongo
    from app.config import settings

    settings.MONGODB_DB_NAME = "reamarc_test_db"
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
    socket.create_connection = _ORIG_CREATE_CONNECTION


def _test_db():
    from app.config import settings

    mongo = MongoClient(settings.MONGODB_URL)
    db = mongo["reamarc_test_db"]
    assert db.name == "reamarc_test_db"
    return mongo, db


def _seed_and_token():
    from app.core.security import create_access_token
    from app.core.uploads import uploads_root

    mongo, db = _test_db()
    try:
        db.users.update_one(
            {"id": USER_ID},
            {
                "$set": {
                    "id": USER_ID,
                    "email": EMAIL,
                    "full_name": "Range Sample Admin",
                    "role": "admin",
                    "is_active": True,
                    "session_epoch": 0,
                    "label": LABEL,
                }
            },
            upsert=True,
        )
        bucket = GridFSBucket(db, bucket_name="uploads")
        for doc in db["uploads.files"].find({"filename": RELATIVE_KEY}):
            bucket.delete(doc["_id"])
        bucket.upload_from_stream(
            RELATIVE_KEY,
            io.BytesIO(SAMPLE_BYTES),
            metadata={
                "original_name": "clip.bin",
                "content_type": "application/octet-stream",
                "stored_path": f"/uploads/{RELATIVE_KEY}",
                "label": LABEL,
                "uploaded_by": USER_ID,
            },
        )
        disk = uploads_root() / RELATIVE_KEY
        if disk.is_file():
            disk.unlink()
        return create_access_token({"sub": USER_ID, "email": EMAIL, "ver": 0})
    finally:
        mongo.close()


def _cleanup():
    from app.core.uploads import uploads_root

    mongo, db = _test_db()
    try:
        db.users.delete_many({"id": USER_ID, "label": LABEL})
        bucket = GridFSBucket(db, bucket_name="uploads")
        for doc in db["uploads.files"].find({"filename": RELATIVE_KEY}):
            bucket.delete(doc["_id"])
        disk = uploads_root() / RELATIVE_KEY
        if disk.is_file():
            disk.unlink()
    finally:
        mongo.close()


def test_serve_upload_range_returns_206(client: TestClient):
    token = _seed_and_token()
    try:
        response = client.get(
            f"/api/v1/uploads/{RELATIVE_KEY}",
            headers={
                "Authorization": f"Bearer {token}",
                "Range": "bytes=0-1023",
                "X-Requested-With": "XMLHttpRequest",
            },
        )
        assert response.status_code == 206, response.text
        assert response.headers.get("accept-ranges") == "bytes"
        assert response.headers.get("content-range") == "bytes 0-1023/2048"
        assert len(response.content) == 1024
        assert response.content == SAMPLE_BYTES[:1024]
    finally:
        _cleanup()
