"""A3 uploads, sanitising, hard-delete cascade, Drive storage (FIX3)."""
from __future__ import annotations

import asyncio
import os
import tempfile
import threading
import time
import unittest
from io import BytesIO
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI, HTTPException
from mongomock_motor import AsyncMongoMockClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.datastructures import Headers, UploadFile

from app.core.limiter import limiter
from app.core.security import get_current_user
from app.core.uploads import authorize_stored_upload
from app.database import db_instance
from app.main import app as full_app
from app.routers.tasks import router as tasks_router
from app.services import task_attachments, task_service
from tests.task_manager.conftest import ADMIN, HR, LEAD_CONTENT, LEAD_WEB, MEMBER_C1, MEMBER_WEB, OPS


def _upload(name: str, data: bytes, content_type: str) -> UploadFile:
    return UploadFile(filename=name, file=BytesIO(data), headers=Headers({"content-type": content_type}))


class UploadAuthzTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        for u in (ADMIN, HR, OPS, LEAD_CONTENT, LEAD_WEB, MEMBER_C1, MEMBER_WEB):
            await self.raw.users.insert_one(dict(u))
        self.actor = dict(ADMIN)
        self.app = FastAPI()
        self.app.state.limiter = limiter
        self.app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        self.app.include_router(tasks_router, prefix="/api/v1")

        async def _user():
            return self.actor

        self.app.dependency_overrides[get_current_user] = _user
        full_app.dependency_overrides[get_current_user] = _user
        patch("app.services.task_service.ensure_task_indexes", new_callable=AsyncMock).start()
        patch("app.services.task_notifications.notify_assigned", new_callable=AsyncMock).start()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        full_app.dependency_overrides.pop(get_current_user, None)
        patch.stopall()

    async def test_uploads_and_thumbs_tasks_404_for_privileged_roles(self):
        for actor in (ADMIN, HR, OPS, LEAD_CONTENT):
            with self.assertRaises(HTTPException) as ctx:
                await authorize_stored_upload(self.raw, actor, "tasks/abc/file.png")
            self.assertEqual(ctx.exception.status_code, 404)
            with self.assertRaises(HTTPException) as ctx:
                await authorize_stored_upload(self.raw, actor, "tasks/abc/file.png")
            self.assertEqual(ctx.exception.status_code, 404)
        self.actor = dict(ADMIN)
        transport = httpx.ASGITransport(app=full_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/uploads/tasks/abc/file.png")
            self.assertEqual(res.status_code, 404)
            res = await ac.get("/thumbs/tasks/abc/file.png")
            self.assertEqual(res.status_code, 404)
            res = await ac.get("/api/v1/uploads/tasks/abc/file.png")
            self.assertEqual(res.status_code, 404)

    async def test_list_has_no_storage_key_and_task_route_works(self):
        t = await task_service.create_task(self.raw, {"title": "Files", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        await self.raw.task_attachments.insert_one(
            {
                "id": "tat_1",
                "task_id": t["id"],
                "kind": "upload",
                "name": "brief.pdf",
                "storage_key": f"tasks/{t['id']}/tat_1.pdf",
                "thumb": f"tasks/{t['id']}/tat_1_thumb.jpg",
            }
        )
        items = await task_attachments.list_attachments(self.raw, t["id"], LEAD_CONTENT)
        self.assertNotIn("storage_key", items[0])
        self.assertNotIn("thumb", items[0])
        self.assertTrue(items[0]["has_thumb"])

        transport = httpx.ASGITransport(app=self.app)
        self.actor = dict(LEAD_CONTENT)
        with patch("app.services.task_attachments.open_upload_response", new_callable=AsyncMock, return_value={"ok": True}):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
                res = await ac.get(f"/api/v1/tasks/{t['id']}/attachments/tat_1/file")
                self.assertEqual(res.status_code, 200)
                res = await ac.get(f"/api/v1/tasks/{t['id']}/attachments/tat_1/thumb")
                self.assertEqual(res.status_code, 200)
                self.actor = dict(MEMBER_WEB)
                res = await ac.get(f"/api/v1/tasks/{t['id']}/attachments/tat_1/file")
                self.assertEqual(res.status_code, 404)

    async def test_type_size_and_filename(self):
        self.assertEqual(task_attachments.sanitize_display_name("../../x\x00.pdf"), "x.pdf")
        self.assertEqual(task_attachments.stored_extension("Photo.PNG"), ".png")
        t = await task_service.create_task(self.raw, {"title": "Up", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)

        class _Huge:
            filename = "huge.pdf"
            content_type = "application/pdf"

            async def read(self, n: int = -1):
                return b"a" * (task_attachments.OTHER_MAX + 2)

        with self.assertRaises(HTTPException) as ctx:
            await task_attachments.upload_attachment(self.raw, t["id"], _Huge(), LEAD_CONTENT)
        self.assertEqual(ctx.exception.status_code, 413)

        class _Exe:
            filename = "payload.exe"
            content_type = "application/octet-stream"

            async def read(self, n: int = -1):
                return b"MZ"

        with self.assertRaises(HTTPException) as ctx:
            await task_attachments.upload_attachment(self.raw, t["id"], _Exe(), LEAD_CONTENT)
        self.assertEqual(ctx.exception.status_code, 415)

    async def test_hard_delete_cascades_subtasks(self):
        parent = await task_service.create_task(self.raw, {"title": "P", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        sub = await task_service.create_task(
            self.raw, {"title": "S", "assignee_id": MEMBER_C1["id"], "parent_id": parent["id"]}, LEAD_CONTENT
        )
        await self.raw.task_comments.insert_one({"id": "c1", "task_id": sub["id"], "text": "hi"})
        await self.raw.task_attachments.insert_one({"id": "a1", "task_id": sub["id"], "kind": "upload", "storage_key": "tasks/x"})
        with patch("app.services.task_attachments.delete_upload", new_callable=AsyncMock):
            await task_service.delete_task(self.raw, parent["id"], ADMIN)
        self.assertIsNone(await self.raw.tasks.find_one({"id": parent["id"]}))
        self.assertIsNone(await self.raw.tasks.find_one({"id": sub["id"]}))
        self.assertIsNone(await self.raw.task_comments.find_one({"task_id": sub["id"]}))
        tombs = await self.raw.task_activities.find({"type": "deleted"}).to_list(10)
        self.assertGreaterEqual(len(tombs), 2)

    async def _gridfs_count(self) -> int:
        try:
            return await self.raw["uploads.files"].count_documents({})
        except Exception:
            return 0

    async def test_drive_upload_skips_gridfs_and_hides_keys(self):
        t = await task_service.create_task(self.raw, {"title": "Brief", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        before = await self._gridfs_count()
        named = AsyncMock(return_value="item_fld")
        with patch("app.services.google_drive_service.configured", return_value=True), patch(
            "app.services.task_attachments.ensure_task_folder", new=AsyncMock(return_value="dept_fld")
        ), patch("app.services.task_attachments._ensure_named_folder", new=named), patch(
            "app.services.google_drive_service.upload_bytes", new=AsyncMock(return_value={"id": "drv_file"})
        ) as up, patch(
            "app.core.uploads.save_upload_bytes", new=AsyncMock()
        ) as spy_bytes, patch(
            "app.core.uploads.save_upload_from_path", new=AsyncMock()
        ) as spy_path:
            out = await task_attachments.upload_attachment(
                self.raw, t["id"], _upload("brief.pdf", b"%PDF-1.4 hi", "application/pdf"), LEAD_CONTENT
            )
        self.assertFalse(spy_bytes.called)
        self.assertFalse(spy_path.called)
        self.assertEqual(await self._gridfs_count(), before)
        self.assertNotIn("storage_key", out)
        self.assertNotIn("thumb_key", out)
        named.assert_awaited()
        idx = named.await_args.args[2]
        folder_name = named.await_args.args[3]
        parent = named.await_args.args[4]
        self.assertEqual(idx, f"task_item:{t['id']}")
        self.assertTrue(folder_name.startswith(t["serial"]))
        self.assertIn("Brief", folder_name)
        self.assertEqual(parent, "dept_fld")
        self.assertEqual(up.await_args.args[0], "item_fld")
        stored = await self.raw.task_attachments.find_one({"task_id": t["id"]})
        self.assertEqual(stored["storage"], "drive")
        self.assertEqual(stored["drive_file_id"], "drv_file")
        self.assertTrue(str(stored.get("storage_key") or "").startswith("/uploads/gdrive/"))

    async def test_video_uses_upload_path_and_thumb(self):
        t = await task_service.create_task(self.raw, {"title": "Reel", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        with patch("app.services.google_drive_service.configured", return_value=True), patch(
            "app.services.task_attachments._task_item_folder", new=AsyncMock(return_value="item_fld")
        ), patch(
            "app.services.content_calendar_service._copy_upload_to_temp",
            new=AsyncMock(return_value=("/tmp/fake-clip.mp4", 12)),
        ), patch(
            "app.services.content_calendar_service.process_video_upload",
            return_value=("/tmp/fake-clip.mp4", b"jpeg-bytes", 8, 8, 1),
        ), patch(
            "app.services.google_drive_service.upload_path", new=AsyncMock(return_value={"id": "vid1"})
        ) as up_path, patch(
            "app.services.google_drive_service.upload_bytes", new=AsyncMock(return_value={"id": "th1"})
        ) as up_bytes, patch("os.unlink"):
            out = await task_attachments.upload_attachment(
                self.raw, t["id"], _upload("clip.mp4", b"not-read", "video/mp4"), LEAD_CONTENT
            )
        self.assertTrue(up_path.called)
        self.assertEqual(up_path.await_args.args[0], "item_fld")
        self.assertTrue(str(up_path.await_args.args[2]).endswith("fake-clip.mp4"))
        self.assertTrue(up_bytes.called)
        stored = await self.raw.task_attachments.find_one({"task_id": t["id"]})
        self.assertEqual(up_bytes.await_args.args[1], f"{stored['id']}_thumb.jpg")
        self.assertEqual(stored["drive_file_id"], "vid1")
        self.assertEqual(stored["drive_thumb_file_id"], "th1")
        self.assertTrue(out["has_thumb"])

    async def test_download_307_when_direct_url_else_proxy(self):
        t = await task_service.create_task(self.raw, {"title": "Dl", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        await self.raw.task_attachments.insert_one(
            {
                "id": "tat_drv",
                "task_id": t["id"],
                "kind": "upload",
                "storage": "drive",
                "drive_file_id": "drv_file",
                "storage_key": "/uploads/gdrive/drv_file/brief.pdf",
            }
        )
        self.actor = dict(LEAD_CONTENT)
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test", follow_redirects=False) as ac:
            with patch(
                "app.services.drive_direct.direct_download_url",
                new=AsyncMock(return_value="https://drive.google.com/uc?id=drv_file"),
            ):
                res = await ac.get(f"/api/v1/tasks/{t['id']}/attachments/tat_drv/file?download=1")
            self.assertEqual(res.status_code, 307)
            self.assertIn("drive.google.com", res.headers.get("location", ""))
            with patch("app.services.drive_direct.direct_download_url", new=AsyncMock(return_value=None)), patch(
                "app.services.task_attachments.open_upload_response",
                new=AsyncMock(return_value={"ok": True}),
            ) as proxy:
                res = await ac.get(f"/api/v1/tasks/{t['id']}/attachments/tat_drv/file?download=1")
            self.assertEqual(res.status_code, 200)
            self.assertTrue(proxy.called)

    async def test_delete_and_hard_delete_call_gdrive_delete_file(self):
        t = await task_service.create_task(self.raw, {"title": "Del", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        await self.raw.task_attachments.insert_one(
            {
                "id": "tat_d",
                "task_id": t["id"],
                "kind": "upload",
                "storage": "drive",
                "drive_file_id": "drv_main",
                "drive_thumb_file_id": "drv_th",
                "storage_key": "/uploads/gdrive/drv_main/x.pdf",
            }
        )
        with patch("app.services.google_drive_service.delete_file", new=AsyncMock()) as gone:
            await task_attachments.delete_attachment(self.raw, t["id"], "tat_d", LEAD_CONTENT)
        ids = [c.args[0] for c in gone.await_args_list]
        self.assertIn("drv_main", ids)
        self.assertIn("drv_th", ids)

        sub = await task_service.create_task(
            self.raw, {"title": "Sub", "assignee_id": MEMBER_C1["id"], "parent_id": t["id"]}, LEAD_CONTENT
        )
        await self.raw.task_attachments.insert_one(
            {
                "id": "tat_h",
                "task_id": sub["id"],
                "kind": "upload",
                "storage": "drive",
                "drive_file_id": "drv_sub",
                "storage_key": "/uploads/gdrive/drv_sub/y.pdf",
            }
        )
        with patch("app.services.google_drive_service.delete_file", new=AsyncMock()) as gone2:
            await task_service.delete_task(self.raw, t["id"], ADMIN)
        self.assertTrue(any(c.args[0] == "drv_sub" for c in gone2.await_args_list))

    async def test_drive_error_502_no_doc(self):
        t = await task_service.create_task(self.raw, {"title": "Boom", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        with patch("app.services.google_drive_service.configured", return_value=True), patch(
            "app.services.task_attachments._task_item_folder", new=AsyncMock(return_value="item_fld")
        ), patch(
            "app.services.google_drive_service.upload_bytes",
            new=AsyncMock(side_effect=RuntimeError("drive down")),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await task_attachments.upload_attachment(
                    self.raw, t["id"], _upload("x.pdf", b"data", "application/pdf"), LEAD_CONTENT
                )
        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIsNone(await self.raw.task_attachments.find_one({"task_id": t["id"]}))

    async def test_local_fallback_and_production_503(self):
        t = await task_service.create_task(self.raw, {"title": "Local", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        tmp = tempfile.mkdtemp()
        prev = os.environ.get("UPLOADS_DIR")
        os.environ["UPLOADS_DIR"] = tmp
        try:
            with patch("app.services.google_drive_service.configured", return_value=False), patch(
                "app.core.uploads.save_upload_bytes", new=AsyncMock()
            ) as spy:
                out = await task_attachments.upload_attachment(
                    self.raw, t["id"], _upload("note.txt", b"hello disk", "text/plain"), LEAD_CONTENT
                )
            self.assertFalse(spy.called)
            stored = await self.raw.task_attachments.find_one({"id": out["id"]})
            self.assertEqual(stored["storage"], "local")
            disk = os.path.join(tmp, "tasks", t["id"], f"{out['id']}.txt")
            self.assertTrue(os.path.isfile(disk))
            self.actor = dict(LEAD_CONTENT)
            transport = httpx.ASGITransport(app=self.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
                res = await ac.get(f"/api/v1/tasks/{t['id']}/attachments/{out['id']}/file")
            self.assertEqual(res.status_code, 200)
            await task_attachments.delete_attachment(self.raw, t["id"], out["id"], LEAD_CONTENT)
            self.assertFalse(os.path.isfile(disk))
        finally:
            if prev is None:
                os.environ.pop("UPLOADS_DIR", None)
            else:
                os.environ["UPLOADS_DIR"] = prev

        t2 = await task_service.create_task(self.raw, {"title": "Prod", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        with patch("app.services.google_drive_service.configured", return_value=False), patch(
            "app.services.task_attachments._is_production", return_value=True
        ):
            with self.assertRaises(HTTPException) as ctx:
                await task_attachments.upload_attachment(
                    self.raw, t2["id"], _upload("x.pdf", b"nope", "application/pdf"), LEAD_CONTENT
                )
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertIsNone(await self.raw.task_attachments.find_one({"task_id": t2["id"]}))

    async def test_uploads_gdrive_task_file_404(self):
        with self.assertRaises(HTTPException) as ctx:
            await authorize_stored_upload(self.raw, ADMIN, "gdrive/drv_task_file/brief.pdf")
        self.assertEqual(ctx.exception.status_code, 404)
        transport = httpx.ASGITransport(app=full_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/uploads/gdrive/drv_task_file/brief.pdf")
        self.assertEqual(res.status_code, 404)

    async def test_legacy_gridfs_doc_streams_and_deletes(self):
        t = await task_service.create_task(self.raw, {"title": "Legacy", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        await self.raw.task_attachments.insert_one(
            {
                "id": "tat_legacy",
                "task_id": t["id"],
                "kind": "upload",
                "name": "old.pdf",
                "storage_key": f"tasks/{t['id']}/tat_legacy.pdf",
            }
        )
        self.actor = dict(LEAD_CONTENT)
        transport = httpx.ASGITransport(app=self.app)
        with patch(
            "app.services.task_attachments.open_upload_response", new=AsyncMock(return_value={"ok": True})
        ) as opened, patch(
            "app.services.task_attachments.delete_upload", new=AsyncMock()
        ) as deleted:
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
                res = await ac.get(f"/api/v1/tasks/{t['id']}/attachments/tat_legacy/file")
            self.assertEqual(res.status_code, 200)
            self.assertTrue(opened.called)
            await task_attachments.delete_attachment(self.raw, t["id"], "tat_legacy", LEAD_CONTENT)
            self.assertTrue(deleted.called)

    async def test_video_processing_runs_off_event_loop_and_shares_ffmpeg_lock(self):
        loop_ident = threading.get_ident()
        workers: list[int] = []
        started: list[float] = []

        def slow_process(path, ext):
            workers.append(threading.get_ident())
            started.append(time.monotonic())
            time.sleep(0.5)
            return path, b"\xff\xd8thumb", 8, 8, 1

        tmp = tempfile.mkdtemp()
        clip_a = os.path.join(tmp, "a.mp4")
        clip_b = os.path.join(tmp, "b.mp4")
        open(clip_a, "wb").write(b"aaaa")
        open(clip_b, "wb").write(b"bbbb")
        t1 = await task_service.create_task(self.raw, {"title": "Vid A", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        t2 = await task_service.create_task(self.raw, {"title": "Vid B", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        prev = os.environ.get("UPLOADS_DIR")
        os.environ["UPLOADS_DIR"] = tmp
        ticks = {"n": 0}

        async def ticker(stop: asyncio.Event):
            while not stop.is_set():
                await asyncio.sleep(0.05)
                ticks["n"] += 1

        stop = asyncio.Event()
        try:
            with patch("app.services.google_drive_service.configured", return_value=False), patch(
                "app.services.content_calendar_service._copy_upload_to_temp",
                new=AsyncMock(side_effect=[(clip_a, 4), (clip_b, 4)]),
            ), patch(
                "app.services.content_calendar_service.process_video_upload",
                side_effect=slow_process,
            ), patch("os.unlink"):
                tick_task = asyncio.create_task(ticker(stop))
                first = asyncio.create_task(
                    task_attachments.upload_attachment(
                        self.raw, t1["id"], _upload("a.mp4", b"aaaa", "video/mp4"), LEAD_CONTENT
                    )
                )
                await asyncio.sleep(0)
                gathered = asyncio.gather(
                    first,
                    task_attachments.upload_attachment(
                        self.raw, t2["id"], _upload("b.mp4", b"bbbb", "video/mp4"), LEAD_CONTENT
                    ),
                )
                await gathered
                stop.set()
                await tick_task
        finally:
            if prev is None:
                os.environ.pop("UPLOADS_DIR", None)
            else:
                os.environ["UPLOADS_DIR"] = prev

        self.assertGreaterEqual(ticks["n"], 5)
        self.assertTrue(workers)
        self.assertTrue(all(ident != loop_ident for ident in workers))
        self.assertEqual(len(started), 2)
        self.assertGreaterEqual(max(started) - min(started), 0.45)

    async def test_thumbnail_store_failure_keeps_file(self):
        t = await task_service.create_task(self.raw, {"title": "Thumb fail", "assignee_id": MEMBER_C1["id"]}, LEAD_CONTENT)
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
        tmp.write(b"clip")
        tmp.close()
        delete_file = AsyncMock()
        with patch("app.services.google_drive_service.configured", return_value=True), patch(
            "app.services.task_attachments._task_item_folder", new=AsyncMock(return_value="item_fld")
        ), patch(
            "app.services.content_calendar_service._copy_upload_to_temp",
            new=AsyncMock(return_value=(tmp.name, 4)),
        ), patch(
            "app.services.content_calendar_service.process_video_upload",
            return_value=(tmp.name, b"jpeg-bytes", 8, 8, 1),
        ), patch(
            "app.services.google_drive_service.upload_path", new=AsyncMock(return_value={"id": "vid_ok"})
        ), patch(
            "app.services.google_drive_service.upload_bytes",
            new=AsyncMock(side_effect=RuntimeError("thumb down")),
        ), patch("app.services.google_drive_service.delete_file", new=delete_file), patch("os.unlink"):
            with self.assertLogs("app.services.task_attachments", level="WARNING") as logged:
                out = await task_attachments.upload_attachment(
                    self.raw, t["id"], _upload("clip.mp4", b"clip", "video/mp4"), LEAD_CONTENT
                )
        self.assertFalse(out.get("has_thumb"))
        docs = await self.raw.task_attachments.find({"task_id": t["id"]}).to_list(10)
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0]["drive_file_id"], "vid_ok")
        self.assertIsNone(docs[0].get("drive_thumb_file_id"))
        self.assertTrue(any("thumbnail store failed" in msg for msg in logged.output))
        self.assertFalse(delete_file.called)
