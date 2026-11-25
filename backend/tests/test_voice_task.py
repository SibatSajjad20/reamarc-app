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
        # Fake key: the service reads only settings.GROQ_API_KEY (never .env files).
        patch.object(voice_task_service.settings, "GROQ_API_KEY", "test-key").start()

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

    async def test_endpoint_voice_parse_with_multipart_audio(self):
        """Multipart audio is accepted; the client's filename is never forwarded."""
        fake_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 2048

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
                    files={"audio": ("../../etc/passwd", fake_audio, "audio/webm;codecs=opus")},
                )

            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertEqual(body["transcript"], "Design hero mockup for mobile app")
            mock_parse.assert_called_once()
            called_kwargs = mock_parse.call_args.kwargs
            self.assertEqual(called_kwargs["audio_bytes"], fake_audio)
            self.assertEqual(called_kwargs["audio_ext"], "webm")
            self.assertNotIn("filename", called_kwargs)

    async def test_endpoint_voice_parse_rejects_json_audio_base64(self):
        """Audio must be sent as multipart; JSON audio_base64 is rejected."""
        import base64
        b64_audio = base64.b64encode(b"RIFF....WAVE" + b"0" * 2048).decode("ascii")
        async with await self._ac() as ac:
            res = await ac.post("/api/v1/tasks/voice-parse", json={"audio_base64": b64_audio})
        self.assertEqual(res.status_code, 400, res.text)
        self.assertIn("multipart", res.json()["detail"])

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
        """Non-admin and non-lead user (team member) is blocked with 403 Forbidden."""
        self.actor = dict(MEMBER_C1)
        async with await self._ac() as ac:
            res = await ac.post(
                "/api/v1/tasks/voice-parse",
                data={"text": "Assign task to Hamza"},
            )
        self.assertEqual(res.status_code, 403, res.text)
        self.assertIn("administrators and team leads only", res.json()["detail"])

    async def test_team_lead_allowed(self):
        """Team lead is permitted to use voice task parse."""
        self.actor = dict(LEAD_CONTENT)
        with patch("app.services.voice_task_service.extract_task_from_transcript") as mock_extract:
            mock_extract.return_value = {
                "transcript": "Write new blog post",
                "task": {
                    "title": "Write new blog post",
                    "description": "Weekly company update",
                    "assignee_id": MEMBER_C1["id"],
                    "assignee_name": MEMBER_C1["name"],
                    "watcher_ids": [],
                    "watcher_names": [],
                    "due_date": "2026-11-28",
                    "priority": "medium",
                    "checklist": [],
                },
                "confidence": {"status": "matched", "ambiguous_candidates": []},
            }
            async with await self._ac() as ac:
                res = await ac.post(
                    "/api/v1/tasks/voice-parse",
                    data={"text": "Write new blog post for content team"},
                )
            self.assertEqual(res.status_code, 200, res.text)
            self.assertEqual(res.json()["task"]["title"], "Write new blog post")

    async def test_voice_extracts_watchers(self):
        """Voice command extracts watchers strictly from the roster."""
        roster = [
            {"id": "usr_h1", "name": "Muhammad Hamza", "department": "Design"},
            {"id": "usr_u1", "name": "Usman Tariq", "department": "Engineering"},
            {"id": "usr_s1", "name": "Sarah Khan", "department": "Marketing"},
        ]
        mock_parsed = {
            "is_task": True,
            "title": "Design landing page",
            "description": "Design responsive landing page with Usman and Sarah as watchers",
            "assignee_name": "Muhammad Hamza",
            "assignee_id": "usr_h1",
            "watcher_names": ["Usman Tariq", "Sarah Khan"],
            "watcher_ids": ["usr_u1", "usr_s1"],
            "spoken_watchers": ["Usman", "Sarah"],
            "due_date": "2026-11-30",
            "priority": "high",
            "checklist": [],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": str(mock_parsed).replace("'", '"').replace("True", "true")}}]
        }

        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_post = AsyncMock(return_value=mock_resp)
            mock_client.return_value.__aenter__.return_value.post = mock_post

            res = await voice_task_service.extract_task_from_transcript(
                transcript="Assign landing page to Hamza, add Usman and Sarah as watchers",
                assignable_users=roster,
            )

        task = res["task"]
        self.assertEqual(task["assignee_id"], "usr_h1")
        self.assertIn("usr_u1", task["watcher_ids"])
        self.assertIn("usr_s1", task["watcher_ids"])
        self.assertIn("Usman Tariq", task["watcher_names"])
        self.assertIn("Sarah Khan", task["watcher_names"])

    async def test_voice_watcher_excludes_assignee(self):
        """If assignee is spoken as watcher too, they are filtered out of watcher_ids."""
        roster = [
            {"id": "usr_h1", "name": "Muhammad Hamza", "department": "Design"},
            {"id": "usr_u1", "name": "Usman Tariq", "department": "Engineering"},
        ]
        mock_parsed = {
            "is_task": True,
            "title": "Review codebase",
            "description": "Code review task",
            "assignee_name": "Muhammad Hamza",
            "assignee_id": "usr_h1",
            "watcher_names": ["Muhammad Hamza", "Usman Tariq"],
            "watcher_ids": ["usr_h1", "usr_u1"],
            "spoken_watchers": ["Hamza", "Usman"],
            "due_date": "2026-11-30",
            "priority": "medium",
            "checklist": [],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": str(mock_parsed).replace("'", '"').replace("True", "true")}}]
        }

        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_post = AsyncMock(return_value=mock_resp)
            mock_client.return_value.__aenter__.return_value.post = mock_post

            res = await voice_task_service.extract_task_from_transcript(
                transcript="Assign codebase review to Hamza and keep Hamza and Usman as watchers",
                assignable_users=roster,
            )

        task = res["task"]
        self.assertEqual(task["assignee_id"], "usr_h1")
        self.assertNotIn("usr_h1", task["watcher_ids"])
        self.assertIn("usr_u1", task["watcher_ids"])

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
        self.assertEqual(task["description"], "For client Acme")

    async def test_task_description_fallback_when_empty(self):
        """Voice agent guarantees task description is entered even if LLM outputs empty description."""
        roster = [{"id": "usr_h1", "name": "Muhammad Hamza"}]
        mock_parsed = {
            "title": "Fix login bug",
            "description": "",  # Empty from LLM
            "assignee_name": "Muhammad Hamza",
            "assignee_id": "usr_h1",
            "due_date": None,
            "due_time": None,
            "priority": "medium",
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

            transcript = "Assign fixing login bug to Hamza"
            res = await voice_task_service.extract_task_from_transcript(
                transcript=transcript,
                assignable_users=roster,
            )

        task = res["task"]
        self.assertTrue(bool(task["description"]), "Task description must not be empty")
        # Falls back to the work (title), never the raw voice command.
        self.assertEqual(task["description"], "Fix login bug")
        self.assertNotEqual(task["description"], transcript)

    async def test_task_description_populated_from_detailed_speech(self):
        """Voice agent preserves rich task description with instructions."""
        roster = [{"id": "usr_h1", "name": "Muhammad Hamza"}]
        expected_desc = "Update login endpoint to support OAuth2 for Google and Microsoft. Ensure error logging is in place."
        mock_parsed = {
            "title": "OAuth2 Login Integration",
            "description": expected_desc,
            "assignee_name": "Muhammad Hamza",
            "assignee_id": "usr_h1",
            "due_date": "2026-12-01",
            "due_time": "18:00",
            "priority": "high",
            "checklist": ["Google OAuth", "Microsoft OAuth"],
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
                transcript="Hamza, integrate OAuth2 for Google and Microsoft on login and ensure error logging by Dec 1st",
                assignable_users=roster,
            )

        task = res["task"]
        self.assertEqual(task["description"], expected_desc)


# Roster shaped like the live team (names, roles and departments only; fake ids).
TEAM_ROSTER = [
    {"id": "u_faizan", "name": "Faizan Khan", "role": "admin", "department": ""},
    {"id": "u_safeer", "name": "Safeer", "role": "operations", "department": "All"},
    {"id": "u_sibat", "name": "Sibat Sajjad", "role": "team_lead", "department": "AI"},
    {"id": "u_ali", "name": "Ali Ammar", "role": "team_member", "department": "Creative"},
    {"id": "u_haris", "name": "Muhammad Haris", "role": "team_lead", "department": "Website"},
    {"id": "u_shamir", "name": "Muhammad Shamir Khan", "role": "team_lead", "department": "Creative"},
    {"id": "u_awais", "name": "Awais", "role": "team_member", "department": "Creative"},
    {"id": "u_junaid", "name": "Muhammad Junaid Abbasi", "role": "team_member", "department": "Creative"},
    {"id": "u_naveed", "name": "Naveed Tariq", "role": "team_member", "department": "Website"},
]

COLLECTIVE_COMMAND = (
    "assign a collective task to haris to complete the website, and add a sub task and assign to sibat "
    "to add voice agent and add another sub task and assign to shahmeer to complete 6 static posts "
    "all needed by 30 november 6 pm"
)
NARRATED_DESCRIPTION = (
    "Collective task to complete the website. Haris is responsible for overall website completion. "
    "Subtasks: Sibat will add a voice agent, and Shahmeer will create six static posts. "
    "All deliverables are required by 30 November 2026 at 18:00."
)


def _groq_reply(parsed):
    import json as _json

    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"choices": [{"message": {"content": _json.dumps(parsed)}}]}
    return resp


