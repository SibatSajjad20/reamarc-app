import { describe, expect, it } from 'vitest';
import type { Task } from '@/types/task';
import {
  assignedByLabel,
  assignmentPeopleNames,
  boardStatusForTask,
  collapseAssignmentGroups,
  rollupAssignmentStatus,
} from './taskAssignmentGroup';

const group = {
  id: 'tag1',
  rollup_status: 'in_progress' as const,
  done_count: 1,
  total_count: 2,
  peers: [
    { id: 'a', serial: 'T-1', assignee_id: 'u1', status: 'completed' as const },
    { id: 'b', serial: 'T-2', assignee_id: 'u2', status: 'in_progress' as const },
  ],
};

const a: Task = {
  id: 'a',
  serial: 'T-1',
  title: 'Brief',
  status: 'completed',
  priority: 'medium',
  assignee_id: 'u1',
  assignment_group_id: 'tag1',
  assignment_group: group,
};
const b: Task = {
  ...a,
  id: 'b',
  serial: 'T-2',
  status: 'in_progress',
  assignee_id: 'u2',
};

describe('taskAssignmentGroup', () => {
  it('rollups to the least-advanced open stage', () => {
    expect(rollupAssignmentStatus(['completed', 'todo'])).toBe('todo');
    expect(rollupAssignmentStatus(['completed', 'completed'])).toBe('completed');
    expect(rollupAssignmentStatus(['cancelled', 'cancelled'])).toBe('cancelled');
  });

  it('keeps different stages as separate rows so a lead can approve a teammate', () => {
    const out = collapseAssignmentGroups([a, b]);
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.status).sort()).toEqual(['completed', 'in_progress']);
    expect(boardStatusForTask(a)).toBe('completed');
  });

  it('collapses only copies that share a stage', () => {
    const twin: Task = { ...b, id: 'c', serial: 'T-3', assignee_id: 'u3' };
    const out = collapseAssignmentGroups([b, twin]);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('in_progress');
  });

  it('prefers the viewer copy when several people share that stage', () => {
    const twin: Task = { ...a, id: 'c', serial: 'T-3', assignee_id: 'u3', status: 'completed' };
    const out = collapseAssignmentGroups([a, twin], 'u3');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('c');
  });

  it('lists every assignee on a group and the assigner only on a single copy', () => {
    const grouped: Task = {
      ...a,
      assignment_group: {
        ...group,
        peers: [
          { id: 'a', serial: 'T-1', assignee_id: 'u1', assignee_name: 'Sibat Sajjad', status: 'completed' },
          { id: 'b', serial: 'T-2', assignee_id: 'u2', assignee_name: 'test', status: 'in_progress' },
        ],
      },
    };
    expect(assignmentPeopleNames(grouped)).toEqual(['Sibat Sajjad', 'test']);
    const solo: Task = {
      ...a,
      assignment_group: null,
      assignment_group_id: null,
      assignee_name: 'Sibat Sajjad',
      assigner_id: 'admin',
      assigner_name: 'AI Reamarc',
    };
    expect(assignedByLabel(solo)).toBe('AI Reamarc');
    expect(assignedByLabel({ ...solo, assigner_id: 'u1', assigner_name: 'Sibat Sajjad' })).toBeNull();
  });
});
