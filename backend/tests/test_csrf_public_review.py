"""Public content-calendar review POSTs skip cookie CSRF enforcement."""
from __future__ import annotations

import os
import sys
import unittest

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-public-review-csrf")
os.environ["RUN_SCHEDULERS"] = "0"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx

from app.config import settings
from app.core.limiter import limiter
from app.main import app


class TestPublicReviewCsrf(unittest.IsolatedAsyncioTestCase):
    async def test_public_action_post_with_cookie_and_no_header_is_not_403(self):
        prev = settings.IS_PRODUCTION
        object.__setattr__(settings, "IS_PRODUCTION", True)
        limiter.enabled = False
        try:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                client.cookies.set("access_token", "dummy-session")
                res = await client.post(
                    "/api/v1/content-calendar/public/review/missing-token/action",
                    json={"action": "approve"},
                )
            self.assertNotEqual(res.status_code, 403, res.text)
        finally:
            limiter.enabled = True
            object.__setattr__(settings, "IS_PRODUCTION", prev)


if __name__ == "__main__":
    unittest.main()
