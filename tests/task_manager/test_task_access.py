"""Permission matrix, cross-dept rules, HR/Ops exclusion, visibility queries."""
from __future__ import annotations

import unittest

from app.services.task_access import (
    assignable_users,
    can_assign_to,
    can_attach,
    can_cancel,
    can_comment,
    can_delete,
    can_edit,
    can_open_module,
    can_transition,
    can_view,
    default_task_settings,
    is_approver,
    is_task_excluded,
    is_view_only,
    visibility_query,
)
from tests.task_manager.conftest import (
    ADMIN,
    HR,
    LEAD_CONTENT,
    LEAD_SEO,
    LEAD_WEB,
    MEMBER_C1,
    MEMBER_C2,
    MEMBER_HR,
    MEMBER_WEB,
    OPS,
    task_doc,
)

FLIPPED = {"excluded_roles": [], "excluded_departments": []}


class TaskAccessMatrixTests(unittest.TestCase):
    def test_open_module_defaults(self):
        self.assertTrue(can_open_module(ADMIN))
        self.assertTrue(can_open_module(LEAD_CONTENT))
        self.assertTrue(can_open_module(MEMBER_C1))
        self.assertFalse(can_open_module(HR))
        self.assertFalse(can_open_module(OPS))
        self.assertFalse(can_open_module(MEMBER_HR))
        self.assertTrue(can_open_module(HR, FLIPPED))
        self.assertTrue(can_open_module(OPS, FLIPPED))

    def test_admin_never_excluded(self):
        self.assertFalse(is_task_excluded(ADMIN, default_task_settings()))

    def test_hr_ops_member_hr_excluded(self):
        self.assertTrue(is_task_excluded(HR))
        self.assertTrue(is_task_excluded(OPS))
        self.assertTrue(is_task_excluded(MEMBER_HR))
        self.assertFalse(is_task_excluded(HR, FLIPPED))

    def test_assign_matrix(self):
        self.assertTrue(can_assign_to(ADMIN, MEMBER_WEB))
        self.assertTrue(can_assign_to(LEAD_CONTENT, LEAD_WEB))
        self.assertFalse(can_assign_to(LEAD_CONTENT, MEMBER_WEB))
        self.assertFalse(can_assign_to(MEMBER_C1, MEMBER_WEB))
        self.assertFalse(can_assign_to(MEMBER_C1, LEAD_WEB))
        self.assertTrue(can_assign_to(MEMBER_C1, MEMBER_C2))
        self.assertTrue(can_assign_to(MEMBER_C1, LEAD_CONTENT))
        self.assertTrue(can_assign_to(LEAD_CONTENT, MEMBER_C1))
        self.assertTrue(can_assign_to(LEAD_CONTENT, LEAD_CONTENT))
        self.assertFalse(can_assign_to(LEAD_CONTENT, HR))
        self.assertFalse(can_assign_to(MEMBER_C1, OPS))

    def test_assignable_users_drops_excluded(self):
        cands = [ADMIN, LEAD_CONTENT, MEMBER_C1, MEMBER_C2, LEAD_WEB, MEMBER_WEB, HR, OPS, MEMBER_HR]
        ids = {u["id"] for u in assignable_users(LEAD_CONTENT, cands)}
        self.assertIn(LEAD_WEB["id"], ids)
        self.assertNotIn(MEMBER_WEB["id"], ids)
        self.assertNotIn(HR["id"], ids)
        self.assertNotIn(MEMBER_HR["id"], ids)
        member_ids = {u["id"] for u in assignable_users(MEMBER_C1, cands)}
        self.assertIn(MEMBER_C2["id"], member_ids)
        self.assertIn(LEAD_CONTENT["id"], member_ids)
        self.assertNotIn(LEAD_WEB["id"], member_ids)

    def test_view_edit_comment_attach_cancel_delete(self):
        t = task_doc()
        self.assertTrue(can_view(ADMIN, t))
        self.assertTrue(can_edit(ADMIN, t))
        self.assertTrue(can_delete(ADMIN, t))
        self.assertTrue(can_view(LEAD_CONTENT, t))
        self.assertTrue(can_edit(LEAD_CONTENT, t))
        self.assertFalse(can_delete(LEAD_CONTENT, t))
        self.assertTrue(can_view(MEMBER_C1, t))
        self.assertFalse(can_edit(MEMBER_C1, t))
        self.assertTrue(can_comment(MEMBER_C1, t))
        self.assertTrue(can_attach(MEMBER_C1, t))
        self.assertTrue(can_cancel(LEAD_CONTENT, t))
        self.assertFalse(can_cancel(MEMBER_C1, t))
        self.assertFalse(can_view(HR, t))
        self.assertFalse(can_view(OPS, t))
        self.assertFalse(can_view(MEMBER_HR, t))
        self.assertFalse(can_view(MEMBER_WEB, t))

    def test_lead_department_view_only(self):
        t = task_doc(
            creator_id=MEMBER_C1["id"],
            assigner_id=MEMBER_C1["id"],
            assignee_id=MEMBER_C2["id"],
            involved_ids=[MEMBER_C1["id"], MEMBER_C2["id"]],
            assignment_chain=[
                {
                    "from_id": MEMBER_C1["id"],
                    "from_name": "Member Content1",
                    "to_id": MEMBER_C2["id"],
                    "to_name": "Member Content2",
                    "department": "Content",
                }
            ],
            department="Content",
        )
        self.assertTrue(can_view(LEAD_CONTENT, t))
        self.assertTrue(can_comment(LEAD_CONTENT, t))
        self.assertFalse(can_edit(LEAD_CONTENT, t))
        self.assertTrue(is_view_only(LEAD_CONTENT, t))
        web_task = task_doc(
            id="tsk_web",
            creator_id=LEAD_WEB["id"],
            assigner_id=LEAD_WEB["id"],
            assignee_id=MEMBER_WEB["id"],
            involved_ids=[LEAD_WEB["id"], MEMBER_WEB["id"]],
            assignment_chain=[
                {
                    "from_id": LEAD_WEB["id"],
                    "from_name": "Lead Web",
                    "to_id": MEMBER_WEB["id"],
                    "to_name": "Member Web",
                    "department": "Website",
                }
            ],
            department="Website",
        )
        self.assertFalse(can_view(LEAD_CONTENT, web_task))
        self.assertFalse(can_view(MEMBER_C2, web_task))

    def test_visibility_query(self):
        self.assertEqual(visibility_query(ADMIN), {})
        q_lead = visibility_query(LEAD_CONTENT)
        self.assertIn("$or", q_lead)
        q_member = visibility_query(MEMBER_C1)
        self.assertEqual(q_member, {"involved_ids": MEMBER_C1["id"]})
        q_hr = visibility_query(HR)
        self.assertEqual(q_hr["id"], {"$in": []})

    def test_transitions(self):
        t = task_doc(status="todo")
        ok, _ = can_transition(MEMBER_C1, t, "in_progress")
        self.assertTrue(ok)
        ok, msg = can_transition(MEMBER_C1, t, "completed")
        self.assertFalse(ok)
        t["status"] = "in_progress"
        ok, _ = can_transition(MEMBER_C1, t, "in_review")
        self.assertTrue(ok)
        t["status"] = "in_review"
        ok, msg = can_transition(MEMBER_C1, t, "completed")
        self.assertFalse(ok)
        ok, _ = can_transition(LEAD_CONTENT, t, "completed")
        self.assertTrue(ok)
        ok, msg = can_transition(LEAD_CONTENT, t, "in_progress")
        self.assertFalse(ok)
        ok, _ = can_transition(LEAD_CONTENT, t, "in_progress", reason="needs work")
        self.assertTrue(ok)
        self_assigned = task_doc(
            status="in_progress",
            creator_id=MEMBER_C1["id"],
            assigner_id=MEMBER_C1["id"],
            assignee_id=MEMBER_C1["id"],
            involved_ids=[MEMBER_C1["id"]],
        )
        ok, _ = can_transition(MEMBER_C1, self_assigned, "completed")
        self.assertFalse(ok)

    def test_lead_self_assigned_can_approve(self):
        lead_self = task_doc(
            status="in_review",
            creator_id=LEAD_CONTENT["id"],
            assigner_id=LEAD_CONTENT["id"],
            assigner_role="team_lead",
            assignee_id=LEAD_CONTENT["id"],
            assignee_role="team_lead",
            involved_ids=[LEAD_CONTENT["id"]],
            assignment_chain=[],
            department="Content",
        )
        self.assertTrue(is_approver(LEAD_CONTENT, lead_self))
        ok, _ = can_transition(LEAD_CONTENT, lead_self, "completed")
        self.assertTrue(ok)
        self.assertFalse(is_approver(MEMBER_C1, lead_self))
        member_self_review = task_doc(
            status="in_review",
            creator_id=MEMBER_C1["id"],
            assigner_id=MEMBER_C1["id"],
            assigner_role="team_member",
            assignee_id=MEMBER_C1["id"],
            assignee_role="team_member",
            involved_ids=[MEMBER_C1["id"]],
            assignment_chain=[],
        )
        self.assertFalse(is_approver(MEMBER_C1, member_self_review))
        ok, _ = can_transition(MEMBER_C1, member_self_review, "completed")
        self.assertFalse(ok)

    def test_approval_lead_admin_and_lead_to_lead(self):
        admin_to_lead = task_doc(
            status="in_review",
            creator_id=ADMIN["id"],
            assigner_id=ADMIN["id"],
            assigner_role="admin",
            assignee_id=LEAD_CONTENT["id"],
            assignee_role="team_lead",
            involved_ids=[ADMIN["id"], LEAD_CONTENT["id"]],
            assignment_chain=[],
            department="Content",
        )
        self.assertTrue(is_approver(LEAD_CONTENT, admin_to_lead))
        self.assertTrue(is_approver(ADMIN, admin_to_lead))
        self.assertFalse(is_approver(MEMBER_C1, admin_to_lead))

        admin_to_member = task_doc(
            status="in_review",
            creator_id=ADMIN["id"],
            assigner_id=ADMIN["id"],
            assigner_role="admin",
            assignee_id=MEMBER_C1["id"],
            assignee_role="team_member",
            involved_ids=[ADMIN["id"], MEMBER_C1["id"]],
            assignment_chain=[],
            department="Content",
        )
        self.assertTrue(is_approver(LEAD_CONTENT, admin_to_member))
        self.assertTrue(is_approver(ADMIN, admin_to_member))
        self.assertFalse(is_approver(MEMBER_C1, admin_to_member))
        self.assertFalse(is_approver(LEAD_WEB, admin_to_member))

        lead_to_member = task_doc(
            status="in_review",
            creator_id=LEAD_CONTENT["id"],
            assigner_id=LEAD_CONTENT["id"],
            assigner_role="team_lead",
            assignee_id=MEMBER_C1["id"],
            assignee_role="team_member",
            involved_ids=[LEAD_CONTENT["id"], MEMBER_C1["id"]],
            department="Content",
        )
        self.assertTrue(is_approver(LEAD_CONTENT, lead_to_member))
        self.assertTrue(is_approver(ADMIN, lead_to_member))
        self.assertFalse(is_approver(MEMBER_C1, lead_to_member))
        self.assertFalse(is_approver(LEAD_WEB, lead_to_member))

        lead_to_lead = task_doc(
            status="in_review",
            creator_id=LEAD_WEB["id"],
            assigner_id=LEAD_WEB["id"],
            assigner_role="team_lead",
            assignee_id=LEAD_CONTENT["id"],
            assignee_role="team_lead",
            involved_ids=[LEAD_WEB["id"], LEAD_CONTENT["id"]],
            assignment_chain=[
                {
                    "from_id": LEAD_WEB["id"],
                    "from_name": "Lead Web",
                    "to_id": LEAD_CONTENT["id"],
                    "to_name": "Lead Content",
                    "department": "Content",
                }
            ],
            department="Content",
        )
        self.assertTrue(is_approver(LEAD_WEB, lead_to_lead))
        ok, _ = can_transition(LEAD_WEB, lead_to_lead, "completed")
        self.assertTrue(ok)
        self.assertFalse(is_approver(LEAD_CONTENT, lead_to_lead))
        ok, _ = can_transition(LEAD_CONTENT, lead_to_lead, "completed")
        self.assertFalse(ok)
        self.assertFalse(is_approver(LEAD_SEO, lead_to_lead))
        self.assertTrue(is_approver(ADMIN, lead_to_lead))

    def test_reopen_and_cancel(self):
        t = task_doc(status="completed")
        ok, _ = can_transition(LEAD_CONTENT, t, "in_progress")
        self.assertTrue(ok)
        t2 = task_doc(status="cancelled")
        ok, _ = can_transition(ADMIN, t2, "todo")
        self.assertFalse(ok)
