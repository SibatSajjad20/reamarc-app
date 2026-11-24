"""Voice parse for collective tasks. Groq fully mocked with a fake key; no network."""
from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from app.services import voice_task_service as vts

ROSTER = [
    {"id": "lead.web", "name": "Sara Web", "role": "team_lead", "department": "Website"},
    {"id": "member.web", "name": "Hamza Dev", "role": "team_member", "department": "Website"},
    {"id": "lead.content", "name": "Usman Writer", "role": "team_lead", "department": "Content"},
    {"id": "member.c1", "name": "Bilal Khan", "role": "team_member", "department": "Content"},
    {"id": "member.c2", "name": "Bilal Ahmed", "role": "team_member", "department": "Content"},
]


def _reply(**over):
    base = {
        "is_task": True,
        "title": "Launch ZEM website",
        "description": "Ship the new site",
        "assignee_name": "Sara Web",
        "assignee_id": "lead.web",
        "spoken_assignee": "Sara",
        "ambiguous_names": [],
        "watcher_names": [],
        "watcher_ids": [],
        "spoken_watchers": [],
        "company_id": None,
        "company_name": None,
        "spoken_company": None,
        "start_date": None,
        "due_date": "2026-12-01",
        "due_time": None,
        "estimate_hours": None,
        "priority": "high",
        "checklist": [],
        "is_collective": True,
        "subtasks": [
            {"title": "Build page", "description": "", "assignee_name": "Hamza Dev", "assignee_id": "member.web",
             "spoken_assignee": "Hamza", "due_date": "2026-11-28", "estimate_hours": 6},
            {"title": "Write copy", "description": "", "assignee_name": None, "assignee_id": None,
             "spoken_assignee": "Usman", "due_date": "next week", "estimate_hours": 5000},
        ],
    }
    base.update(over)
    return base


class _Resp:
    def __init__(self, body):
        self.status_code = 200
        self._body = body

    def json(self):
        return self._body


class _FakeClient:
    reply: dict = {}
    sent: list = []

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, **kwargs):
        _FakeClient.sent.append(kwargs)
        return _Resp({"choices": [{"message": {"content": json.dumps(_FakeClient.reply)}}]})


class VoiceCollectiveTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        _FakeClient.sent = []
        patch.object(vts, "_get_groq_api_key", return_value="fake-key").start()
        patch.object(vts.httpx, "AsyncClient", _FakeClient).start()

    async def asyncTearDown(self):
        patch.stopall()

    async def _parse(self, transcript, reply):
        _FakeClient.reply = reply
        return await vts.extract_task_from_transcript(transcript, ROSTER)

    async def test_explicit_collective_resolves_owners_against_roster(self):
        out = await self._parse("Create a collective task: Sara owns it, Hamza builds the page, Usman writes copy", _reply())
        task = out["task"]
        self.assertTrue(task["is_collective"])
        self.assertEqual(task["assignee_id"], "lead.web")
        self.assertEqual([s["assignee_id"] for s in task["subtasks"]], ["member.web", "lead.content"])
        self.assertEqual(task["subtasks"][0]["estimate_hours"], 6.0)
        self.assertIsNone(task["subtasks"][1]["due_date"])
        self.assertIsNone(task["subtasks"][1]["estimate_hours"])

    async def test_ambiguous_and_unknown_owner_never_guessed(self):
        reply = _reply(subtasks=[
            {"title": "Copy", "description": "", "assignee_name": None, "assignee_id": "ghost", "spoken_assignee": "Bilal",
             "due_date": None, "estimate_hours": None},
            {"title": "SEO", "description": "", "assignee_name": None, "assignee_id": None, "spoken_assignee": "Zed",
             "due_date": None, "estimate_hours": None},
        ])
        out = await self._parse("collective task for the site", reply)
        a, b = out["task"]["subtasks"]
        self.assertIsNone(a["assignee_id"])
        self.assertEqual(a["assignee_status"], "needs_selection")
        self.assertEqual({c["id"] for c in a["ambiguous_candidates"]}, {"member.c1", "member.c2"})
        self.assertIsNone(b["assignee_id"])
        self.assertEqual(b["unrecognized_assignee"], "Zed")

    async def test_model_saying_collective_without_cue_is_single_task(self):
        reply = _reply(subtasks=[_reply()["subtasks"][0]])
        out = await self._parse("Hamza build the landing page by Friday", reply)
        self.assertFalse(out["task"]["is_collective"])
        self.assertEqual(out["task"]["subtasks"], [])

    async def test_two_owners_with_steps_counts_without_keyword(self):
        out = await self._parse("Hamza builds the page and Usman writes the copy, Sara owns it", _reply())
        self.assertTrue(out["task"]["is_collective"])
        self.assertEqual(len(out["task"]["subtasks"]), 2)

    async def test_not_collective_flag_drops_subtasks(self):
        out = await self._parse("create a collective task", _reply(is_collective=False))
        self.assertFalse(out["task"]["is_collective"])
        self.assertEqual(out["task"]["subtasks"], [])

    async def test_subtasks_capped(self):
        many = [dict(_reply()["subtasks"][0], title=f"Step {i}") for i in range(25)]
        out = await self._parse("collective project", _reply(subtasks=many))
        self.assertEqual(len(out["task"]["subtasks"]), vts.MAX_VOICE_SUBTASKS)

    async def test_strict_schema_nested_subtasks(self):
        await self._parse("collective project", _reply())
        schema = _FakeClient.sent[0]["json"]["response_format"]["json_schema"]["schema"]
        item = schema["properties"]["subtasks"]["items"]
        self.assertFalse(item["additionalProperties"])
        self.assertEqual(set(item["required"]), set(item["properties"]))
        self.assertEqual(set(schema["required"]), set(schema["properties"]))
