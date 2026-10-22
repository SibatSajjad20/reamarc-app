"""Secret query params must not appear in application logs."""
from __future__ import annotations

import io
import json
import logging
import unittest

from app.main import setup_logging


class TestLogRedaction(unittest.TestCase):
    def setUp(self):
        setup_logging()
        self.buf = io.StringIO()
        handler = logging.getLogger().handlers[0]
        handler.stream = self.buf

    def test_access_token_is_redacted_and_httpx_is_warning(self):
        logging.getLogger().info(
            "GET https://graph.facebook.com/v19.0/me?access_token=ABC&fields=id"
        )
        line = self.buf.getvalue()
        payload = json.loads(line)
        self.assertIn("access_token=[REDACTED]", payload["message"])
        self.assertNotIn("ABC", payload["message"])
        self.assertEqual(logging.getLogger("httpx").level, logging.WARNING)
        self.assertEqual(logging.getLogger("httpcore").level, logging.WARNING)

    def test_redacts_interpolated_args(self):
        logging.getLogger().info(
            "outbound %s",
            "https://graph.facebook.com/v19.0/me?client_secret=shh&refresh_token=xyzsecret",
        )
        payload = json.loads(self.buf.getvalue())
        self.assertIn("client_secret=[REDACTED]", payload["message"])
        self.assertIn("refresh_token=[REDACTED]", payload["message"])
        self.assertNotIn("shh", payload["message"])
        self.assertNotIn("xyzsecret", payload["message"])
