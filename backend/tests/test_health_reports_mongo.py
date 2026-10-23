"""/health must say healthy when Mongo answers (it said 'degraded' on every call before)."""
import os, sys, unittest
os.environ.setdefault("SECRET_KEY", "test-secret-key-health-0123456789")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import httpx
from app.database import connect_to_mongo
from app.main import app


class TestHealth(unittest.IsolatedAsyncioTestCase):
    async def test_healthy_when_mongo_up(self):
        await connect_to_mongo()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            r = await c.get("/health")
        from app.database import db_instance
        db_instance.client.close()
        db_instance.client = None
        db_instance.db = None
        self.assertEqual(r.json()["status"], "healthy", r.text)


if __name__ == "__main__":
    unittest.main()