def _collective_parse(description=NARRATED_DESCRIPTION, shahmeer_name="Shahmeer"):
    return {
        "is_task": True,
        "title": "Complete website",
        "description": description,
        "assignee_name": "Muhammad Haris",
        "assignee_id": "u_haris",
        "spoken_assignee": "haris",
        "ambiguous_names": [],
        "watcher_names": [],
        "watcher_ids": [],
        "spoken_watchers": [],
        "company_id": None,
        "company_name": None,
        "spoken_company": None,
        "start_date": None,
        "due_date": "2026-11-30",
        "due_time": "18:00",
        "estimate_hours": None,
        "priority": "medium",
        "checklist": [],
        "is_collective": True,
        "subtasks": [
            {"title": "Add voice agent", "description": "", "assignee_name": "Sibat Sajjad", "assignee_id": "u_sibat",
             "spoken_assignee": "sibat", "due_date": "2026-11-30", "estimate_hours": None},
            {"title": "Create 6 static posts", "description": "", "assignee_name": shahmeer_name, "assignee_id": None,
             "spoken_assignee": "shahmeer", "due_date": "2026-11-30", "estimate_hours": None},
        ],
    }


class VoiceCollectiveNameAndDescriptionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        patch.object(voice_task_service.settings, "GROQ_API_KEY", "test-key").start()

    async def asyncTearDown(self):
        patch.stopall()

    async def _extract(self, parsed, transcript=COLLECTIVE_COMMAND, roster=TEAM_ROSTER):
        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_post = AsyncMock(return_value=_groq_reply(parsed))
            mock_client.return_value.__aenter__.return_value.post = mock_post
            res = await voice_task_service.extract_task_from_transcript(transcript=transcript, assignable_users=roster)
        return res, mock_post

    # ── Sub-task assignee: Roman Urdu spellings of a roster name ────────────
    async def test_shahmeer_subtask_resolves_to_creative_team_lead(self):
        res, _ = await self._extract(_collective_parse())
        task = res["task"]
        self.assertEqual(task["assignee_id"], "u_haris")
        self.assertTrue(task["is_collective"])
        subs = task["subtasks"]
        self.assertEqual([s["assignee_id"] for s in subs], ["u_sibat", "u_shamir"])
        self.assertEqual(subs[1]["assignee_name"], "Muhammad Shamir Khan")
        self.assertEqual(subs[1]["assignee_status"], "matched")

    async def test_spelling_variants_match_only_that_person(self):
        for spoken in ("Shahmeer", "shahmeer", "Shameer", "Shamir", "Shahmir", "Shah Meer", "Shahmeer Khan", "Muhammad Shahmeer"):
            with self.subTest(spoken=spoken):
                ids = [c["id"] for c in voice_task_service._find_matching_candidates(spoken, TEAM_ROSTER)]
                self.assertEqual(ids, ["u_shamir"])

    async def test_variants_do_not_match_the_wrong_person(self):
        cases = {
            "Sameer": [],
            "Amir": [],
            "Shah": [],
            "Hamza": [],
            "Safeer": ["u_safeer"],
            "Haris": ["u_haris"],
            "Harris": ["u_haris"],
            "Naveed": ["u_naveed"],
            "Navid": ["u_naveed"],
        }
        for spoken, expected in cases.items():
            with self.subTest(spoken=spoken):
                ids = [c["id"] for c in voice_task_service._find_matching_candidates(spoken, TEAM_ROSTER)]
                self.assertEqual(ids, expected)
        # A shared first name is never resolved to one person.
        muhammads = voice_task_service._find_matching_candidates("Muhammad", TEAM_ROSTER)
        self.assertGreater(len(muhammads), 1)

    async def test_two_spellings_on_roster_need_selection_not_a_guess(self):
        roster = TEAM_ROSTER + [{"id": "u_shameer2", "name": "Shameer Ahmed", "role": "team_member", "department": "SEO"}]
        res, _ = await self._extract(_collective_parse(), roster=roster)
        sub = res["task"]["subtasks"][1]
        self.assertIsNone(sub["assignee_id"])
        self.assertEqual(sub["assignee_status"], "needs_selection")
        self.assertEqual({c["id"] for c in sub["ambiguous_candidates"]}, {"u_shamir", "u_shameer2"})

    async def test_unknown_subtask_name_stays_unassigned(self):
        res, _ = await self._extract(_collective_parse(shahmeer_name="Zubair"))
        sub = res["task"]["subtasks"][1]
        self.assertIsNone(sub["assignee_id"])
        self.assertEqual(sub["assignee_status"], "unassigned")

    # ── Description: the work, not a narration of fields ─────────────────
    async def test_narrated_description_is_replaced_with_the_work(self):
        res, _ = await self._extract(_collective_parse())
        desc = res["task"]["description"]
        for leaked in ("Haris", "Sibat", "Shahmeer", "Shamir", "November", "18:00", "responsible", "required by"):
            self.assertNotIn(leaked, desc)
        self.assertNotEqual(desc.strip().lower(), COLLECTIVE_COMMAND.lower())
        self.assertIn("Complete website", desc)
        self.assertIn("Add voice agent", desc)
        self.assertIn("Create 6 static posts", desc)

    async def test_work_description_is_kept_and_only_narration_dropped(self):
        work = "Finish the remaining website pages and wire up the booking form on the landing page."
        res, _ = await self._extract(_collective_parse(description=f"{work} Haris leads this. Everything is due by 30 November at 6 pm."))
        self.assertEqual(res["task"]["description"], work)

    async def test_real_details_in_a_sentence_with_names_are_kept(self):
        desc = "Shahmeer will create 6 static posts for the Eid campaign by 30 November."
        res, _ = await self._extract(_collective_parse(description=desc))
        self.assertEqual(res["task"]["description"], desc)

    async def test_quantity_is_not_mistaken_for_the_due_hour(self):
        parsed = _collective_parse(description="Create 6 static posts.")
        parsed.update(title="Create static posts", is_collective=False, subtasks=[])
        res, _ = await self._extract(parsed, transcript="create 6 static posts for shamir by 6 pm")
        self.assertEqual(res["task"]["description"], "Create 6 static posts.")

    async def test_dates_are_kept_when_no_date_field_was_captured(self):
        parsed = _collective_parse(description="Deliver it by 30 November.")
        parsed.update(title="Deliver report", due_date=None, due_time=None, is_collective=False, subtasks=[])
        res, _ = await self._extract(parsed, transcript="deliver report by 30 november")
        self.assertEqual(res["task"]["description"], "Deliver it by 30 November.")

    async def test_prompt_asks_for_the_work_and_roster_spelling_variants(self):
        _, mock_post = await self._extract(_collective_parse())
        payload = mock_post.call_args.kwargs["json"]
        prompt = payload["messages"][0]["content"]
        self.assertIn("keep people's names and the due date/time out of the description", prompt)
        self.assertIn("due date", prompt)
        self.assertIn("Shahmeer/Shamir/Shameer", prompt)
        self.assertIn(payload["model"], voice_task_service.DEFAULT_LLM_MODELS)
        self.assertTrue(payload["response_format"]["json_schema"]["strict"])


