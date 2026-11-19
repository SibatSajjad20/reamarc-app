"""Media error responses are never cacheable (the browser would keep a broken thumbnail)."""
import os
import sys

os.environ.setdefault("SECRET_KEY", "test-secret-key-media-no-store-0123456789abcdef")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_unauthenticated_thumb_is_no_store():
    client = TestClient(app)
    r = client.get(f"{settings.API_V1_STR}/thumbs/content_calendar/x/asset_0.jpg?w=400")
    assert r.status_code >= 400
    assert r.headers["cache-control"] == "private, no-store"


def test_unauthenticated_upload_is_no_store():
    client = TestClient(app)
    r = client.get(f"{settings.API_V1_STR}/uploads/content_calendar/x/asset_0.jpg")
    assert r.status_code >= 400
    assert r.headers["cache-control"] == "private, no-store"
