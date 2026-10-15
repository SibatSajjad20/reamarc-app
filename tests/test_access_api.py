"""Unit and integration tests for Admin Access API (/access).

Tests cover:
- Non-admins get 403 on every route.
- PATCH, POST reset, and POST bulk endpoints.
- Each write creates an audit entry in permission_audit and bumps access_version.
- Setting a value equal to default stores null (None).
- Admin and client rows are read-only (422).
- Validation on stages and primary-department locked stage.
"""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import require_admin
from app.routers.access import router as access_router
from app.services.access import MODULES


class InMemoryUserCollection:
    def __init__(self, users):
        self.docs = {str(u.get("_id") or u.get("id")): dict(u) for u in users}

    def find(self, query=None):
        query = query or {}
        role_filter = query.get("role")
        matched = []
        for doc in self.docs.values():
            if isinstance(role_filter, dict):
                if "$ne" in role_filter and doc.get("role") == role_filter["$ne"]:
                    continue
                if "$nin" in role_filter and doc.get("role") in role_filter["$nin"]:
                    continue
                if "$in" in role_filter and doc.get("role") not in role_filter["$in"]:
                    continue
            matched.append(dict(doc))

        class _Cursor:
            def __init__(self, items):
                self.items = items

            async def to_list(self, length=None):
                return [dict(x) for x in self.items]

        return _Cursor(matched)

    async def find_one(self, query):
        if "_id" in query:
            return self.docs.get(str(query["_id"]))
        if "$or" in query:
            for clause in query["$or"]:
                val = clause.get("id") or clause.get("_id")
                if str(val) in self.docs:
                    return self.docs[str(val)]
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                return doc
        return None

    async def update_one(self, query, update):
        target = await self.find_one(query)
        if not target:
            return MagicMock(modified_count=0)
        uid = str(target.get("_id") or target.get("id"))
        doc = self.docs[uid]

        if "$set" in update:
            for k, v in update["$set"].items():
                if "." in k:
                    parent, child = k.split(".", 1)
                    if parent not in doc or not isinstance(doc[parent], dict):
                        doc[parent] = {}
                    doc[parent][child] = v
                else:
                    doc[k] = v

        if "$unset" in update:
            for k in update["$unset"]:
                if "." in k:
                    parent, child = k.split(".", 1)
                    if parent in doc and isinstance(doc[parent], dict):
                        doc[parent].pop(child, None)
                else:
                    doc.pop(k, None)

        if "$inc" in update:
            for k, v in update["$inc"].items():
                doc[k] = doc.get(k, 0) + v

        return MagicMock(modified_count=1)