ROMAN_URDU_COMMAND = (
    "combined task banao haris ko assign karo ke wo dataviz company ki website complete kare or sub task me "
    "ai voice agent banao or sibat ko assign karo or aik sub task shahmeer ko assign karo ke wo 6 static post "
    "banaye saturday 6pm se pehle or watcher me admin ko dalo"
)
ROMAN_URDU_ROSTER = TEAM_ROSTER + [{"id": "u_test", "name": "test", "role": "operations", "department": "All"}]
WORKSPACES = [{"id": "ws_dataviz", "name": "DataViz"}, {"id": "ws_apex", "name": "Apex Transfers"}]


def _roman_urdu_parse(filled=True):
    """LLM JSON for the live Roman Urdu command: filled=True is a correct parse, False is what live returned."""
    sub = lambda title, name, aid, spoken: {  # noqa: E731
        "title": title, "description": "", "assignee_name": name if filled else None,
        "assignee_id": aid if filled else None, "spoken_assignee": spoken if filled else None,
        "due_date": "2026-11-28" if filled else None, "estimate_hours": None,
    }
    return {
        "is_task": True,
        "title": "Complete DataViz website",
        "description": "Develop and launch the full website for the DataViz company, ensuring all pages, functionality, and design are finalized.",
        "assignee_name": "Muhammad Haris" if filled else None,
        "assignee_id": "u_haris" if filled else None,
        "spoken_assignee": "haris" if filled else None,
        "ambiguous_names": [],
        "watcher_names": [],
        "watcher_ids": [],
        "spoken_watchers": ["admin"] if filled else [],
        "company_id": "ws_dataviz",
        "company_name": "DataViz",
        "spoken_company": "dataviz",
        "start_date": None,
        "due_date": "2026-11-28" if filled else None,
        "due_time": "18:00" if filled else None,
        "estimate_hours": None,
        "priority": "medium",
        "checklist": [],
        "is_collective": True,
        "subtasks": [
            sub("Create AI voice agent", "Sibat Sajjad", "u_sibat", "sibat"),
            sub("Create 6 static posts", "Shahmeer", None, "shahmeer"),
        ],
    }


