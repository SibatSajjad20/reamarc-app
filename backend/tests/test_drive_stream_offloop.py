"""Drive streaming must not refresh OAuth tokens on the event loop or leak slots."""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
from fastapi import HTTPException

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services import google_drive_service as gdrive

_ASGI_SCOPE = {
    "type": "http",
    "asgi": {"version": "3.0"},
    "http_version": "1.1",
    "method": "GET",
    "scheme": "http",
    "path": "/file",
    "raw_path": b"/file",
    "query_string": b"",
    "headers": [],
    "client": ("127.0.0.1", 9),
    "server": ("test", 80),
}


_RealAsyncClient = httpx.AsyncClient


def _mock_transport_client(*args, **kwargs):
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"video-bytes")

    kwargs["transport"] = httpx.MockTransport(handler)
    return _RealAsyncClient(*args, **kwargs)


def _drive_open_patches():
    return patch.multiple(
        gdrive,
        _cached_file_meta=MagicMock(return_value={"name": "clip.mp4", "mimeType": "video/mp4", "size": "11"}),
        get_access_token=MagicMock(return_value="fresh-token"),
        _credentials=MagicMock(
            return_value=SimpleNamespace(valid=False, expired=True, token="stale", refresh=MagicMock())
        ),
    ), patch("app.services.google_drive_service.httpx.AsyncClient", _mock_transport_client)


class TestOpenDriveResponseOffLoop(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        gdrive._DRIVE_STREAM_SEM = asyncio.Semaphore(6)

    async def test_uses_get_access_token_in_a_thread(self):
        refresh = MagicMock()
        creds = SimpleNamespace(valid=False, expired=True, token="stale", refresh=refresh)
        get_token = MagicMock(return_value="fresh-token")

        with patch.object(gdrive, "_cached_file_meta", return_value={"name": "clip.mp4", "mimeType": "video/mp4", "size": "10"}), patch.object(
            gdrive, "get_access_token", get_token
        ), patch.object(gdrive, "_credentials", return_value=creds), patch(
            "app.services.google_drive_service.httpx.AsyncClient", _mock_transport_client
        ):
            response = await gdrive.open_drive_response("file123", "clip.mp4")
            async for _chunk in response.body_iterator:
                pass

        get_token.assert_called_once()
        refresh.assert_not_called()
        self.assertEqual(response.status_code, 200)

    async def test_abandoned_asgi_calls_release_all_slots(self):
        meta_patch, client_patch = _drive_open_patches()
        with meta_patch, client_patch:
            responses = [await gdrive.open_drive_response(f"file{i}", "clip.mp4") for i in range(6)]

        async def receive():
            return {"type": "http.disconnect"}

        async def send(_message):
            raise OSError("client gone")

        for resp in responses:
            with self.assertRaises(OSError):
                await resp(_ASGI_SCOPE, receive, send)

        self.assertEqual(gdrive._DRIVE_STREAM_SEM._value, 6)

    async def test_normal_stream_returns_slot(self):
        meta_patch, client_patch = _drive_open_patches()
        with meta_patch, client_patch:
            response = await gdrive.open_drive_response("file-ok", "clip.mp4")
            messages = []

            async def receive():
                return {"type": "http.disconnect"}

            async def send(message):
                messages.append(message)

            await response(_ASGI_SCOPE, receive, send)

        self.assertTrue(any(m.get("type") == "http.response.body" for m in messages))
        self.assertEqual(gdrive._DRIVE_STREAM_SEM._value, 6)

    async def test_busy_returns_503_after_wait(self):
        for _ in range(6):
            await gdrive._DRIVE_STREAM_SEM.acquire()
        try:
            with patch.object(gdrive, "_DRIVE_STREAM_ACQUIRE_TIMEOUT", 0.1):
                with self.assertRaises(HTTPException) as raised:
                    await gdrive.open_drive_response("file-busy", "clip.mp4")
            self.assertEqual(raised.exception.status_code, 503)
            self.assertEqual(raised.exception.headers.get("Retry-After"), "5")
        finally:
            for _ in range(6):
                gdrive._DRIVE_STREAM_SEM.release()

    def test_drive_attachment_indexes_are_registered(self):
        from app.core.index_migration import LOOKUP_INDEXES

        names = {spec["name"] for spec in LOOKUP_INDEXES}
        self.assertIn("idx_cc_attachments_gdrive_file_id", names)
        self.assertIn("idx_cc_attachments_gdrive_thumb_file_id", names)
