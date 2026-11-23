"""Content calendar client expectations: settings tab endpoints, role permissions, merge rules, and validation.

Throwaway Mongo only (reamarc_test_cc_expectations database); no outbound network.
"""
from __future__ import annotations

import os
import socket
import sys
import unittest
from datetime import datetime, timezone
from unittest import mock

os.environ["SECRET_KEY"] = "test-secret-key-cc-expectations-0123456789abcdef"
os.environ["RUN_SCHEDULERS"] = "0"
os.environ["MONGODB_URL"] = "mongodb://127.0.0.1:27017"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx

from app.config import settings
from app.core.limiter import limiter
from app.core.security import claims_with_session, create_access_token, _AUTH_CACHE
from app.database import connect_to_mongo
from app.main import app

TEST_DB = "reamarc_test_cc_expectations"
A, B = "company_test_a", "company_test_b"
_real_connect = socket.socket.connect


def _loopback_only(self, addr, *a, **k):
    host = addr[0] if isinstance(addr, tuple) and addr else addr
    if host in ("127.0.0.1", "::1", "localhost"):
        return _real_connect(self, addr, *a, **k)
    raise OSError("outbound blocked in tests")


FORBIDDEN = [
    "share_token", "tok-secret", "Content Client Review", "Creative Client Review", "Internal Review",
    "Creative Revision", "Content Revision", "Creative Production", "Ready to Post", "Ali Internal", "u_ali",
    "assignee", "design_owner", "secret revision", "internal note", "revision_note", "notes", "SECRETDRIVE",
    "\"stage\"", "stage_counts", "workload",
]


