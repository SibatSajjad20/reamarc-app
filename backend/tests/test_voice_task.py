"""Unit tests for Voice Task Assignment service and endpoint."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import FastAPI
from mongomock_motor import AsyncMongoMockClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.limiter import limiter
from app.core.security import get_current_user
from app.database import db_instance
from app.routers.tasks import router as tasks_router
from app.services import voice_task_service
from tests.task_manager.conftest import ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_WEB


class VoiceTaskTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.raw = self.client["reamarc_test_db"]
        self._prev = db_instance.db
        db_instance.db = self.raw

        for u in (ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_WEB):
            await self.raw.users.insert_one(dict(u))

        self.actor = dict(ADMIN)
        self.app = FastAPI()
        self.app.state.limiter = limiter
        self.app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        self.app.include_router(tasks_router, prefix="/api/v1")

        async def _user():
            return self.actor

        self.app.dependency_overrides[get_current_user] = _user
        patch("app.services.task_service.ensure_task_indexes", new_callable=AsyncMock).start()

    async def asyncTearDown(self):
        db_instance.db = self._prev
        patch.stopall()

    async def _ac(self):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def test_empty_audio_raises_bad_request(self):
        """Empty audio recording should fail gracefully with 400 Bad Request."""
        async with await self._ac() as ac:
            res = await ac.post(
                "/api/v1/tasks/voice-parse",
                files={"audio": ("empty.m4a", b"", "audio/m4a")},
            )
        self.assertEqual(res.status_code, 400, res.text)
        self.assertIn("too short", res.json()["detail"])

    async def test_no_audio_and_no_text_raises_bad_request(self):
        """Missing both audio and text should return 400 Bad Request."""
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks/voice-parse", data={})
        self.assertEqual(res.status_code, 400, res.text)

    async def test_text_parse_clear_assignee(self):
        """Direct text parsing with unambiguous assignee."""
        roster = [
            {"id": "usr_h1", "name": "Muhammad Hamza", "department": "Design"},
            {"id": "usr_b1", "name": "Bilal Tariq", "department": "Accounts"},
        ]
        mock_parsed = {
            "title": "Design banner",
            "description": "Urgent request",
            "assignee_name": "Muhammad Hamza",
            "assignee_id": "usr_h1",
            "due_date": "2026-11-28",
            "due_time": "17:00",
            "priority": "urgent",
            "checklist": ["check sizes"],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": str(mock_parsed).replace("'", '"')}}]
        }

        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_post = AsyncMock(return_value=mock_resp)
            mock_client.return_value.__aenter__.return_value.post = mock_post

            res = await voice_task_service.extract_task_from_transcript(
                transcript="Assign banner to Hamza urgent",
                assignable_users=roster,
            )

        self.assertEqual(res["task"]["title"], "Design banner")
        self.assertEqual(res["task"]["assignee_id"], "usr_h1")
        self.assertEqual(res["task"]["priority"], "urgent")
        self.assertEqual(res["confidence"]["status"], "matched")
        self.assertEqual(len(res["task"]["checklist"]), 1)

    async def test_text_parse_ambiguous_assignee(self):
        """Disambiguation detection when two team members share the same first name."""
        roster = [
            {"id": "usr_a1", "name": "Ali Raza", "department": "Accounts"},
            {"id": "usr_a2", "name": "Ali Hassan", "department": "Marketing"},
        ]
        mock_parsed = {
            "title": "Audit balance sheet",
            "description": "",
            "assignee_name": "Ali",
            "assignee_id": None,
            "due_date": "2026-11-28",
            "due_time": None,
            "priority": "high",
            "checklist": [],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": str(mock_parsed).replace("'", '"').replace("None", "null")}}]
        }

        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_post = AsyncMock(return_value=mock_resp)
            mock_client.return_value.__aenter__.return_value.post = mock_post

            res = await voice_task_service.extract_task_from_transcript(
                transcript="Assign audit to Ali high priority",
                assignable_users=roster,
            )

        self.assertEqual(res["confidence"]["status"], "needs_selection")
        self.assertIsNone(res["task"]["assignee_id"])
        self.assertEqual(len(res["confidence"]["ambiguous_candidates"]), 2)
        candidate_ids = {c["id"] for c in res["confidence"]["ambiguous_candidates"]}
        self.assertSetEqual(candidate_ids, {"usr_a1", "usr_a2"})

    async def test_endpoint_voice_parse_with_form_text(self):
        """Calling POST /tasks/voice-parse with text returns 200 VoiceTaskParseResponse."""
        with patch("app.services.voice_task_service.extract_task_from_transcript") as mock_extract:
            mock_extract.return_value = {
                "transcript": "Follow up with client",
                "task": {
                    "title": "Follow up with client",
                    "description": "",
                    "assignee_id": MEMBER_C1["id"],
                    "assignee_name": MEMBER_C1["name"],
                    "due_date": "2026-11-27",
                    "due_time": "14:00",
                    "priority": "medium",
                    "checklist": [],
                },
                "confidence": {
                    "status": "matched",
                    "ambiguous_candidates": [],
                },
            }

            async with await self._ac() as ac:
                res = await ac.post(
                    "/api/v1/tasks/voice-parse",
                    data={"text": "Follow up with client"},
                )

            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertEqual(body["transcript"], "Follow up with client")
            self.assertEqual(body["task"]["title"], "Follow up with client")
            self.assertEqual(body["confidence"]["status"], "matched")

    async def test_endpoint_voice_parse_with_json_text(self):
        """Calling POST /tasks/voice-parse with JSON text returns 200 VoiceTaskParseResponse."""
        with patch("app.services.voice_task_service.extract_task_from_transcript") as mock_extract:
            mock_extract.return_value = {
                "transcript": "Prepare quarterly financial presentation",
                "task": {
                    "title": "Prepare quarterly financial presentation",
                    "description": "",
                    "assignee_id": MEMBER_C1["id"],
                    "assignee_name": MEMBER_C1["name"],
                    "due_date": "2026-11-29",
                    "due_time": "16:00",
                    "priority": "high",
                    "checklist": [],
                },
                "confidence": {
                    "status": "matched",
                    "ambiguous_candidates": [],
                },
            }

            async with await self._ac() as ac:
                res = await ac.post(
                    "/api/v1/tasks/voice-parse",
                    json={"text": "Prepare quarterly financial presentation"},
                )

            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertEqual(body["transcript"], "Prepare quarterly financial presentation")
            self.assertEqual(body["task"]["title"], "Prepare quarterly financial presentation")
            self.assertEqual(body["confidence"]["status"], "matched")

    async def test_endpoint_voice_parse_with_json_audio_base64(self):
        """Calling POST /tasks/voice-parse with JSON audio_base64 parses audio correctly."""
        import base64
        fake_audio = b"RIFF....WAVEfmt ...." + b"0" * 200
        b64_audio = base64.b64encode(fake_audio).decode("ascii")

        with patch("app.services.voice_task_service.parse_voice_task") as mock_parse:
            mock_parse.return_value = {
                "transcript": "Design hero mockup for mobile app",
                "task": {
                    "title": "Design hero mockup for mobile app",
                    "description": "",
                    "assignee_id": MEMBER_WEB["id"],
                    "assignee_name": MEMBER_WEB["name"],
                    "due_date": "2026-11-28",
                    "due_time": "18:00",
                    "priority": "urgent",
                    "checklist": [],
                },
                "confidence": {
                    "status": "matched",
                    "ambiguous_candidates": [],
                },
            }

            async with await self._ac() as ac:
                res = await ac.post(
                    "/api/v1/tasks/voice-parse",
                    json={
                        "audio_base64": b64_audio,
                        "filename": "voice_test.m4a",
                        "content_type": "audio/m4a",
                    },
                )

            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertEqual(body["transcript"], "Design hero mockup for mobile app")
            mock_parse.assert_called_once()
            called_kwargs = mock_parse.call_args.kwargs
            self.assertEqual(called_kwargs["audio_bytes"], fake_audio)
            self.assertEqual(called_kwargs["filename"], "voice_test.m4a")

    async def test_unauthorized_user_blocked(self):
        """User without task access is blocked with 403 Forbidden."""
        with patch("app.routers.tasks.can_open_module", return_value=False):
            async with await self._ac() as ac:
                res = await ac.post(
                    "/api/v1/tasks/voice-parse",
                    data={"text": "Any task"},
                )
            self.assertEqual(res.status_code, 403, res.text)

    async def test_non_admin_user_forbidden(self):
        """Non-admin user (team member) is blocked with 403 Forbidden."""
        self.actor = dict(MEMBER_C1)
        async with await self._ac() as ac:
            res = await ac.post(
                "/api/v1/tasks/voice-parse",
                data={"text": "Assign task to Hamza"},
            )
        self.assertEqual(res.status_code, 403, res.text)
        self.assertIn("administrators only", res.json()["detail"])

    async def test_unknown_employee_name_is_never_inserted(self):
        """If spoken employee name does not match dropdown roster, assignee must be None, never raw text."""
        roster = [
            {"id": "usr_h1", "name": "Muhammad Hamza", "department": "Design"},
            {"id": "usr_b1", "name": "Bilal Tariq", "department": "Accounts"},
        ]
        mock_parsed = {
            "is_task": True,
            "title": "Fix server bug",
            "description": "Urgent bug",
            "assignee_name": None,
            "assignee_id": None,
            "spoken_assignee": "Junaid",
            "due_date": "2026-11-28",
            "priority": "urgent",
            "checklist": [],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": str(mock_parsed).replace("'", '"').replace("None", "null").replace("True", "true")}}]
        }

        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_post = AsyncMock(return_value=mock_resp)
            mock_client.return_value.__aenter__.return_value.post = mock_post

            res = await voice_task_service.extract_task_from_transcript(
                transcript="Assign bug fix to Junaid urgent",
                assignable_users=roster,
            )

        # STRICT DROPDOWN LOCK: must be None and unassigned, NEVER "Junaid"
        self.assertIsNone(res["task"]["assignee_id"])
        self.assertIsNone(res["task"]["assignee_name"])
        self.assertEqual(res["confidence"]["status"], "unassigned")
        self.assertEqual(res["confidence"]["unrecognized_assignee"], "Junaid")

    async def test_random_speech_without_task_raises_422(self):
        """Casual conversation or random speech without a task intent raises 422."""
        mock_parsed = {
            "is_task": False,
            "title": "",
            "description": "",
            "assignee_id": None,
            "assignee_name": None,
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": str(mock_parsed).replace("'", '"').replace("None", "null").replace("False", "false")}}]
        }

        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_post = AsyncMock(return_value=mock_resp)
            mock_client.return_value.__aenter__.return_value.post = mock_post

            from fastapi import HTTPException
            with self.assertRaises(HTTPException) as ctx:
                await voice_task_service.extract_task_from_transcript(
                    transcript="Hey how is the weather today it is so sunny",
                    assignable_users=[],
                )
            self.assertEqual(ctx.exception.status_code, 422)
            self.assertIn("No actionable task detected", ctx.exception.detail)

    async def test_nonexistent_company_sets_unrecognized_company(self):
        """If spoken company does not exist in active workspaces, leaves company null and reports unrecognized_company."""
        workspaces = [
            {"id": "ws_alpha", "name": "Alpha Corp"},
        ]
        mock_parsed = {
            "is_task": True,
            "title": "Prepare tax filing",
            "description": "",
            "assignee_id": None,
            "assignee_name": None,
            "company_id": None,
            "company_name": None,
            "spoken_company": "Tesla",
            "priority": "medium",
            "checklist": [],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": str(mock_parsed).replace("'", '"').replace("None", "null").replace("True", "true")}}]
        }

        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_post = AsyncMock(return_value=mock_resp)
            mock_client.return_value.__aenter__.return_value.post = mock_post

            res = await voice_task_service.extract_task_from_transcript(
                transcript="Prepare tax filing for Tesla",
                assignable_users=[],
                workspaces=workspaces,
            )

        self.assertIsNone(res["task"]["company_id"])
        self.assertIsNone(res["task"]["company_name"])
        self.assertEqual(res["confidence"]["unrecognized_company"], "Tesla")

    async def test_urdu_phonetic_variation_matches_roster(self):
        """Pakistani/Urdu spelling variations (e.g. Humza/Mohammad) match roster accurately."""
        roster = [
            {"id": "usr_h1", "name": "Muhammad Hamza", "department": "Design"},
        ]
        candidates = voice_task_service._find_matching_candidates("Humza", roster)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["id"], "usr_h1")

        candidates_full = voice_task_service._find_matching_candidates("Mohammad Hamza", roster)
        self.assertEqual(len(candidates_full), 1)
        self.assertEqual(candidates_full[0]["id"], "usr_h1")

    async def test_substring_false_positive_rejected(self):
        """Unrelated words containing short names (e.g. 'finalize' or 'khalid' vs 'Ali') must not match."""
        roster = [
            {"id": "usr_ali", "name": "Ali", "department": "Sales"},
        ]
        candidates = voice_task_service._find_matching_candidates("finalize", roster)
        self.assertEqual(len(candidates), 0)

        candidates_khalid = voice_task_service._find_matching_candidates("Khalid", roster)
        self.assertEqual(len(candidates_khalid), 0)

    async def test_extract_company_start_date_estimate_hours(self):
        """Extracts company_id, start_date, and estimate_hours correctly."""
        roster = [
            {"id": "usr_h1", "name": "Muhammad Hamza", "department": "Design"},
        ]
        workspaces = [
            {"id": "ws_acme", "name": "Acme Corporation"},
            {"id": "ws_beta", "name": "Beta Logistics"},
        ]
        mock_parsed = {
            "title": "Redesign landing page",
            "description": "For client Acme",
            "assignee_name": "Muhammad Hamza",
            "assignee_id": "usr_h1",
            "company_id": "ws_acme",
            "company_name": "Acme Corporation",
            "start_date": "2026-11-25",
            "due_date": "2026-11-28",
            "due_time": "15:00",
            "estimate_hours": 6.5,
            "priority": "high",
            "checklist": ["wireframes", "visual design"],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": str(mock_parsed).replace("'", '"')}}]
        }

        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_post = AsyncMock(return_value=mock_resp)
            mock_client.return_value.__aenter__.return_value.post = mock_post

            res = await voice_task_service.extract_task_from_transcript(
                transcript="Redesign landing page for Acme starting tomorrow due Friday 3pm expected 6.5 hours assign to Hamza",
                assignable_users=roster,
                workspaces=workspaces,
            )

        task = res["task"]
        self.assertEqual(task["assignee_id"], "usr_h1")
        self.assertEqual(task["assignee_name"], "Muhammad Hamza")
        self.assertEqual(task["company_id"], "ws_acme")
        self.assertEqual(task["company_name"], "Acme Corporation")
        self.assertEqual(task["start_date"], "2026-11-25")
        self.assertEqual(task["due_date"], "2026-11-28")
        self.assertEqual(task["due_time"], "15:00")
        self.assertEqual(task["estimate_hours"], 6.5)
