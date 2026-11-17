import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  asCommentList,
  assignmentPeers,
  filterTaskList,
  allowedTaskStages,
  isGroupedAssignment,
  isTaskApprover,
  nextAllowedStage,
  nextStage,
  countHomeTasks,
  normalizeClients,
  normalizePeople,
  normalizeTask,
  stageTone,
  TASK_STAGES,
  toApiTaskStatus,
  validateWorkTaskForm,
} from './taskForm.ts';

describe('work task form options', () => {
  it('uses the shared status pipeline', () => {
    assert.deepEqual(
      TASK_STAGES.map((s) => s.value),
      ['todo', 'in_progress', 'review', 'completed'],
    );
  });

  it('counts home overview stages without mixing review into in progress', () => {
    const counts = countHomeTasks([
      normalizeTask({ id: '1', title: 'A', status: 'completed' }),
      normalizeTask({ id: '2', title: 'B', status: 'in_review' }),
      normalizeTask({ id: '3', title: 'C', status: 'todo' }),
    ]);
    assert.deepEqual(counts, { todo: 1, progress: 0, review: 1, done: 1 });
  });

  it('filters by mine and status', () => {
    const items = [
      normalizeTask({ id: '1', title: 'Mine todo', status: 'todo', assignee_id: 'u1' }),
      normalizeTask({ id: '2', title: 'Other progress', status: 'in_progress', assignee_id: 'u2' }),
      normalizeTask({ id: '3', title: 'Mine review', status: 'in_review', assignee_id: 'u1' }),
    ];
    assert.equal(filterTaskList(items, { filter: 'mine', userId: 'u1' }).length, 2);
    assert.equal(filterTaskList(items, { filter: 'todo' }).map((t) => t.id).join(','), '1');
    assert.equal(filterTaskList(items, { filter: 'review' }).map((t) => t.id).join(','), '3');
  });

  it('normalizes people and clients from directory payloads', () => {
    const people = normalizePeople([
      { id: 'u1', full_name: 'Ada', role: 'team_member' },
      { id: 'u2', name: 'Client Co', role: 'client' },
      { id: 'u1', full_name: 'Ada dup' },
      { user_id: 'u3', email: 'b@x.com', is_active: false },
    ]);
    assert.deepEqual(people.map((p) => p.id), ['u1']);
    const clients = normalizeClients({
      items: [
        { id: 'ws-1', name: 'Acme', status: 'active' },
        { id: 'ws-2', name: 'Old', status: 'inactive' },
        { name: 'No id' },
      ],
    });
    assert.deepEqual(clients.map((c) => c.id), ['ws-1']);
  });

  it('normalizes comment payloads that are not arrays', () => {
    const fromObject = asCommentList({
      id: 'tc_1',
      user_name: 'Ada',
      text: 'Shipped',
      created_at: '2026-11-13',
    });
    assert.equal(fromObject.length, 1);
    assert.equal(fromObject[0].text, 'Shipped');
    assert.equal(asCommentList({ comments: [{ id: 'tc_2', text: 'Hi', user_name: 'Bo' }] }).length, 1);
    assert.equal(asCommentList(undefined).length, 0);
    assert.equal(validateWorkTaskForm({ title: '  ' }).title, 'Task title cannot be empty');
    assert.equal(validateWorkTaskForm({ title: 'Do it' }).title, undefined);
  });

  it('normalizes task payloads', () => {
    const task = normalizeTask({
      id: 'wt_1',
      title: 'Brief client',
      status: 'in_review',
      estimate_hours: 3,
      client_name: 'Acme',
    });
    assert.equal(task.status, 'review');
    assert.equal(task.title, 'Brief client');
    assert.equal(nextStage('todo'), 'in_progress');
    assert.equal(nextStage('completed'), null);
    assert.equal(toApiTaskStatus('review'), 'in_review');
  });

  it('hides complete for a lead assigned by another lead; allows the assigner', () => {
    const shamir = { id: 'lead.creative', role: 'team_lead', primary_department: 'Creative' };
    const haris = { id: 'lead.web', role: 'team_lead', primary_department: 'Website' };
    const task = normalizeTask({
      id: 't1',
      title: 'Cross-dept',
      status: 'in_review',
      assignee_id: 'lead.creative',
      assignee_role: 'team_lead',
      assigner_id: 'lead.web',
      assigner_role: 'team_lead',
      department: 'Creative',
    });
    assert.equal(isTaskApprover(shamir, task), false);
    assert.equal(nextAllowedStage(shamir, task), null);
    assert.equal(isTaskApprover(haris, task), true);
    assert.equal(nextAllowedStage(haris, task), 'completed');
  });

  it('lets a team lead complete work an admin assigned to them', () => {
    const shamir = { id: 'lead.creative', role: 'team_lead', primary_department: 'Creative' };
    const task = normalizeTask({
      id: 't2',
      title: 'Admin assigned',
      status: 'in_review',
      assignee_id: 'lead.creative',
      assignee_role: 'team_lead',
      assigner_id: 'admin',
      assigner_role: 'admin',
      department: 'Creative',
    });
    assert.equal(nextAllowedStage(shamir, task), 'completed');
  });

  it('does not offer other stages on a completed task for the assignee', () => {
    const shamir = { id: 'lead.creative', role: 'team_lead', primary_department: 'Creative' };
    const task = normalizeTask({
      id: 't3',
      title: 'Done',
      status: 'completed',
      assignee_id: 'lead.creative',
      assigner_id: 'lead.web',
      department: 'Creative',
    });
    assert.equal(nextAllowedStage(shamir, task), null);
    assert.deepEqual(
      allowedTaskStages(shamir, task).map((s) => s.value),
      ['completed'],
    );
  });

  it('correctly identifies multi-assignee tasks and peers', () => {
    const multiTask = normalizeTask({
      id: 't-pair-1',
      serial: 'T-0041',
      title: 'Shared Project',
      status: 'in_progress',
      assignee_id: 'emp-1',
      assignee_name: 'Safeer',
      assignment_group_id: 'grp-1',
      assignment_group: {
        id: 'grp-1',
        total_count: 2,
        done_count: 1,
        rollup_status: 'in_progress',
        peers: [
          { id: 't-pair-1', serial: 'T-0041', assignee_id: 'emp-1', assignee_name: 'Safeer', status: 'in_progress' },
          { id: 't-pair-2', serial: 'T-0042', assignee_id: 'emp-2', assignee_name: 'Haris', status: 'completed' },
        ],
      },
    });

    assert.equal(isGroupedAssignment(multiTask), true);
    const peers = assignmentPeers(multiTask);
    assert.equal(peers.length, 2);
    assert.equal(peers[0].assignee_name, 'Safeer');
    assert.equal(peers[1].assignee_name, 'Haris');
    assert.equal(peers[1].status, 'completed');

    const singleTask = normalizeTask({
      id: 't-solo',
      serial: 'T-0043',
      title: 'Solo Project',
      status: 'todo',
      assignee_id: 'emp-1',
    });
    assert.equal(isGroupedAssignment(singleTask), false);
    assert.equal(assignmentPeers(singleTask).length, 0);

    const toneDone = stageTone('completed');
    assert.equal(toneDone.color, '#059669');
    const toneProgress = stageTone('in_progress');
    assert.equal(toneProgress.color, '#4338CA');
  });
});