class TestContentCalendarExpectations(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        guard = mock.patch.object(socket.socket, "connect", new=_loopback_only)
        guard.start()
        self.addCleanup(guard.stop)

        _AUTH_CACHE.clear()

        object.__setattr__(settings, "MONGODB_URL", "mongodb://127.0.0.1:27017")
        object.__setattr__(settings, "MONGODB_DB_NAME", TEST_DB)
        self._prev_multi_tenant = getattr(settings, "MULTI_TENANT_ENABLED", False)
        object.__setattr__(settings, "MULTI_TENANT_ENABLED", True)
        assert "test" in TEST_DB and TEST_DB != "reamarc_db"

        await connect_to_mongo()
        from app.database import db_instance
        self.db = db_instance.db
        await db_instance.client.drop_database(TEST_DB)

        limiter.enabled = False

        # Seed companies
        self.companies = {}
        for cid in (A, B):
            c = {"id": cid, "name": cid, "status": "active", "token_version": 0}
            self.companies[cid] = c
            await self.db.companies.insert_one(dict(c))

        # Seed users
        # A: admin, content lead, creative lead, perf lead, content member, operations, client
        # B: admin
        self.users = {}
        users_seed = [
            ("admin_a", A, "admin", [], "Admin A", "", []),
            ("content_lead_a", A, "team_lead", [], "Content Lead A", "content", ["content"]),
            ("creative_lead_a", A, "team_lead", [], "Creative Lead A", "creative", ["creative"]),
            ("perf_lead_a", A, "team_lead", [], "Perf Lead A", "performance marketing", ["performance marketing"]),
            ("content_member_a", A, "team_member", [], "Content Member A", "content", ["content"]),
            ("ops_a", A, "operations", [], "Ops A", "", []),
            ("client_a", A, "client", ["ws_sp"], "Client SP A", "", []),
            ("admin_b", B, "admin", [], "Admin B", "", []),
        ]

        for uid, cid, role, ws, name, primary_dept, depts in users_seed:
            u = {
                "id": uid,
                "email": f"{uid}@example.test",
                "full_name": name,
                "role": role,
                "is_active": True,
                "company_id": cid,
                "session_epoch": 0,
                "workspace_ids": ws,
                "primary_department": primary_dept,
                "departments": depts,
                "refresh_jtis": [f"web-{uid}"],
                "refresh_retired": [],
            }
            if uid == "perf_lead_a":
                u["access"] = {"content_calendar": True}

            m = {
                "id": f"m_{uid}",
                "user_id": uid,
                "company_id": cid,
                "status": "active",
                "role": role,
                "workspace_ids": ws,
                "primary_department": primary_dept,
                "departments": depts,
                "token_version": 0,
            }
            if uid == "perf_lead_a":
                m["access"] = {"content_calendar": True}
            await self.db.users.insert_one(dict(u))
            await self.db.company_memberships.insert_one(dict(m))
            self.users[uid] = (u, m)

        # Workspaces
        # A/ws_sp: active, proposal file, existing lines Static (5, max 10), Carousel (null, included true, layout 3x3), Animated Post (2, skip Nov 2026)
        self.ws_sp_a = {
            "id": "ws_sp",
            "name": "SP Builders",
            "initials": "SP",
            "status": "active",
            "company_id": A,
            "brandColor": "#4f46e5",
            "proposal_url": "/uploads/proposals/ws_sp.pdf",
            "proposal_name": "SP_Proposal.pdf",
            "proposal_size": 1024,
            "poc_name": "Secret POC",
            "poc_email": "poc@secret.test",
            "billing_name": "Secret Billing",
            "content_expectations": {
                "period": "month",
                "lines": [
                    {"creative_type": "Static", "expected": 5, "expected_max": 10},
                    {"creative_type": "Carousel", "expected": None, "included": True, "layout": "3x3"},
                    {"creative_type": "Animated Post", "expected": 2, "skip_months": ["2026-11"]},
                ],
            },
        }
        await self.db.workspaces.insert_one(dict(self.ws_sp_a))

        # A/ws_off: inactive
        self.ws_off_a = {
            "id": "ws_off",
            "name": "Off Client",
            "initials": "OC",
            "status": "inactive",
            "company_id": A,
            "content_expectations": None,
        }
        await self.db.workspaces.insert_one(dict(self.ws_off_a))

        # B/ws_sp: other company, same workspace id
        self.ws_sp_b = {
            "id": "ws_sp",
            "name": "SP Builders B",
            "initials": "SPB",
            "status": "active",
            "company_id": B,
            "content_expectations": {
                "period": "month",
                "lines": [{"creative_type": "Video", "expected": 1}],
            },
        }
        await self.db.workspaces.insert_one(dict(self.ws_sp_b))

        # Custom content_calendar_settings for A lacking "Cover Image"
        await self.db.content_calendar_settings.insert_one({
            "_id": f"field_constants:{A}",
            "company_id": A,
            "creative_types": [
                "Video", "Reel", "Carousel", "Static", "Story", "Animated Post",
                "UGC", "Testimonial", "GIF", "LP Graphic", "Banner", "Email", "Lead Magnet"
            ],
        })

        # Items in A for report checks
        self.items_a = [
            {
                "id": "item1", "serial": "SP001", "company_id": A, "workspace_id": "ws_sp", "client_name": "SP Builders",
                "stage": "Posted", "creative_type": "Video", "publish_date": "2026-11-05", "content_concept": "Concept 1",
                "channels": ["Instagram"], "content_pillar": "Product", "creative_category": "Organic Creative",
                "content_type": "Scheduled", "created_at": "2026-11-01T00:00:00Z", "updated_at": "2026-11-05T00:00:00Z",
                "share_token": "tok-secret-1", "notes": "internal note only", "assignee_name": "Ali Internal",
                "attachments": [],
            },
            {
                "id": "item2", "serial": "SP002", "company_id": A, "workspace_id": "ws_sp", "client_name": "SP Builders",
                "stage": "Ready to Post", "creative_type": "UGC", "publish_date": "2026-11-12", "content_concept": "Concept 2",
                "channels": ["Instagram"], "content_pillar": "Product", "creative_category": "Organic Creative",
                "content_type": "Scheduled", "created_at": "2026-11-01T00:00:00Z", "updated_at": "2026-11-05T00:00:00Z",
                "share_token": "tok-secret-2", "notes": "internal note only", "assignee_name": "Ali Internal",
                "attachments": [],
            },
        ]
        await self.db.content_calendar_items.insert_many([dict(i) for i in self.items_a])

        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        from app.database import db_instance
        if db_instance.client is not None:
            await db_instance.client.drop_database(TEST_DB)
            db_instance.client.close()
            db_instance.client = None
            db_instance.db = None
        limiter.enabled = False
        object.__setattr__(settings, "MULTI_TENANT_ENABLED", self._prev_multi_tenant)

    def _auth(self, uid: str) -> dict:
        u, m = self.users[uid]
        base = {
            "sub": uid,
            "email": u["email"],
            "name": u["full_name"],
            "role": m["role"],
            "cid": u["company_id"],
            "workspace_ids": u["workspace_ids"],
            "mid": m["id"],
            "mtv": 0,
        }
        c = claims_with_session(u, base, company_doc=self.companies[u["company_id"]], membership_doc=m)
        token = create_access_token(dict(c, sid=f"web-{uid}"))
        return {"Authorization": f"Bearer {token}", "X-Requested-With": "XMLHttpRequest"}

    async def test_01_get_expectations_admin_content_lead(self):
        for uid in ("admin_a", "content_lead_a"):
            r = await self.client.get("/api/v1/content-calendar/expectations", headers=self._auth(uid))
            self.assertEqual(r.status_code, 200, r.text)
            body = r.json()
            self.assertTrue(body["can_edit"])
            self.assertEqual(r.headers["cache-control"], "private, no-store")
            self.assertNotIn("Story", body["creative_types"])
            self.assertNotIn("story", [t.lower() for t in body["creative_types"]])

            client_ids = [c["workspace_id"] for c in body["clients"]]
            self.assertIn("ws_sp", client_ids)
            self.assertNotIn("ws_off", client_ids)
            self.assertEqual(len(body["clients"]), 1)

            ws_client = body["clients"][0]
            for forbidden_key in ("poc_name", "poc_email", "billing_name", "billing_email", "billing_phone"):
                self.assertNotIn(forbidden_key, ws_client)
            self.assertEqual(ws_client["name"], "SP Builders")
            self.assertEqual(ws_client["proposal_name"], "SP_Proposal.pdf")

    async def test_02_get_expectations_non_editors_and_unauthenticated(self):
        for uid in ("content_member_a", "perf_lead_a"):
            r = await self.client.get("/api/v1/content-calendar/expectations", headers=self._auth(uid))
            self.assertEqual(r.status_code, 200, r.text)
            self.assertFalse(r.json()["can_edit"])

        # Client get -> 403
        r_client = await self.client.get("/api/v1/content-calendar/expectations", headers=self._auth("client_a"))
        self.assertEqual(r_client.status_code, 403)

        # Unauthenticated -> 401
        r_unauth = await self.client.get("/api/v1/content-calendar/expectations")
        self.assertEqual(r_unauth.status_code, 401)

    async def test_03_put_expectations_editors(self):
        for uid, count in (("admin_a", 6), ("content_lead_a", 7), ("creative_lead_a", 8)):
            payload = {"lines": [{"creative_type": "Static", "expected": count}]}
            r = await self.client.put(
                "/api/v1/content-calendar/expectations/ws_sp",
                json=payload,
                headers=self._auth(uid),
            )
            self.assertEqual(r.status_code, 200, r.text)
            doc = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
            lines = doc["content_expectations"]["lines"]
            static_line = next(l for l in lines if l["creative_type"] == "Static")
            self.assertEqual(static_line["expected"], count)

    async def test_04_put_expectations_forbidden_roles_and_unauthenticated(self):
        snapshot_before = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})

        payload = {"lines": [{"creative_type": "Static", "expected": 99}]}
        for uid in ("perf_lead_a", "content_member_a", "client_a", "ops_a"):
            r = await self.client.put(
                "/api/v1/content-calendar/expectations/ws_sp",
                json=payload,
                headers=self._auth(uid),
            )
            self.assertEqual(r.status_code, 403, f"{uid} expected 403 but got {r.status_code}: {r.text}")
            snap = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
            self.assertEqual(snap, snapshot_before)

        # Unauthenticated -> 401
        r_unauth = await self.client.put("/api/v1/content-calendar/expectations/ws_sp", json=payload)
        self.assertEqual(r_unauth.status_code, 401)
        snap = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        self.assertEqual(snap, snapshot_before)

    async def test_05_cross_company_isolation(self):
        snap_a_before = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})

        # B admin updates B's ws_sp
        payload = {"lines": [{"creative_type": "Video", "expected": 15}]}
        r = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json=payload,
            headers=self._auth("admin_b"),
        )
        self.assertEqual(r.status_code, 200, r.text)

        # Check B is updated
        doc_b = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": B})
        self.assertEqual(doc_b["content_expectations"]["lines"][0]["expected"], 15)

        # Check A is byte-for-byte unchanged
        snap_a_after = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        self.assertEqual(snap_a_before, snap_a_after)

        # Insert a workspace existing only in B
        await self.db.workspaces.insert_one({
            "id": "ws_only_b", "name": "B Only", "company_id": B, "status": "active",
        })
        # A admin calls PUT to ws_only_b -> 404
        r_404 = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_only_b",
            json=payload,
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_404.status_code, 404)

    async def test_06_unknown_and_malformed_client_id(self):
        payload = {"lines": [{"creative_type": "Static", "expected": 5}]}
        # Unknown client id -> 404
        r = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_unknown",
            json=payload,
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r.status_code, 404)

        # Malformed ids
        for bad_id in ("ws$sp", "a" * 65):
            r_bad = await self.client.put(
                f"/api/v1/content-calendar/expectations/{bad_id}",
                json=payload,
                headers=self._auth("admin_a"),
            )
            self.assertIn(r_bad.status_code, (404, 422))
            self.assertNotEqual(r_bad.status_code, 500)

        r_path = await self.client.put(
            "/api/v1/content-calendar/expectations/../x",
            json=payload,
            headers=self._auth("admin_a"),
        )
        self.assertIn(r_path.status_code, (404, 405, 422))
        self.assertNotEqual(r_path.status_code, 500)

    async def test_07_inactive_or_deleted_client(self):
        payload = {"lines": [{"creative_type": "Static", "expected": 5}]}
        # Inactive client ws_off -> 409
        r = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_off",
            json=payload,
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r.status_code, 409, r.text)

        # Temporarily insert a client, delete it, and try PUT -> 404
        await self.db.workspaces.insert_one({
            "id": "ws_temp", "name": "Temp", "company_id": A, "status": "active",
        })
        await self.db.workspaces.delete_one({"id": "ws_temp", "company_id": A})
        r_deleted = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_temp",
            json=payload,
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_deleted.status_code, 404)

    async def test_08_bad_numbers_rejected_zero_accepted(self):
        snapshot_before = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})

        bad_values = [-1, 501, 1000000000, 2.5, "5", True]
        for val in bad_values:
            payload = {"lines": [{"creative_type": "Static", "expected": val}]}
            r = await self.client.put(
                "/api/v1/content-calendar/expectations/ws_sp",
                json=payload,
                headers=self._auth("admin_a"),
            )
            self.assertEqual(r.status_code, 422, f"Value {val} gave {r.status_code}")
            snap = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
            self.assertEqual(snap, snapshot_before)

        # Raw body for NaN / Infinity / -Infinity -> 422
        for raw in (
            '{"lines": [{"creative_type": "Static", "expected": NaN}]}',
            '{"lines": [{"creative_type": "Static", "expected": Infinity}]}',
            '{"lines": [{"creative_type": "Static", "expected": -Infinity}]}',
        ):
            r = await self.client.put(
                "/api/v1/content-calendar/expectations/ws_sp",
                content=raw,
                headers=dict(self._auth("admin_a"), **{"Content-Type": "application/json"}),
            )
            self.assertEqual(r.status_code, 422, f"Raw {raw} returned {r.status_code}: {r.text}")
            snap = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
            self.assertEqual(snap, snapshot_before)

        # 0 is accepted
        r_zero = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Static", "expected": 0}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_zero.status_code, 200, r_zero.text)
        doc = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        lines = {l["creative_type"]: l for l in doc["content_expectations"]["lines"]}
        self.assertEqual(lines["Static"]["expected"], 0)

    async def test_09_bad_types_and_extra_keys_rejected(self):
        # "Story" or "stories" -> 422
        for st in ("Story", "stories"):
            r = await self.client.put(
                "/api/v1/content-calendar/expectations/ws_sp",
                json={"lines": [{"creative_type": st, "expected": 5}]},
                headers=self._auth("admin_a"),
            )
            self.assertEqual(r.status_code, 422, f"{st} -> {r.status_code}")

        # Duplicate after canonicalisation ("Reel" + "reels") -> 422
        r_dup = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Reel", "expected": 2}, {"creative_type": "reels", "expected": 3}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_dup.status_code, 422, r_dup.text)

        # Unknown type "Hologram" -> 422
        r_holo = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Hologram", "expected": 2}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_holo.status_code, 422, r_holo.text)

        # "Cover Image" when company list lacks it and client never had it -> 422
        r_cov = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Cover Image", "expected": 2}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_cov.status_code, 422, r_cov.text)

        # Legacy type that client already had (ws_sp has Animated Post) -> accepted!
        r_leg = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Animated Post", "expected": 4}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_leg.status_code, 200, r_leg.text)

        # Extra keys in body -> 422 (extra="forbid")
        for extra in ({"company_id": A}, {"expected_max": 10}, {"layout": "grid"}):
            payload = {"lines": [dict({"creative_type": "Static", "expected": 5}, **extra)]}
            r = await self.client.put(
                "/api/v1/content-calendar/expectations/ws_sp",
                json=payload,
                headers=self._auth("admin_a"),
            )
            self.assertEqual(r.status_code, 422, f"Extra {extra} was not 422")

        # 31 lines -> 422
        lines31 = [{"creative_type": f"Type{i}", "expected": 1} for i in range(31)]
        r_31 = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": lines31},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_31.status_code, 422)

    async def test_10_merge_preserves_attributes_and_clears_correctly(self):
        # Initial ws_sp: Static (5, max 10), Carousel (null, included true, layout 3x3), Animated Post (2, skip 2026-11)

        # Static 7 keeps expected_max 10
        r1 = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Static", "expected": 7}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r1.status_code, 200, r1.text)
        doc = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        by_type = {l["creative_type"]: l for l in doc["content_expectations"]["lines"]}
        self.assertEqual(by_type["Static"]["expected"], 7)
        self.assertEqual(by_type["Static"]["expected_max"], 10)
        # Unsent Carousel and Animated Post are kept
        self.assertIn("Carousel", by_type)
        self.assertIn("Animated Post", by_type)

        # Static 12 drops expected_max (< 12)
        r2 = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Static", "expected": 12}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r2.status_code, 200, r2.text)
        doc = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        by_type = {l["creative_type"]: l for l in doc["content_expectations"]["lines"]}
        self.assertEqual(by_type["Static"]["expected"], 12)
        self.assertIsNone(by_type["Static"].get("expected_max"))

        # Animated Post 3 keeps skip_months
        r3 = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Animated Post", "expected": 3}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r3.status_code, 200, r3.text)
        doc = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        by_type = {l["creative_type"]: l for l in doc["content_expectations"]["lines"]}
        self.assertEqual(by_type["Animated Post"]["expected"], 3)
        self.assertEqual(by_type["Animated Post"]["skip_months"], ["2026-11"])

        # Carousel expected: None removes Carousel
        r4 = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Carousel", "expected": None}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r4.status_code, 200, r4.text)
        doc = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        by_type = {l["creative_type"]: l for l in doc["content_expectations"]["lines"]}
        self.assertNotIn("Carousel", by_type)

        # Canonical label conversion ("static post" -> "Static")
        r5 = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "static post", "expected": 4}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r5.status_code, 200, r5.text)
        doc = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        by_type = {l["creative_type"]: l for l in doc["content_expectations"]["lines"]}
        self.assertIn("Static", by_type)
        self.assertNotIn("static post", by_type)

        # All counts cleared -> content_expectations is None
        r6 = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [
                {"creative_type": "Static", "expected": None},
                {"creative_type": "Animated Post", "expected": None},
            ]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r6.status_code, 200, r6.text)
        doc = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        self.assertIsNone(doc["content_expectations"])

    async def test_11_no_other_field_touched_snapshot_diff(self):
        before = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        r = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Static", "expected": 9}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r.status_code, 200, r.text)
        after = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})

        diff_keys = []
        for k in set(list(before.keys()) + list(after.keys())):
            if before.get(k) != after.get(k):
                diff_keys.append(k)
        self.assertEqual(sorted(diff_keys), ["content_expectations", "updated_at"])

    async def test_12_reflection_in_report(self):
        # Set Video 3 and UGC 2
        payload = {
            "lines": [
                {"creative_type": "Video", "expected": 3},
                {"creative_type": "UGC", "expected": 2},
                {"creative_type": "Static", "expected": None},
                {"creative_type": "Carousel", "expected": None},
                {"creative_type": "Animated Post", "expected": None},
            ]
        }
        r = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json=payload,
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r.status_code, 200, r.text)

        # GET report internal
        r_rep = await self.client.get(
            "/api/v1/content-calendar/report?workspace_id=ws_sp&month=2026-11&audience=internal",
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_rep.status_code, 200, r_rep.text)
        body = r_rep.json()
        self.assertEqual(body["summary"]["planned"], 5)
        by_type = {row["creative_type"]: row for row in body["by_type"]}
        self.assertEqual(by_type["Video"]["expected"], 3)
        self.assertEqual(by_type["Video"]["posted"], 1)
        self.assertEqual(by_type["Video"]["gap"], 2)
        self.assertEqual(by_type["UGC"]["expected"], 2)
        self.assertEqual(by_type["UGC"]["posted"], 0)
        self.assertEqual(by_type["UGC"]["in_progress"], 1)
        self.assertEqual(by_type["UGC"]["gap"], 2)

        # GET report client
        r_client = await self.client.get(
            "/api/v1/content-calendar/report?workspace_id=ws_sp&month=2026-11&audience=client",
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_client.status_code, 200, r_client.text)
        text = r_client.text
        for word in FORBIDDEN:
            self.assertNotIn(word, text, word)

    async def test_13_workspace_input_bounds_and_legacy_read(self):
        # PATCH /workspaces/ws_sp with expected: -3 or 9999 -> 422
        for bad in (-3, 9999):
            r = await self.client.patch(
                "/api/v1/workspaces/ws_sp",
                json={"content_expectations": {"period": "month", "lines": [{"creative_type": "Static", "expected": bad}]}},
                headers=self._auth("admin_a"),
            )
            self.assertEqual(r.status_code, 422, f"Expected 422 for {bad}, got {r.status_code}: {r.text}")

        # Bounds on skip_months, layout, expected_max, lines count, and period
        bad_payloads = [
            {"content_expectations": {"period": "month", "lines": [{"creative_type": "Static", "skip_months": ["2026-13"]}]}},
            {"content_expectations": {"period": "month", "lines": [{"creative_type": "Static", "skip_months": [f"2026-{(i % 12) + 1:02d}" for i in range(25)]}]}},
            {"content_expectations": {"period": "month", "lines": [{"creative_type": "Static", "layout": "a" * 21}]}},
            {"content_expectations": {"period": "month", "lines": [{"creative_type": "Static", "expected_max": -1}]}},
            {"content_expectations": {"period": "month", "lines": [{"creative_type": f"Type{i}", "expected": 1} for i in range(31)]}},
            {"content_expectations": {"period": "weekly", "lines": [{"creative_type": "Static", "expected": 1}]}},
        ]
        for bad_p in bad_payloads:
            r = await self.client.patch(
                "/api/v1/workspaces/ws_sp",
                json=bad_p,
                headers=self._auth("admin_a"),
            )
            self.assertEqual(r.status_code, 422, f"Expected 422 for {bad_p}, got {r.status_code}: {r.text}")

        # A stored legacy doc with expected: -3 still returns 200 from GET /workspaces
        await self.db.workspaces.update_one(
            {"id": "ws_sp", "company_id": A},
            {"$set": {"content_expectations": {"period": "month", "lines": [{"creative_type": "Static", "expected": -3}]}}},
        )
        r_list = await self.client.get("/api/v1/workspaces", headers=self._auth("admin_a"))
        self.assertEqual(r_list.status_code, 200, r_list.text)

    async def test_14_route_order_not_swallowed_by_item_id(self):
        r = await self.client.get("/api/v1/content-calendar/expectations", headers=self._auth("admin_a"))
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertIn("clients", body)
        self.assertNotIn("detail", body)

    async def test_15_rate_limit_31st_put_429(self):
        limiter.enabled = True
        try:
            payload = {"lines": [{"creative_type": "Static", "expected": 5}]}
            last_status = 200
            for i in range(35):
                r = await self.client.put(
                    "/api/v1/content-calendar/expectations/ws_sp",
                    json=payload,
                    headers=self._auth("admin_a"),
                )
                last_status = r.status_code
                if r.status_code == 429:
                    break
            self.assertEqual(last_status, 429)
        finally:
            limiter.enabled = False

    async def test_16_duplicate_spelling_variants_deduped_and_put_ok(self):
        # With ["Static", "Reel", "Animated Post", "animated post", "Animated posts"],
        # GET returns exactly one Animated label, and PUT sending one line per returned type -> 200
        await self.db.content_calendar_settings.update_one(
            {"_id": f"field_constants:{A}"},
            {"$set": {"creative_types": ["Static", "Reel", "Animated Post", "animated post", "Animated posts"]}},
        )
        r = await self.client.get("/api/v1/content-calendar/expectations", headers=self._auth("admin_a"))
        self.assertEqual(r.status_code, 200, r.text)
        types = r.json()["creative_types"]
        animated_labels = [t for t in types if "animat" in t.lower()]
        self.assertEqual(len(animated_labels), 1)
        self.assertEqual(animated_labels[0], "Animated Post")

        put_payload = {"lines": [{"creative_type": t, "expected": 2} for t in types]}
        r_put = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json=put_payload,
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r_put.status_code, 200, r_put.text)

    async def test_17_odd_stored_data_never_500_and_story_preserved(self):
        payload = {"lines": [{"creative_type": "Static", "expected": 5}]}

        # 1. content_expectations: "x"
        await self.db.workspaces.update_one(
            {"id": "ws_sp", "company_id": A},
            {"$set": {"content_expectations": "x"}},
        )
        r = await self.client.put("/api/v1/content-calendar/expectations/ws_sp", json=payload, headers=self._auth("admin_a"))
        self.assertEqual(r.status_code, 200, r.text)

        # 2. lines: ["garbage", {...}]
        await self.db.workspaces.update_one(
            {"id": "ws_sp", "company_id": A},
            {"$set": {"content_expectations": {"period": "month", "lines": ["garbage", {"creative_type": "Static", "expected": 2}]}}},
        )
        r = await self.client.put("/api/v1/content-calendar/expectations/ws_sp", json=payload, headers=self._auth("admin_a"))
        self.assertEqual(r.status_code, 200, r.text)

        # 3. expected_max: "10"
        await self.db.workspaces.update_one(
            {"id": "ws_sp", "company_id": A},
            {"$set": {"content_expectations": {"period": "month", "lines": [{"creative_type": "Static", "expected": 2, "expected_max": "10"}]}}},
        )
        r = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Static", "expected": 15}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r.status_code, 200, r.text)
        doc = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        lines = {l["creative_type"]: l for l in doc["content_expectations"]["lines"]}
        self.assertEqual(lines["Static"]["expected_max"], "10")

        # 4. a stored Story line survives a PUT
        await self.db.workspaces.update_one(
            {"id": "ws_sp", "company_id": A},
            {"$set": {"content_expectations": {"period": "month", "lines": [{"creative_type": "Story", "expected": 10}]}}},
        )
        r = await self.client.put(
            "/api/v1/content-calendar/expectations/ws_sp",
            json={"lines": [{"creative_type": "Static", "expected": 4}]},
            headers=self._auth("admin_a"),
        )
        self.assertEqual(r.status_code, 200, r.text)
        doc = await self.db.workspaces.find_one({"id": "ws_sp", "company_id": A})
        types = [l["creative_type"] for l in doc["content_expectations"]["lines"]]
        self.assertIn("Story", types)


if __name__ == "__main__":
    unittest.main()
