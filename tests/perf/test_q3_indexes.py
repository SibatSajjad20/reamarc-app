"""Q3: users.id lookups use an index."""
from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.config import settings
from app.core.security import get_password_hash
from app.database import connect_to_mongo, db_instance, _create_indexes_background


def _plan_stages(plan: dict) -> list[str]:
    stages = []

    def walk(node):
        if not isinstance(node, dict):
            return
        if node.get("stage"):
            stages.append(node["stage"])
        for key in ("inputStage", "inputStages", "winningPlan"):
            child = node.get(key)
            if isinstance(child, dict):
                walk(child)
            elif isinstance(child, list):
                for item in child:
                    walk(item)

    walk(plan)
    return stages


class UserIdIndexTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        object.__setattr__(settings, "MONGODB_DB_NAME", "perf_r1_q3")
        await connect_to_mongo()
        await _create_indexes_background()
        self.db = db_instance.db
        self.uid = f"perf_idx_{uuid.uuid4().hex[:8]}"
        await self.db.users.insert_one(
            {
                "_id": self.uid,
                "id": self.uid,
                "email": f"{self.uid}@perf.example.com",
                "hashed_password": get_password_hash("SecretPassword123!"),
                "role": "admin",
                "is_active": True,
            }
        )

    async def asyncTearDown(self):
        await self.db.users.delete_many({"id": self.uid})

    async def test_users_id_lookup_is_ixscan(self):
        explain = await self.db.users.find({"id": self.uid}).explain()
        planner = explain.get("queryPlanner") or explain
        stages = _plan_stages(planner)
        self.assertIn("IXSCAN", stages, explain)
        self.assertNotIn("COLLSCAN", stages)
