"""Content calendar video handling must not download or slurp media on reads."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.services.content_calendar_service import (
    MAX_VIDEO_SIZE,
    attach_assets,
    get_item_by_id,
    get_items,
    process_video_upload,
)


VIDEO_ITEM = {
    "id": "cc-video",
    "serial": "CAT-VID",
    "stage": "Creative Production",
    "client_name": "Apex",
    "attachments": [
        {
            "id": "ast_vid1",
            "kind": "video",
            "url": "/uploads/content_calendar/cc-video/clip.mp4",
            "filename": "clip.mp4",
        }
    ],
}

ADMIN = {
    "id": "u-admin",
    "role": "admin",
    "full_name": "Admin",
    "is_active": True,
}


class FakeCursor:
    def __init__(self, docs):
        self.docs = list(docs)

    def sort(self, *args, **kwargs):
        return self

    def skip(self, n):
        self.docs = self.docs[n:]
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __aiter__(self):
        async def _gen():
            for d in self.docs:
                yield d
        return _gen()

    async def to_list(self, length=None):
        return [dict(d) for d in self.docs]


class FakeItems:
    def __init__(self, docs):
        self.docs = [dict(d) for d in docs]

    def _match(self, query, doc):
        if not query:
            return True
        if "$or" in query:
            return any(self._match(c, doc) for c in query["$or"])
        for k, v in query.items():
            if k.startswith("$"):
                continue
            if doc.get(k) != v:
                return False
        return True

    def find(self, query=None, *args, **kwargs):
        return FakeCursor([d for d in self.docs if self._match(query or {}, d)])

    async def find_one(self, query=None, *args, **kwargs):
        for d in self.docs:
            if self._match(query or {}, d):
                return dict(d)
        return None

    async def count_documents(self, query=None):
        return len([d for d in self.docs if self._match(query or {}, d)])

    def aggregate(self, pipeline):
        match = pipeline[0].get("$match", {}) if pipeline else {}
        matched = [d for d in self.docs if self._match(match, d)]
        counts = {}
        for d in matched:
            st = d.get("stage")
            counts[st] = counts.get(st, 0) + 1
        return FakeCursor([{"_id": k, "count": v} for k, v in counts.items()])


class FakeUsers:
    def find(self, query=None, *args, **kwargs):
        return FakeCursor([])

    async def find_one(self, query=None, *args, **kwargs):
        return None


class FakeDB(dict):
    def __init__(self, items):
        super().__init__()
        self["content_calendar_items"] = items
        self.content_calendar_items = items
        self["users"] = FakeUsers()
        self.users = self["users"]
        self["workspaces"] = FakeItems([])


def _boom(*args, **kwargs):
    raise AssertionError("read path must not download or transcode video")


class FakeUpload:
    def __init__(self, filename: str, total_size: int):
        self.filename = filename
        self.content_type = "video/mp4"
        self._remaining = total_size
        self.bytes_read = 0

    async def read(self, n: int = -1):
        if n is None or n < 0:
            n = self._remaining
        take = min(int(n), self._remaining)
        self._remaining -= take
        self.bytes_read += take
        return b"x" * take


def _rss_bytes() -> int:
    try:
        import psutil

        return int(psutil.Process().memory_info().rss)
    except Exception:
        pass
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD),
                ("PageFaultCount", wintypes.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]

        counters = PROCESS_MEMORY_COUNTERS()
        counters.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS)
        ctypes.windll.psapi.GetProcessMemoryInfo(
            ctypes.windll.kernel32.GetCurrentProcess(),
            ctypes.byref(counters),
            counters.cb,
        )
        return int(counters.WorkingSetSize)
    import resource

    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        return int(usage)
    return int(usage) * 1024


class TestCalendarReadsSkipVideoWork(unittest.IsolatedAsyncioTestCase):
    async def test_list_does_not_download_or_process_video(self):
        db = FakeDB(FakeItems([VIDEO_ITEM]))
        with patch(
            "app.services.content_calendar_service.process_video_upload",
            side_effect=_boom,
        ), patch(
            "app.services.google_drive_service.download_file_prefix",
            new=AsyncMock(side_effect=_boom),
        ):
            res = await get_items(db, viewer=ADMIN)
        self.assertEqual([i["id"] for i in res["items"]], ["cc-video"])

    async def test_get_item_does_not_download_or_process_video(self):
        db = FakeDB(FakeItems([VIDEO_ITEM]))
        with patch(
            "app.services.content_calendar_service.process_video_upload",
            side_effect=_boom,
        ), patch(
            "app.services.google_drive_service.download_file_prefix",
            new=AsyncMock(side_effect=_boom),
        ):
            item = await get_item_by_id(db, "cc-video", viewer=ADMIN)
        self.assertEqual(item["id"], "cc-video")


class TestUploadLimitAbortsEarly(unittest.IsolatedAsyncioTestCase):
    async def test_oversize_video_stops_before_full_read(self):
        db = FakeDB(FakeItems([dict(VIDEO_ITEM, attachments=[])]))
        over = MAX_VIDEO_SIZE + (2 * 1024 * 1024)
        upload = FakeUpload("big.mp4", over)
        with patch(
            "app.services.content_calendar_service.process_video_upload",
            side_effect=_boom,
        ), patch(
            "app.services.google_drive_service.configured",
            return_value=False,
        ):
            with self.assertRaises(HTTPException) as ctx:
                await attach_assets(db, "cc-video", [upload], viewer=ADMIN)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertLessEqual(upload.bytes_read, MAX_VIDEO_SIZE + (1024 * 1024))
        self.assertLess(upload.bytes_read, over)


class TestProcessVideoUploadMemory(unittest.TestCase):
    def test_large_file_stays_under_250mb_rss(self):
        baseline = _rss_bytes()
        if baseline > 200 * 1024 * 1024:
            self.skipTest("process already above 200 MB RSS")
        fd, path = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)
        out_path = None
        try:
            chunk = b"\0" * (1024 * 1024)
            with open(path, "wb") as fh:
                for _ in range(170):
                    fh.write(chunk)
            out_path, thumb, _w, _h, _d = process_video_upload(path, ".mp4")
            peak = _rss_bytes()
            self.assertTrue(os.path.isfile(out_path))
            self.assertLess(peak, 250 * 1024 * 1024)
            self.assertIsInstance(out_path, str)
            if thumb is not None:
                self.assertLess(len(thumb), 2 * 1024 * 1024)
        finally:
            for p in {path, out_path}:
                if p and os.path.exists(p):
                    try:
                        os.unlink(p)
                    except Exception:
                        pass


if __name__ == "__main__":
    unittest.main()
