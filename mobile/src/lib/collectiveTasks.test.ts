import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAdvanceTo,
  canCreateCollective,
  canLogTimeOn,
  collectiveRowsError,
  isLeadOwnerCandidate,
  isTaskApprover,
  MAX_COLLECTIVE_SUBTASKS,
  normalizeTask,
  subtaskProgressLabel,
  subtasksBlockClose,
} from './taskForm.ts';

const lead = { id: 'lead1', role: 'team_lead', department: 'Website' };
const admin = { id: 'adm', role: 'admin' };
const member = { id: 'm1', role: 'employee', department: 'Website' };

function mainTask(extra: Record<string, unknown> = {}) {
  return normalizeTask({
    id: 'main',
    title: 'Launch site',
    status: 'in_progress',
    assignee_id: 'lead1',
    assignee_role: 'team_lead',
    assigner_id: 'adm',
    assigner_role: 'admin',
    subtasks_count: 3,
    subtasks_done: 1,
    subtask_progress: 33,
    ...extra,
  });
}

describe('collective tasks (mobile)', () => {
  it('normalizes sub-task counts and progress', () => {
    const t = mainTask();
    assert.equal(t.subtasks_count, 3);
    assert.equal(t.subtasks_done, 1);
    assert.equal(t.subtask_progress, 33);
    assert.equal(subtaskProgressLabel(t), '1/3 sub-tasks · 33%');
  });

  it('has no progress label for plain tasks', () => {
    assert.equal(subtaskProgressLabel(normalizeTask({ id: 'x', title: 'x' })), null);
  });

  it('blocks review/completed while sub-tasks are open', () => {
    const t = mainTask();
    assert.equal(subtasksBlockClose(t, 'completed'), true);
    assert.equal(subtasksBlockClose(t, 'review'), true);
    assert.equal(subtasksBlockClose(t, 'in_progress'), false);
    assert.equal(canAdvanceTo(lead, t, 'completed'), false);
    assert.equal(canAdvanceTo(admin, t, 'completed'), false);
  });

  it('allows closing once every sub-task is done', () => {
    const t = mainTask({ subtasks_done: 3, subtask_progress: 100 });
    assert.equal(subtasksBlockClose(t, 'completed'), false);
    assert.equal(canAdvanceTo(lead, t, 'completed'), true);
  });

  it('lead owner approves sub-tasks, assignee does not', () => {
    const sub = normalizeTask({
      id: 's1',
      title: 'Hero',
      status: 'review',
      parent_id: 'main',
      lead_owner_id: 'lead1',
      assignee_id: 'm1',
      assignee_role: 'employee',
      assigner_id: 'lead1',
      department: 'Content',
    });
    assert.equal(isTaskApprover({ id: 'lead1', role: 'team_lead', department: 'Website' }, sub), true);
    assert.equal(isTaskApprover(member, sub), false);
  });

  it('only admins and leads create collective tasks', () => {
    assert.equal(canCreateCollective(admin), true);
    assert.equal(canCreateCollective(lead), true);
    assert.equal(canCreateCollective(member), false);
    assert.equal(canCreateCollective({ id: 'h', role: 'hr' }), false);
    assert.equal(isLeadOwnerCandidate({ role: 'team_lead' }), true);
    assert.equal(isLeadOwnerCandidate({ role: 'employee' }), false);
  });

  it('only the assignee or an admin logs time', () => {
    const t = mainTask();
    assert.equal(canLogTimeOn(lead, t), true);
    assert.equal(canLogTimeOn(admin, t), true);
    assert.equal(canLogTimeOn(member, t), false);
  });

  it('validates sub-task rows', () => {
    assert.equal(collectiveRowsError([]), 'Add at least one sub-task');
    assert.equal(collectiveRowsError([{ key: 'a', title: ' ', assignee_id: 'm1' }]), 'Sub-task 1 needs a title');
    assert.equal(collectiveRowsError([{ key: 'a', title: 'x', assignee_id: '' }]), 'Sub-task 1 needs an assignee');
    assert.equal(collectiveRowsError([{ key: 'a', title: 'x', assignee_id: 'm1' }]), null);
    const many = Array.from({ length: MAX_COLLECTIVE_SUBTASKS + 1 }, (_, i) => ({ key: String(i), title: 't', assignee_id: 'm1' }));
    assert.match(collectiveRowsError(many) || '', /At most/);
  });
});
