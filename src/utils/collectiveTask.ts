import type { TaskAssignableUser } from '@/types/task';

export const MAX_COLLECTIVE_SUBTASKS = 15;

export interface CollectiveSubtaskRow {
  key: string;
  title: string;
  assignee_id: string;
}

export function newCollectiveRow(seed?: Partial<CollectiveSubtaskRow>): CollectiveSubtaskRow {
  return {
    key: `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: seed?.title || '',
    assignee_id: seed?.assignee_id || '',
  };
}

export function isLeadOwnerCandidate(u: Pick<TaskAssignableUser, 'role'>): boolean {
  const role = String(u.role || '').trim().toLowerCase();
  return role === 'team_lead' || role === 'lead' || role === 'admin' || role === 'super_admin';
}

/** First problem with the sub-task rows, or null when they can be sent. */
export function collectiveRowsError(rows: CollectiveSubtaskRow[]): string | null {
  if (!rows.length) return 'Add at least one sub-task';
  if (rows.length > MAX_COLLECTIVE_SUBTASKS) return `At most ${MAX_COLLECTIVE_SUBTASKS} sub-tasks`;
  for (const [i, r] of rows.entries()) {
    const title = r.title.trim();
    if (!title) return `Sub-task ${i + 1} needs a title`;
    if (title.length > 200) return `Sub-task ${i + 1} title must be 1–200 characters`;
    if (!r.assignee_id) return `Sub-task ${i + 1} needs an assignee`;
  }
  return null;
}
