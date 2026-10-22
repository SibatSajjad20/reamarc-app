"""Drive streaming must not refresh OAuth tokens on the event loop."""
from __future__ import annotations

import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services import google_drive_service as gdrive


class _FakeResp:
    status_code = 200
    headers = {}

    async def aiter_bytes(self, _n=256 * 1024):
        if False:
            yield b""

    async def aclose(self):
        return None


class _FakeClient:
    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.get("timeout")

    def build_request(self, *args, **kwargs):
        return object()

    async def send(self, *args, **kwargs):
        return _FakeResp()

    async def aclose(self):
        return None


class TestOpenDriveResponseOffLoop(unittest.IsolatedAsyncioTestCase):
    async def test_uses_get_access_token_in_a_thread(self):
        refresh = MagicMock()
        creds = SimpleNamespace(valid=False, expired=True, token="stale", refresh=refresh)
        get_token = MagicMock(return_value="fresh-token")

        with patch.object(gdrive, "_cached_file_meta", return_value={"name": "clip.mp4", "mimeType": "video/mp4", "size": "10"}), patch.object(
            gdrive, "get_access_token", get_token
        ), patch.object(gdrive, "_credentials", return_value=creds), patch(
            "app.services.google_drive_service.httpx.AsyncClient", _FakeClient
        ):
            response = await gdrive.open_drive_response("file123", "clip.mp4")
            async for _chunk in response.body_iterator:
                pass

        get_token.assert_called_once()
        refresh.assert_not_called()
        self.assertEqual(response.status_code, 200)

    def test_drive_attachment_indexes_are_registered(self):
        from app.core.index_migration import LOOKUP_INDEXES

        names = {spec["name"] for spec in LOOKUP_INDEXES}
        self.assertIn("idx_cc_attachments_gdrive_file_id", names)
        self.assertIn("idx_cc_attachments_gdrive_thumb_file_id", names)
