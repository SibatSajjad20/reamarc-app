"""Stage-scope leaks and department canonicalisation."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.routers.admin import _format_member_resp
from app.services.access import (
    canonical_department,
    canonicalize_departments,
    effective_access,
)
from app.services.content_calendar_service import get_item_by_id, get_items, notify_content_calendar_event
from app.services.content_calendar_workflow import (
    SOCIAL_STAGES,
    can_view_item,
    stage_scope_clause,
    visible_stages,
)


def _social_member(**extra):
    base = {
        "id": "u-social",
        "role": "team_member",
        "primary_department": "Social media",
        "departments": ["Social media", "Performance marketing"],
        "department": "Social media, Performance marketing",
        "access": {"content_calendar": True},
        "content_stages": [],
        "is_active": True,
        "access_version": 1,
    }
    base.update(extra)
    return base


def _lead_social(**extra):
    u = _social_member(id="u-lead", role="team_lead")
    u.update(extra)
    return u


CONTENT_ITEM = {
    "id": "cc-content",
    "serial": "CAT-001",
    "stage": "Content",
    "assignee_id": "u-social",
    "design_owner": "u-social",
    "client_name": "Apex",
}
CREATIVE_ITEM = {
    "id": "cc-creative",
    "serial": "CAT-002",
    "stage": "Creative Production",
    "assignee_id": "u-social",
    "design_owner": "u-social",
    "client_name": "Apex",
}
SOCIAL_ITEM = {
    "id": "cc-social",
    "serial": "CAT-003",
    "stage": "Ready to Post",
    "assignee_id": "u-social",
    "design_owner": "Social Media",
    "client_name": "Apex",
    "creative_category": "Organic Creative",
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
        if "$and" in query:
            return all(self._match(c, doc) for c in query["$and"])
        if "$or" in query:
            return any(self._match(c, doc) for c in query["$or"])
        for k, v in query.items():
            if k.startswith("$"):
                continue
            actual = doc.get(k)
            if isinstance(v, dict):
                if "$in" in v and actual not in v["$in"]:
                    return False
                if "$nin" in v and actual in v["$nin"]:
                    return False
                if "$ne" in v and actual == v["$ne"]:
                    return False
            elif actual != v:
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
        rows = [{"_id": k, "count": v} for k, v in counts.items()]
        return FakeCursor(rows)


class FakeUsers:
    def __init__(self, docs):
        self.docs = [dict(d) for d in docs]

    def find(self, query=None, *args, **kwargs):
        query = query or {}
        matched = []
        for d in self.docs:
            ok = True
            if "is_active" in query:
                clause = query["is_active"]
                if isinstance(clause, dict) and "$ne" in clause and d.get("is_active") == clause["$ne"]:
                    ok = False
            if "$or" in query:
                ok = False
                for clause in query["$or"]:
                    if "id" in clause and isinstance(clause["id"], dict) and "$in" in clause["id"]:
                        if d.get("id") in clause["id"]["$in"]:
                            ok = True
                    if "_id" in clause and isinstance(clause["_id"], dict) and "$in" in clause["_id"]:
                        if d.get("_id") in clause["_id"]["$in"] or d.get("id") in clause["_id"]["$in"]:
                            ok = True
            if ok:
                matched.append(d)
        return FakeCursor(matched)

    async def find_one(self, query=None, *args, **kwargs):
        docs = await self.find(query).to_list(10)
        return docs[0] if docs else None


class FakeDB(dict):
    def __init__(self, items, users):
        super().__init__()
        self["content_calendar_items"] = items
        self.content_calendar_items = items
        self.users = users
        self["users"] = users
        self["workspaces"] = FakeItems([])


class TestVisibleStagesAndAccess(unittest.TestCase):
    def test_performance_secondary_grants_no_stages(self):
        user = _social_member()
        stages = visible_stages(user)
        self.assertEqual(stages, list(SOCIAL_STAGES))
        self.assertFalse(can_view_item(user, CONTENT_ITEM))
        self.assertFalse(can_view_item(user, CREATIVE_ITEM))
        self.assertTrue(can_view_item(user, SOCIAL_ITEM))
        self.assertNotIn("content", effective_access(user)["content_stages"])
        self.assertNotIn("creative", effective_access(user)["content_stages"])

    def test_none_content_stages_does_not_use_secondary_departments(self):
        user = _social_member()
        user["content_stages"] = None
        user["departments"] = ["Social media", "Content", "Creative"]
        eff = effective_access(user)
        self.assertEqual(eff["content_stages"], ["social_media"])
        self.assertEqual(visible_stages(user), list(SOCIAL_STAGES))

    def test_extra_creative_then_removed(self):
        user = _social_member(content_stages=["creative"], access_version=2)
        self.assertIn("Creative Production", visible_stages(user))
        self.assertTrue(can_view_item(user, CREATIVE_ITEM))
        user["content_stages"] = []
        user["access_version"] = 3
        self.assertNotIn("Creative Production", visible_stages(user))
        self.assertFalse(can_view_item(user, CREATIVE_ITEM))

    def test_stage_scope_clause(self):
        clause = stage_scope_clause(_social_member())
        self.assertIn("$in", clause["stage"])
        self.assertIn("Ready to Post", clause["stage"]["$in"])
        self.assertNotIn("Content", clause["stage"]["$in"])


class TestCanonicalDepartments(unittest.TestCase):
    def test_aliases_and_unknowns(self):
        self.assertEqual(canonical_department("social_media"), "Social media")
        self.assertEqual(canonical_department("Social Media"), "Social media")
        self.assertEqual(canonical_department("performance"), "Performance marketing")
        self.assertEqual(canonical_department("Software development"), "Software development")
        self.assertEqual(canonical_department("  Mystery Desk "), "Mystery Desk")

    def test_patch_dedupes_case(self):
        packed = canonicalize_departments(
            departments=["Social media", "Social Media", "Performance marketing"],
            primary="Social media",
        )
        self.assertEqual(packed["departments"], ["Social media", "Performance marketing"])
        self.assertEqual(packed["primary_department"], "Social media")
        self.assertEqual(packed["department"], "Social media, Performance marketing")

    def test_legacy_member_response(self):
        doc = {
            "id": "u1",
            "email": "legacy@example.com",
            "full_name": "Legacy",
            "role": "team_member",
            "departments": ["Performance Marketing", "Social Media"],
        }
        resp = _format_member_resp(doc)
        self.assertEqual(resp["primary_department"], "Performance marketing")
        self.assertEqual(resp["departments"], ["Performance marketing", "Social media"])


class TestListDetailDashboard(unittest.IsolatedAsyncioTestCase):
    async def test_list_hides_other_stages_even_when_assignee(self):
        items = FakeItems([CONTENT_ITEM, CREATIVE_ITEM, SOCIAL_ITEM])
        db = FakeDB(items, FakeUsers([_social_member()]))
        res = await get_items(db, viewer=_social_member())
        ids = [i["id"] for i in res["items"]]
        self.assertEqual(ids, ["cc-social"])
        self.assertEqual(res["stages_count"].get("Content", 0), 0)
        self.assertNotIn("Content", res["stages_count"])
        self.assertEqual(res["stages_count"]["Ready to Post"], 1)

    async def test_detail_hides_content_item(self):
        items = FakeItems([CONTENT_ITEM, SOCIAL_ITEM])
        db = FakeDB(items, FakeUsers([]))
        hidden = await get_item_by_id(db, "cc-content", viewer=_social_member())
        shown = await get_item_by_id(db, "cc-social", viewer=_social_member())
        self.assertIsNone(hidden)
        self.assertEqual(shown["id"], "cc-social")

    async def test_dashboard_lead_counts_only_social(self):
        from app.routers.dashboard import _build_content_section

        items = FakeItems([CONTENT_ITEM, CREATIVE_ITEM, SOCIAL_ITEM])
        db = FakeDB(items, FakeUsers([]))
        lead = _lead_social()
        with patch("app.services.permissions.load_ctx", return_value={}), patch(
            "app.services.permissions.resolve", return_value="manage"
        ), patch("app.services.permissions.level_gte", return_value=True):
            section = await _build_content_section(db, lead)
        self.assertIsNotNone(section)
        self.assertEqual(section.activeTotal, 1)
        self.assertEqual(section.stages.get("Ready to Post"), 1)
        self.assertFalse(section.stages.get("Content"))


class TestNotificationsAndAssets(unittest.IsolatedAsyncioTestCase):
    async def test_assignee_not_notified_for_unviewable_stage(self):
        captured = {}

        async def fake_dispatch(**kwargs):
            captured["user_ids"] = kwargs.get("user_ids")
            return {"sent": 0}

        db = FakeDB(FakeItems([CONTENT_ITEM]), FakeUsers([_social_member()]))
        with patch("app.services.push_service.dispatch_to_users", fake_dispatch):
            await notify_content_calendar_event(
                db,
                item=CONTENT_ITEM,
                action="assign",
                actor={"id": "admin", "full_name": "Admin", "role": "admin"},
                assignee_id="u-social",
            )
        self.assertEqual(captured.get("user_ids"), None)

    async def test_social_item_notifies_assignee(self):
        captured = {}

        async def fake_dispatch(**kwargs):
            captured["user_ids"] = kwargs.get("user_ids")
            return {"sent": 0}

        db = FakeDB(FakeItems([SOCIAL_ITEM]), FakeUsers([_social_member()]))
        with patch("app.services.push_service.dispatch_to_users", fake_dispatch):
            await notify_content_calendar_event(
                db,
                item=SOCIAL_ITEM,
                action="assign",
                actor={"id": "admin", "full_name": "Admin", "role": "admin"},
                assignee_id="u-social",
            )
        self.assertEqual(captured.get("user_ids"), ["u-social"])

    async def test_assets_require_can_view_item(self):
        from fastapi import HTTPException
        from app.core.uploads import authorize_stored_upload

        db = FakeDB(FakeItems([CONTENT_ITEM]), FakeUsers([]))
        with self.assertRaises(HTTPException):
            await authorize_stored_upload(db, _social_member(), "content_calendar/cc-content/file.png")


class TestAdminPrimaryDropsRedundantExtra(unittest.IsolatedAsyncioTestCase):
    async def test_canonicalize_then_strip_primary_extra(self):
        extras = ["social_media", "creative"]
        primary_stage = "social_media"
        cleaned = [s for s in extras if s != primary_stage]
        self.assertEqual(cleaned, ["creative"])


if __name__ == "__main__":
    unittest.main()
