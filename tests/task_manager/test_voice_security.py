"""Security tests for POST /tasks/voice-parse. Groq fully mocked; mongomock only; fake key."""
from __future__ import annotations

import asyncio
import json
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from mongomock_motor import AsyncMongoMockClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.limiter import limiter
from app.core.security import get_current_user
from app.database import db_instance
from app.routers.tasks import router as tasks_router
from app.services import voice_task_service as vts
from tests.task_manager.conftest import (
    ADMIN,
    HR,
    LEAD_CONTENT,
    LEAD_WEB,
    MEMBER_C1,
    MEMBER_C2,
    MEMBER_WEB,
    OPS,
    SAFEER,
)

# Patching vts.httpx.AsyncClient patches the global httpx module, so keep the real class for the test client.
REAL_ASYNC_CLIENT = httpx.AsyncClient
ROOT = Path(__file__).resolve().parents[2]
SECRET = "org_SECRETORG123 sk-live-LEAKME"
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 4096
URL = "/api/v1/tasks/voice-parse"


class FakeResp:
    def __init__(self, code, body):
        self.status_code = code
        self._body = body
        self.text = body if isinstance(body, str) else json.dumps(body)

    def json(self):
        return self._body if not isinstance(self._body, str) else json.loads(self._body)


class FakeGroq:
    calls: list = []
    llm_statuses: list = []
    whisper_status = 200
    delay = 0.0
    llm_reply: dict = {}

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, **kwargs):
        FakeGroq.calls.append({"url": url, **kwargs})
        if FakeGroq.delay:
            await asyncio.sleep(FakeGroq.delay)
        if url.endswith("/audio/transcriptions"):
            if FakeGroq.whisper_status != 200:
                return FakeResp(FakeGroq.whisper_status, '{"error":{"message":"%s"}}' % SECRET)
            return FakeResp(200, {"text": "Assign banner to Member Content1"})
        code = FakeGroq.llm_statuses.pop(0) if FakeGroq.llm_statuses else 200
        if code != 200:
            return FakeResp(code, '{"error":{"message":"Rate limit for %s"}}' % SECRET)
        return FakeResp(200, {"choices": [{"message": {"content": json.dumps(FakeGroq.llm_reply)}}]})

    @classmethod
    def llm_calls(cls):
        return [c for c in cls.calls if c["url"].endswith("/chat/completions")]


async def raw_asgi(app, headers, chunks, receive_hook=None):
    """Drive the ASGI app directly so Content-Length can lie and bodies can be chunked."""
    sent = {"status": None, "body": b""}
    queue = list(chunks)
    reads = {"n": 0}

    async def receive():
        reads["n"] += 1
        if receive_hook:
            receive_hook()
        if queue:
            chunk = queue.pop(0)
            return {"type": "http.request", "body": chunk, "more_body": bool(queue)}
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(msg):
        if msg["type"] == "http.response.start":
            sent["status"] = msg["status"]
        elif msg["type"] == "http.response.body":
            sent["body"] += msg.get("body", b"")

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": URL,
        "raw_path": URL.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": ("127.0.0.1", 1234),
        "server": ("test", 80),
    }
    await app(scope, receive, send)
    return sent["status"], sent["body"], reads["n"]


def multipart(audio: bytes, filename="voice.webm", ctype="audio/webm"):
    boundary = "xBOUNDARYx"
    head = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {ctype}\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}--\r\n".encode()
    return head + audio + tail, f"multipart/form-data; boundary={boundary}"


class VoiceSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        FakeGroq.calls = []
        FakeGroq.llm_statuses = []
        FakeGroq.whisper_status = 200
        FakeGroq.delay = 0.0
        FakeGroq.llm_reply = {
            "is_task": True, "title": "Design banner", "description": "Design the banner",
            "assignee_name": MEMBER_C1["name"], "assignee_id": MEMBER_C1["id"], "spoken_assignee": MEMBER_C1["name"],
            "ambiguous_names": [], "watcher_names": [], "watcher_ids": [], "spoken_watchers": [],
            "company_id": None, "company_name": None, "spoken_company": None, "start_date": None,
            "due_date": None, "due_time": None, "estimate_hours": None, "priority": "medium", "checklist": [],
        }
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw
        for u in (ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_C2, LEAD_WEB, MEMBER_WEB, HR, OPS, SAFEER):
            await self.raw.users.insert_one(dict(u))
        self.actor = dict(ADMIN)
        self.app = FastAPI()
        self.app.state.limiter = limiter
        self.app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        self.app.include_router(tasks_router, prefix="/api/v1")

        async def _user():
            return self.actor

        self.app.dependency_overrides[get_current_user] = _user
        patch.object(vts.httpx, "AsyncClient", FakeGroq).start()
        patch.object(vts.settings, "GROQ_API_KEY", "test-key").start()
        patch("app.services.task_service.ensure_task_indexes", new_callable=AsyncMock).start()
        limiter.reset()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    def ac(self):
        return REAL_ASYNC_CLIENT(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    # ── Fix 0: roles ───────────────────────────────────────────────
    async def test_roles_blocked_before_any_provider_call(self):
        for actor in (MEMBER_C1, MEMBER_WEB, HR, OPS, SAFEER):
            self.actor = dict(actor)
            async with self.ac() as ac:
                res = await ac.post(URL, files={"audio": ("v.webm", WEBM, "audio/webm")})
            self.assertEqual(res.status_code, 403, f"{actor['id']}: {res.text}")
        self.assertEqual(FakeGroq.calls, [])

    async def test_role_check_runs_before_body_is_read(self):
        self.actor = dict(MEMBER_C1)

        def boom():
            raise AssertionError("body must not be read for a forbidden user")

        status_code, _, _ = await raw_asgi(
            self.app, {"content-type": "application/json", "content-length": "20"}, [b'{"text":"anything"}'], boom
        )
        self.assertEqual(status_code, 403)

    async def test_admin_lead_and_aliases_allowed(self):
        for actor in (ADMIN, LEAD_CONTENT, {**ADMIN, "role": "super_admin"}, {**LEAD_CONTENT, "role": "lead"}):
            self.actor = dict(actor)
            async with self.ac() as ac:
                res = await ac.post(URL, json={"text": "Assign banner to Member Content1"})
            self.assertEqual(res.status_code, 200, f"{actor['role']}: {res.text}")

    async def test_lead_never_gets_assignee_outside_department(self):
        self.actor = dict(LEAD_CONTENT)
        FakeGroq.llm_reply.update(assignee_id=MEMBER_WEB["id"], assignee_name=MEMBER_WEB["name"], spoken_assignee=None)
        async with self.ac() as ac:
            res = await ac.post(URL, json={"text": "Assign banner to Member Web"})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertNotEqual(res.json()["task"]["assignee_id"], MEMBER_WEB["id"])
        prompt = FakeGroq.llm_calls()[-1]["json"]["messages"][0]["content"]
        self.assertNotIn(MEMBER_WEB["id"], prompt)

    # ── Company isolation ──────────────────────────────────────────
    async def test_other_company_roster_and_workspaces_never_sent(self):
        from app.config import settings
        from app.core.tenant import tenant_scope

        object.__setattr__(settings, "MULTI_TENANT_ENABLED", True)
        try:
            await self.raw.users.delete_many({})
            await self.raw.users.insert_many([
                {**LEAD_CONTENT, "company_id": "company_a"},
                {**MEMBER_C1, "company_id": "company_a"},
                {**MEMBER_C2, "id": "b.member", "full_name": "Bee Member", "name": "Bee Member", "company_id": "company_b"},
            ])
            await self.raw.workspaces.insert_many([
                {"id": "wsA", "name": "AlphaClient", "status": "active", "company_id": "company_a"},
                {"id": "wsB", "name": "BetaSecretClient", "status": "active", "company_id": "company_b"},
            ])
            FakeGroq.llm_reply.update(assignee_id="b.member", assignee_name="Bee Member", spoken_assignee="Bee Member",
                                      company_id="wsB", company_name="BetaSecretClient")
            self.actor = {**LEAD_CONTENT, "company_id": "company_a"}
            with tenant_scope(company_id="company_a"):
                async with self.ac() as ac:
                    res = await ac.post(URL, json={"text": "assign to Bee Member for BetaSecretClient"})
        finally:
            object.__setattr__(settings, "MULTI_TENANT_ENABLED", False)
        self.assertEqual(res.status_code, 200, res.text)
        prompt = FakeGroq.llm_calls()[-1]["json"]["messages"][0]["content"]
        self.assertNotIn("b.member", prompt)
        self.assertNotIn("BetaSecretClient", prompt)
        self.assertIn("AlphaClient", prompt)
        body = res.json()
        self.assertNotEqual(body["task"]["assignee_id"], "b.member")
        self.assertNotEqual(body["task"]["company_id"], "wsB")

    # ── Fix 1: size, type, filename ────────────────────────────────
    async def test_huge_content_length_rejected_without_reading_body(self):
        def boom():
            raise AssertionError("body must not be read when Content-Length is over the cap")

        body, ctype = multipart(WEBM)
        status_code, out, _ = await raw_asgi(
            self.app, {"content-type": ctype, "content-length": str(200 * 1024 * 1024)}, [body], boom
        )
        self.assertEqual(status_code, 413)
        self.assertIn(vts.MSG_TOO_LARGE, out.decode())
        self.assertEqual(FakeGroq.calls, [])

    async def test_lying_content_length_and_chunked_oversize_stop_early(self):
        chunk = b"\x00" * (1024 * 1024)
        head, ctype = multipart(b"")
        chunks = [head] + [chunk] * 200  # ~200 MB if fully read
        for headers in ({"content-type": ctype, "content-length": "5000"}, {"content-type": ctype}):
            status_code, _, reads = await raw_asgi(self.app, headers, list(chunks))
            self.assertEqual(status_code, 413, headers)
            self.assertLess(reads, 10, "reader must stop as soon as the cap is passed")
        self.assertEqual(FakeGroq.calls, [])

    async def test_audio_over_3mb_rejected(self):
        async with self.ac() as ac:
            res = await ac.post(URL, files={"audio": ("v.webm", WEBM + b"\x00" * (3 * 1024 * 1024), "audio/webm")})
        self.assertEqual(res.status_code, 413, res.text)
        self.assertEqual(FakeGroq.calls, [])

    async def test_text_length_cap(self):
        async with self.ac() as ac:
            too_long = await ac.post(URL, json={"text": "a" * 601})
            ok = await ac.post(URL, json={"text": "a" * 600})
            form_long = await ac.post(URL, data={"text": "a" * 601})
        self.assertEqual(too_long.status_code, 413, too_long.text)
        self.assertEqual(form_long.status_code, 413, form_long.text)
        self.assertEqual(ok.status_code, 200, ok.text)

    async def test_json_audio_base64_rejected(self):
        async with self.ac() as ac:
            res = await ac.post(URL, json={"audio_base64": "AAAA" * 100})
        self.assertEqual(res.status_code, 400, res.text)

    async def test_wrong_magic_bytes_rejected(self):
        exe = b"MZ\x90\x00" + b"\x00" * 4096
        async with self.ac() as ac:
            bad_bytes = await ac.post(URL, files={"audio": ("v.webm", exe, "audio/webm")})
            bad_type = await ac.post(URL, files={"audio": ("v.webm", WEBM, "application/x-msdownload")})
        self.assertEqual(bad_bytes.status_code, 415, bad_bytes.text)
        self.assertEqual(bad_type.status_code, 415, bad_type.text)
        self.assertEqual(FakeGroq.calls, [])

    async def test_fixed_filename_sent_to_provider(self):
        async with self.ac() as ac:
            res = await ac.post(URL, files={"audio": ("../../etc/passwd", WEBM, "audio/webm;codecs=opus")})
        self.assertEqual(res.status_code, 200, res.text)
        whisper = [c for c in FakeGroq.calls if c["url"].endswith("/audio/transcriptions")][0]
        name, _, mime = whisper["files"]["file"]
        self.assertEqual(name, "voice.webm")
        self.assertEqual(mime, "audio/webm")

    async def test_magic_byte_detection(self):
        self.assertEqual(vts.detect_audio_format(WEBM)[0], "webm")
        self.assertEqual(vts.detect_audio_format(b"OggS" + b"\x00" * 20)[0], "ogg")
        self.assertEqual(vts.detect_audio_format(b"\x00\x00\x00\x18ftypM4A " + b"\x00" * 20)[0], "m4a")
        self.assertEqual(vts.detect_audio_format(b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * 8)[0], "wav")
        self.assertEqual(vts.detect_audio_format(b"ID3\x03" + b"\x00" * 20)[0], "mp3")
        self.assertIsNone(vts.detect_audio_format(b"MZ" + b"\x00" * 20))

    # ── Fix 2: error sanitisation ──────────────────────────────────
    async def test_provider_error_text_never_reaches_client_or_logs(self):
        cases = [([429, 429], 503), ([500, 500], 502), ([400], 502)]
        for statuses, expected in cases:
            FakeGroq.llm_statuses = list(statuses)
            with self.assertLogs("app.services.voice_task", level="DEBUG") as logs:
                async with self.ac() as ac:
                    res = await ac.post(URL, json={"text": "Assign banner"})
            self.assertEqual(res.status_code, expected, res.text)
            self.assertNotIn("SECRETORG", res.text)
            self.assertNotIn("sk-live", res.text)
            joined = "\n".join(logs.output)
            self.assertNotIn("SECRETORG", joined)
            self.assertNotIn("test-key", joined)

    async def test_whisper_error_text_never_reaches_client(self):
        FakeGroq.whisper_status = 401
        async with self.ac() as ac:
            res = await ac.post(URL, files={"audio": ("v.webm", WEBM, "audio/webm")})
        self.assertEqual(res.status_code, 502, res.text)
        self.assertNotIn("SECRETORG", res.text)
        self.assertEqual(res.json()["detail"], vts.MSG_TRANSCRIBE_FAILED)

    # ── Fix 3: key only from settings ──────────────────────────────
    async def test_key_only_from_settings(self):
        with patch.object(vts.settings, "GROQ_API_KEY", ""), \
                patch("builtins.open", side_effect=AssertionError("must not open files")), \
                patch("os.getenv", side_effect=AssertionError("must not read env directly")):
            with self.assertRaises(Exception) as ctx:
                vts._get_groq_api_key()
        self.assertEqual(getattr(ctx.exception, "status_code", None), 503)
        with patch.object(vts.settings, "GROQ_API_KEY", " k-123 "):
            self.assertEqual(vts._get_groq_api_key(), "k-123")

    def test_service_source_has_no_env_file_or_getenv(self):
        src = (ROOT / "backend" / "app" / "services" / "voice_task_service.py").read_text(encoding="utf-8")
        self.assertNotIn("os.getenv", src)
        self.assertNotIn(".env", src)
        self.assertNotIn("open(", src)

    # ── Fix 5: models, fallback, deadline, schema ──────────────────
    def test_model_list(self):
        self.assertEqual(vts.DEFAULT_LLM_MODELS, ["openai/gpt-oss-120b", "openai/gpt-oss-20b"])
        self.assertFalse(any("llama" in m for m in vts.DEFAULT_LLM_MODELS))

    async def test_fallback_only_on_429_5xx_and_max_two_calls(self):
        for statuses, expected_calls, expected_status in (
            ([429], 2, 200),
            ([503], 2, 200),
            ([500, 500], 2, 502),
            ([400], 1, 502),
            ([401], 1, 502),
        ):
            FakeGroq.calls = []
            FakeGroq.llm_statuses = list(statuses)
            async with self.ac() as ac:
                res = await ac.post(URL, json={"text": "Assign banner"})
            self.assertEqual(res.status_code, expected_status, f"{statuses}: {res.text}")
            self.assertEqual(len(FakeGroq.llm_calls()), expected_calls, statuses)
        models = [c["json"]["model"] for c in FakeGroq.llm_calls()]
        self.assertEqual(models, ["openai/gpt-oss-120b"])

    async def test_strict_json_schema_requested(self):
        async with self.ac() as ac:
            await ac.post(URL, json={"text": "Assign banner"})
        fmt = FakeGroq.llm_calls()[0]["json"]["response_format"]
        self.assertEqual(fmt["type"], "json_schema")
        self.assertTrue(fmt["json_schema"]["strict"])
        schema = fmt["json_schema"]["schema"]
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(set(schema["required"]), set(schema["properties"]))

    async def test_deadline_returns_504_quickly(self):
        FakeGroq.delay = 5.0
        with patch.object(vts, "VOICE_DEADLINE_SECONDS", 1.0), patch.object(vts, "MIN_CALL_SECONDS", 0.1):
            loop = asyncio.get_running_loop()
            start = loop.time()
            async with self.ac() as ac:
                res = await ac.post(URL, json={"text": "Assign banner"})
            elapsed = loop.time() - start
        self.assertEqual(res.status_code, 504, res.text)
        self.assertLess(elapsed, 3.0)
        self.assertLessEqual(len(FakeGroq.llm_calls()), 2)

    async def test_timeout_falls_back_to_second_model(self):
        calls = {"n": 0}
        orig_post = FakeGroq.post

        async def slow_first(self_, url, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                await asyncio.sleep(5)
            return await orig_post(self_, url, **kwargs)

        with patch.object(FakeGroq, "post", slow_first), patch.object(vts, "LLM_CALL_TIMEOUT_SECONDS", 0.5), \
                patch.object(vts, "MIN_CALL_SECONDS", 0.1):
            async with self.ac() as ac:
                res = await ac.post(URL, json={"text": "Assign banner"})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(calls["n"], 2)

    async def test_bad_json_from_model_is_502_not_fake_task(self):
        async def bad_content(self_, url, **kwargs):
            FakeGroq.calls.append({"url": url, **kwargs})
            return FakeResp(200, {"choices": [{"message": {"content": "not json"}}]})

        with patch.object(FakeGroq, "post", bad_content):
            async with self.ac() as ac:
                res = await ac.post(URL, json={"text": "hello testing"})
        self.assertEqual(res.status_code, 502, res.text)

    # ── Fix 6: microphone policy ───────────────────────────────────
    def test_microphone_policy(self):
        main_src = (ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn('"geolocation=(), camera=(), microphone=(), payment=()"', main_src)
        vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
        by_source = {
            h["source"]: {x["key"]: x["value"] for x in h["headers"]}
            for h in vercel["headers"]
        }
        self.assertIn("microphone=()", by_source["/(book|schedule)(.*)"]["Permissions-Policy"])
        self.assertIn("microphone=(self)", by_source["/(.*)"]["Permissions-Policy"])


if __name__ == "__main__":
    unittest.main()
