import type { Task, TaskAssignmentPeer, TaskStatus } from '../types/task';

const RANK: Record<string, number> = { todo: 0, in_progress: 1, in_review: 2, completed: 3, cancelled: 4 };

export function rollupAssignmentStatus(statuses: TaskStatus[]): TaskStatus {
  const open = statuses.filter((s) => s !== 'cancelled');
  if (!open.length) return 'cancelled';
  if (open.every((s) => s === 'completed')) return 'completed';
  const incomplete = open.filter((s) => s !== 'completed');
  return incomplete.slice().sort((a, b) => (RANK[a] ?? 0) - (RANK[b] ?? 0))[0] || 'todo';
}

export function assignmentPeers(task?: Task | null): TaskAssignmentPeer[] {
  return task?.assignment_group?.peers || [];
}

export function isGroupedAssignment(task?: Task | null): boolean {
  return assignmentPeers(task).length > 1;
}

export function peersAtStatus(task?: Task | null, status?: TaskStatus): number {
  if (!task) return 0;
  const stage = status || task.status;
  return assignmentPeers(task).filter((p) => p.status === stage).length;
}

/** True when this row stands in for more than one person at the same stage. */
export function isSharedStageCard(task?: Task | null): boolean {
  return isGroupedAssignment(task) && peersAtStatus(task) > 1;
}

export function boardStatusForTask(task: Task): TaskStatus {
  return task.status;
}

export function assignmentPeopleNames(task: Task): string[] {
  const names = assignmentPeers(task)
    .map((p) => (p.assignee_name || '').trim())
    .filter(Boolean);
  if (names.length > 1) return Array.from(new Set(names));
  const single = (task.assignee_name || '').trim();
  return single ? [single] : [];
}

export function assignedByLabel(task: Task): string | null {
  if (isGroupedAssignment(task)) return null;
  const assigner = (task.assigner_name || '').trim();
  if (!assigner) return null;
  if (task.assigner_id && task.assignee_id && task.assigner_id === task.assignee_id) return null;
  if (assigner === (task.assignee_name || '').trim()) return null;
  return assigner;
}

/**
 * Same-stage copies share one card. Different stages stay separate so a lead can
 * approve a teammate without waiting on their own copy.
 */
export function collapseAssignmentGroups(tasks: Task[], viewerId?: string): Task[] {
  const out: Task[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    const gid = task.assignment_group?.id || task.assignment_group_id || '';
    const peers = assignmentPeers(task);
    if (!gid || peers.length < 2) {
      out.push(task);
      continue;
    }
    const key = `${gid}:${task.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const inThisStatus = tasks.filter(
      (t) => (t.assignment_group?.id || t.assignment_group_id) === gid && t.status === task.status,
    );
    const mine = viewerId ? inThisStatus.find((t) => t.assignee_id === viewerId) : undefined;
    const pick = mine || inThisStatus[0] || task;
    out.push({
      ...pick,
      assignment_group: task.assignment_group || pick.assignment_group,
    });
  }
  return out;
}
