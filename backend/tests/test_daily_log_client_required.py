"""Client / project is required on daily log create and cannot be cleared on update."""
from __future__ import annotations

import os
import sys
import unittest

from pydantic import ValidationError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.schemas.daily_log import DailyLogEntryCreate, DailyLogEntryUpdate


class TestDailyLogClientRequired(unittest.TestCase):
    def test_create_rejects_missing_client(self):
        with self.assertRaises(ValidationError) as ctx:
            DailyLogEntryCreate(
                date="2026-11-14",
                client_project="",
                task_description="Worked on banners",
                hours_utilized="1.0",
            )
        self.assertIn("Please select a client.", str(ctx.exception))

    def test_create_accepts_selected_client(self):
        entry = DailyLogEntryCreate(
            date="2026-11-14",
            client_project="Acme",
            task_description="Worked on banners",
            hours_utilized="1.0",
        )
        self.assertEqual(entry.client_project, "Acme")

    def test_update_rejects_blank_client(self):
        with self.assertRaises(ValidationError):
            DailyLogEntryUpdate(client_project="   ")

    def test_update_allows_omitted_client(self):
        entry = DailyLogEntryUpdate(task_description="Updated copy")
        self.assertIsNone(entry.client_project)


if __name__ == "__main__":
    unittest.main()