class AccessApiTests(unittest.TestCase):
    def setUp(self):
        self.initial_users = [
            {
                "_id": "user-member",
                "id": "user-member",
                "full_name": "Ayesha Khan",
                "email": "ayesha@example.com",
                "role": "team_member",
                "primary_department": "Content",
                "departments": ["Content"],
                "access": {m: None for m in MODULES},
                "content_stages": [],
                "access_version": 1,
            },
            {
                "_id": "user-sales",
                "id": "user-sales",
                "full_name": "Bilal Ahmed",
                "email": "bilal@example.com",
                "role": "team_lead",
                "primary_department": "Sales",
                "departments": ["Sales"],
                "access": {m: None for m in MODULES},
                "content_stages": [],
                "access_version": 1,
            },
            {
                "_id": "user-admin",
                "id": "user-admin",
                "full_name": "Admin Boss",
                "email": "admin@example.com",
                "role": "admin",
                "primary_department": "",
                "access_version": 1,
            },
            {
                "_id": "user-client",
                "id": "user-client",
                "full_name": "Client User",
                "email": "client@example.com",
                "role": "client",
                "primary_department": "",
                "access_version": 1,
            },
        ]
        self.users_col = InMemoryUserCollection(self.initial_users)
        self.audit_col = MagicMock()
        self.audit_col.insert_one = AsyncMock()

        self.mock_db = MagicMock()
        self.mock_db.users = self.users_col
        self.mock_db.permission_audit = self.audit_col

    def _build_app(self, caller: dict) -> FastAPI:
        app = FastAPI()
        app.include_router(access_router, prefix="/api/v1")

        async def _override_require_admin():
            if caller.get("role") != "admin":
                from fastapi import HTTPException, status
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
            return caller

        app.dependency_overrides[require_admin] = _override_require_admin
        return app

    def test_non_admins_get_403_on_every_route(self):
        caller = {"id": "member-1", "role": "team_member"}
        app = self._build_app(caller)
        client = TestClient(app)

        with patch("app.routers.access.get_database", return_value=self.mock_db):
            r1 = client.get("/api/v1/access/users")
            self.assertEqual(r1.status_code, 403)

            r2 = client.patch("/api/v1/access/users/user-member", json={"module": "attendance", "value": False})
            self.assertEqual(r2.status_code, 403)

            r3 = client.post("/api/v1/access/users/user-member/reset", json={})
            self.assertEqual(r3.status_code, 403)

            r4 = client.post("/api/v1/access/bulk", json={"module": "attendance", "value": False})
            self.assertEqual(r4.status_code, 403)

    def test_list_users_as_admin(self):
        caller = {"id": "admin-1", "role": "admin", "full_name": "Super Admin"}
        app = self._build_app(caller)
        client = TestClient(app)

        with patch("app.routers.access.get_database", return_value=self.mock_db):
            resp = client.get("/api/v1/access/users")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            # Non-client users returned
            ids = [u["id"] for u in data]
            self.assertIn("user-member", ids)
            self.assertIn("user-sales", ids)
            self.assertIn("user-admin", ids)
            self.assertNotIn("user-client", ids)

            # Check structure of a row
            member_row = next(u for u in data if u["id"] == "user-member")
            self.assertEqual(member_row["role"], "team_member")
            self.assertEqual(member_row["primary_department"], "Content")
            self.assertTrue(member_row["modules"]["attendance"]["value"])
            self.assertTrue(member_row["modules"]["attendance"]["default"])
            self.assertFalse(member_row["modules"]["attendance"]["changed"])
            self.assertEqual(member_row["content_stages"]["locked"], "content")

    def test_patch_module_override_and_audit(self):
        caller = {"id": "admin-1", "role": "admin", "full_name": "Super Admin"}
        app = self._build_app(caller)
        client = TestClient(app)

        with patch("app.routers.access.get_database", return_value=self.mock_db):
            # Content member attendance default is True. Toggle to False.
            resp = client.patch(
                "/api/v1/access/users/user-member",
                json={"module": "attendance", "value": False},
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertFalse(data["modules"]["attendance"]["value"])
            self.assertTrue(data["modules"]["attendance"]["changed"])

            # Verify DB was modified: stored as False, version bumped
            user_in_db = self.users_col.docs["user-member"]
            self.assertEqual(user_in_db["access"]["attendance"], False)
            self.assertEqual(user_in_db["access_version"], 2)

            # Verify audit entry was inserted
            self.audit_col.insert_one.assert_called_once()
            audit_call = self.audit_col.insert_one.call_args[0][0]
            self.assertEqual(audit_call["target_id"], "user-member")
            self.assertEqual(audit_call["module"], "attendance")
            self.assertEqual(audit_call["before"], "ON")
            self.assertEqual(audit_call["after"], "OFF")

    def test_value_equal_to_default_stores_null(self):
        caller = {"id": "admin-1", "role": "admin", "full_name": "Super Admin"}
        app = self._build_app(caller)
        client = TestClient(app)

        with patch("app.routers.access.get_database", return_value=self.mock_db):
            # Sales lead sales default is True. Setting it to True must store None (null)
            resp = client.patch(
                "/api/v1/access/users/user-sales",
                json={"module": "sales", "value": True},
            )
            self.assertEqual(resp.status_code, 200)
            user_in_db = self.users_col.docs["user-sales"]
            self.assertIsNone(user_in_db["access"]["sales"])

    def test_admin_and_client_rows_are_read_only(self):
        caller = {"id": "admin-1", "role": "admin", "full_name": "Super Admin"}
        app = self._build_app(caller)
        client = TestClient(app)

        with patch("app.routers.access.get_database", return_value=self.mock_db):
            r_admin = client.patch("/api/v1/access/users/user-admin", json={"module": "attendance", "value": True})
            self.assertEqual(r_admin.status_code, 422)

            r_client = client.patch("/api/v1/access/users/user-client", json={"module": "attendance", "value": True})
            self.assertEqual(r_client.status_code, 422)

    def test_content_stages_validation_and_patch(self):
        caller = {"id": "admin-1", "role": "admin", "full_name": "Super Admin"}
        app = self._build_app(caller)
        client = TestClient(app)

        with patch("app.routers.access.get_database", return_value=self.mock_db):
            # Attempt to remove primary stage 'content' -> 422
            r_remove = client.patch(
                "/api/v1/access/users/user-member",
                json={"content_stages": ["creative"]},
            )
            self.assertEqual(r_remove.status_code, 422)

            # Valid extra stage 'social_media' alongside locked 'content'
            r_valid = client.patch(
                "/api/v1/access/users/user-member",
                json={"content_stages": ["content", "social_media"]},
            )
            self.assertEqual(r_valid.status_code, 200)
            user_in_db = self.users_col.docs["user-member"]
            self.assertEqual(user_in_db["content_stages"], ["social_media"])

    def test_reset_user_access(self):
        caller = {"id": "admin-1", "role": "admin", "full_name": "Super Admin"}
        app = self._build_app(caller)
        client = TestClient(app)

        # Pre-set custom access on member
        self.users_col.docs["user-member"]["access"] = {"attendance": False, "sales": True}
        self.users_col.docs["user-member"]["content_stages"] = ["social_media"]

        with patch("app.routers.access.get_database", return_value=self.mock_db):
            # 1. Reset single module 'attendance'
            r_single = client.post("/api/v1/access/users/user-member/reset", json={"module": "attendance"})
            self.assertEqual(r_single.status_code, 200)
            self.assertIsNone(self.users_col.docs["user-member"]["access"]["attendance"])

            # 2. Reset entire row
            r_all = client.post("/api/v1/access/users/user-member/reset", json={})
            self.assertEqual(r_all.status_code, 200)
            for m in MODULES:
                self.assertIsNone(self.users_col.docs["user-member"]["access"][m])
            self.assertEqual(self.users_col.docs["user-member"]["content_stages"], [])

    def test_bulk_apply(self):
        caller = {"id": "admin-1", "role": "admin", "full_name": "Super Admin"}
        app = self._build_app(caller)
        client = TestClient(app)

        with patch("app.routers.access.get_database", return_value=self.mock_db):
            # Turn on website module for all Content members
            resp = client.post(
                "/api/v1/access/bulk",
                json={"department": "Content", "role": "team_member", "module": "website", "value": True},
            )
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["changed"], 1)

            # user-member now has website: True in DB
            self.assertEqual(self.users_col.docs["user-member"]["access"]["website"], True)


if __name__ == "__main__":
    unittest.main()