class _FixedNow(voice_task_service.datetime):
    @classmethod
    def now(cls, tz=None):
        return voice_task_service.datetime(2026, 11, 25, 16, 30, tzinfo=tz)


class VoiceRomanUrduCollectiveTests(unittest.IsolatedAsyncioTestCase):
    """Live report: lead, sub-task owners, admin watcher and 'saturday 6pm' all came back empty."""

    async def asyncSetUp(self):
        patch.object(voice_task_service.settings, "GROQ_API_KEY", "test-key").start()
        patch.object(voice_task_service, "datetime", _FixedNow).start()

    async def asyncTearDown(self):
        patch.stopall()

    async def _extract(self, parsed):
        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_post = AsyncMock(return_value=_groq_reply(parsed))
            mock_client.return_value.__aenter__.return_value.post = mock_post
            res = await voice_task_service.extract_task_from_transcript(
                transcript=ROMAN_URDU_COMMAND,
                assignable_users=ROMAN_URDU_ROSTER,
                workspaces=WORKSPACES,
                timezone_name="Asia/Karachi",
            )
        return res, mock_post

    def _assert_full_draft(self, res):
        task = res["task"]
        self.assertEqual(task["company_id"], "ws_dataviz")
        self.assertEqual(task["assignee_id"], "u_haris")
        self.assertEqual(res["confidence"]["status"], "matched")
        self.assertTrue(task["is_collective"])
        self.assertEqual([s["assignee_id"] for s in task["subtasks"]], ["u_sibat", "u_shamir"])
        self.assertEqual(task["watcher_ids"], ["u_faizan"])
        self.assertEqual(task["due_date"], "2026-11-28")
        self.assertEqual(task["due_time"], "18:00")

    async def test_correct_llm_parse_fills_every_field(self):
        res, _ = await self._extract(_roman_urdu_parse(filled=True))
        self._assert_full_draft(res)

    async def test_fields_the_llm_left_empty_are_recovered_from_the_transcript(self):
        res, _ = await self._extract(_roman_urdu_parse(filled=False))
        self._assert_full_draft(res)

    async def test_prompt_keeps_the_description_rule_out_of_the_other_fields(self):
        _, mock_post = await self._extract(_roman_urdu_parse())
        prompt = mock_post.call_args.kwargs["json"]["messages"][0]["content"]
        rule2 = next(line for line in prompt.splitlines() if line.startswith('2. "description"'))
        self.assertIn("still fill", rule2)
        self.assertNotIn("never mention who", rule2)
        self.assertIn('"admin"', prompt)
        self.assertIn("se pehle", prompt)

    async def test_spoken_assignments_follow_transcript_order(self):
        people = voice_task_service._spoken_assignees(ROMAN_URDU_COMMAND, ROMAN_URDU_ROSTER)
        self.assertEqual([p["id"] for p in people], ["u_haris", "u_sibat", "u_shamir"])
        english = voice_task_service._spoken_assignees(COLLECTIVE_COMMAND, TEAM_ROSTER)
        self.assertEqual([p["id"] for p in english], ["u_haris", "u_sibat", "u_shamir"])

    async def test_spoken_due_dates(self):
        now = voice_task_service.datetime(2026, 11, 25, 16, 30)  # Wednesday
        cases = {
            "saturday 6pm se pehle": ("2026-11-28", "18:00"),
            "by friday 5:30 pm": ("2026-11-27", "17:30"),
            "kal tak": ("2026-11-26", None),
            "by tomorrow 11am": ("2026-11-26", "11:00"),
            "aaj 12 pm tak": ("2026-11-25", "12:00"),
            "by wednesday": ("2026-11-25", None),
            "monday se start karo": (None, None),
            "6 static posts banaye": (None, None),
            "by 6pm": (None, None),
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(voice_task_service._spoken_due(text, now), expected)

    async def test_admin_role_watcher_resolves_to_the_admins(self):
        roster = ROMAN_URDU_ROSTER + [{"id": "u_admin2", "name": "Masooma Zahra", "role": "admin", "department": "HR"}]
        parsed = _roman_urdu_parse(filled=True)
        with patch("app.services.voice_task_service.httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=_groq_reply(parsed))
            res = await voice_task_service.extract_task_from_transcript(
                transcript=ROMAN_URDU_COMMAND, assignable_users=roster, workspaces=WORKSPACES,
            )
        self.assertEqual(sorted(res["task"]["watcher_ids"]), ["u_admin2", "u_faizan"])
        self.assertEqual(res["confidence"]["unrecognized_watchers"], [])

    async def test_llm_names_are_not_overridden_by_transcript_guesses(self):
        parsed = _roman_urdu_parse(filled=True)
        parsed["subtasks"][0].update(assignee_name="Awais", assignee_id="u_awais", spoken_assignee="awais")
        res, _ = await self._extract(parsed)
        self.assertEqual([s["assignee_id"] for s in res["task"]["subtasks"]], ["u_awais", "u_shamir"])

    async def test_transcript_fallback_skips_sub_tasks_when_counts_disagree(self):
        parsed = _roman_urdu_parse(filled=False)
        parsed["subtasks"].append({"title": "Write copy", "description": "", "assignee_name": None, "assignee_id": None,
                                   "spoken_assignee": None, "due_date": None, "estimate_hours": None})
        res, _ = await self._extract(parsed)
        self.assertEqual(res["task"]["assignee_id"], "u_haris")
        self.assertEqual([s["assignee_id"] for s in res["task"]["subtasks"]], [None, None, None])
