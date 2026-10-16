"""Workspace matching for content calendar list must not N+1 Mongo."""
import unittest

from app.services.content_calendar_service import _match_workspace_id_for_client


class WorkspaceMatchTests(unittest.TestCase):
    def setUp(self):
        self.workspaces = [
            {"id": "ws-apex", "name": "Apex Transfers LLC"},
            {"id": "ws-nova", "name": "Nova Digital"},
        ]

    def test_exact_match(self):
        self.assertEqual(
            _match_workspace_id_for_client("Apex Transfers LLC", self.workspaces),
            "ws-apex",
        )

    def test_suffix_stripped_match(self):
        self.assertEqual(
            _match_workspace_id_for_client("Apex Transfers", self.workspaces),
            "ws-apex",
        )

    def test_keyword_match(self):
        self.assertEqual(
            _match_workspace_id_for_client("Nova Digital", [{"id": "ws-nova", "name": "Nova Digital Agency"}]),
            "ws-nova",
        )

    def test_no_match(self):
        self.assertIsNone(_match_workspace_id_for_client("Unknown Client", self.workspaces))

    def test_empty_inputs(self):
        self.assertIsNone(_match_workspace_id_for_client("", self.workspaces))
        self.assertIsNone(_match_workspace_id_for_client("Apex", []))
        self.assertIsNone(_match_workspace_id_for_client(None, self.workspaces))


if __name__ == "__main__":
    unittest.main()
