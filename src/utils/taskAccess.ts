import type { Task, TaskActor, TaskStatus } from '../types/task';

const OPEN: TaskStatus[] = ['todo', 'in_progress', 'in_review'];

function uid(user?: TaskActor | null): string {
  return String(user?.id || '').trim();
}

function roleOf(user?: TaskActor | null): string {
  const raw = String(user?.role || '').toLowerCase().replace(/[-\s]/g, '_');
  if (raw === 'lead') return 'team_lead';
  if (raw === 'member') return 'team_member';
  if (raw === 'super_admin') return 'admin';
  return raw || 'team_member';
}

export function isAdmin(user?: TaskActor | null): boolean {
  return roleOf(user) === 'admin';
}

function deptSet(user?: TaskActor | null): Set<string> {
  const out = new Set<string>();
  const push = (v?: string) => {
    const n = String(v || '').trim();
    if (n) out.add(n);
  };
  push(user?.primary_department);
  push(user?.department);
  (user?.departments || []).forEach(push);
  return out;
}

function involved(user: TaskActor | null | undefined, task: Task): boolean {
  const id = uid(user);
  if (!id) return false;
  if ((task.involved_ids || []).includes(id)) return true;
  return [task.creator_id, task.assignee_id, task.assigner_id, ...(task.watcher_ids || [])].includes(id);
}

export function canViewTask(user: TaskActor | null | undefined, task: Task): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user);
  if (role === 'client' || role === 'hr' || role === 'operations') return false;
  if (isAdmin(user)) return true;
  if (involved(user, task)) return true;
  if (role === 'team_lead' && task.department && deptSet(user).has(task.department)) return true;
  return false;
}

export function canEditTask(user: TaskActor | null | undefined, task: Task): boolean {
  if (!canViewTask(user, task)) return false;
  if (isAdmin(user)) return true;
  return uid(user) === task.assigner_id;
}

export function canEditChecklist(user: TaskActor | null | undefined, task: Task): boolean {
  if (!canViewTask(user, task)) return false;
  if (isAdmin(user)) return true;
  const id = uid(user);
  return id === task.creator_id || id === task.assigner_id || id === task.assignee_id;
}

export function isSelfAssigned(task: Task): boolean {
  return Boolean(task.assignee_id) && task.assignee_id === task.assigner_id;
}

function chainFromIds(task: Task): string[] {
  return (task.assignment_chain || []).map((h) => String(h.from_id || '')).filter(Boolean);
}

function assignerIsAdmin(task: Task): boolean {
  return roleOf({ role: task.assigner_role ?? undefined }) === 'admin';
}

function assigneeIsMember(task: Task): boolean {
  return roleOf({ role: task.assignee_role ?? undefined }) === 'team_member';
}

export function isApprover(user: TaskActor | null | undefined, task: Task): boolean {
  if (!user || !task) return false;
  const id = uid(user);
  if (!id) return false;
  if (assignerIsAdmin(task) && roleOf(user) === 'team_lead' && id === task.assignee_id) return true;
  if (id === task.assignee_id) return false;
  if (assignerIsAdmin(task) && assigneeIsMember(task)) {
    return roleOf(user) === 'team_lead' && Boolean(task.department && deptSet(user).has(task.department));
  }
  if (isAdmin(user)) return true;
  if (chainFromIds(task).includes(id)) return true;
  if (roleOf(user) === 'team_lead' && task.department && deptSet(user).has(task.department)) return true;
  return false;
}

export function canReassign(user: TaskActor | null | undefined, task: Task): boolean {
  if (!user || !task) return false;
  if (!OPEN.includes(task.status)) return false;
  if (isAdmin(user)) return true;
  const id = uid(user);
  return id === task.assignee_id || id === task.assigner_id;
}

export function canAddWatcher(user: TaskActor | null | undefined, task: Task): boolean {
  if (!canViewTask(user, task)) return false;
  if (isAdmin(user)) return true;
  const id = uid(user);
  return id === task.creator_id || id === task.assigner_id;
}

export function canTransitionTo(
  user: TaskActor | null | undefined,
  task: Task,
  to: TaskStatus,
  reason?: string,
): boolean {
  if (!user || !task) return false;
  const dest = to;
  const current = task.status;
  if (dest === current) return true;
  if (current === 'cancelled') return false;
  const admin = isAdmin(user);
  const id = uid(user);
  const creator = id === task.creator_id;
  const assigner = id === task.assigner_id;
  const assignee = id === task.assignee_id;
  if (dest === 'cancelled') return admin || creator || assigner;
  if (current === 'completed') return dest === 'in_progress' && (admin || creator || assigner);
  if (dest === 'todo') return admin || assigner;
  if (dest === 'in_progress') {
    if (current === 'in_review') return isApprover(user, task) && Boolean((reason || '').trim());
    return admin || assigner || assignee;
  }
  if (dest === 'in_review') {
    if (!OPEN.includes(current) && current !== 'todo') return false;
    if (admin || assigner) return true;
    return Boolean(assignee && !isSelfAssigned(task));
  }
  if (dest === 'completed') {
    if (assignee && !isApprover(user, task)) return false;
    if (!isApprover(user, task)) return false;
    return current === 'in_review' || admin;
  }
  return false;
}

export function allowedTransitions(user: TaskActor | null | undefined, task: Task): TaskStatus[] {
  const all: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'completed', 'cancelled'];
  return all.filter((dest) => canTransitionTo(user, task, dest, dest === 'in_progress' ? 'x' : undefined));
}

const LIST_ADVANCE: Partial<Record<TaskStatus, TaskStatus>> = {
  todo: 'in_progress',
  in_progress: 'in_review',
  in_review: 'completed',
};

/** One-shot List-row advance: next stage only, never reverse. */
export function listRowAdvanceTo(user: TaskActor | null | undefined, task: Task): TaskStatus | null {
  if (!user || !task) return null;
  const next = LIST_ADVANCE[task.status];
  if (!next) return null;
  if ((task.status === 'todo' || task.status === 'in_progress') && uid(user) !== task.assignee_id) {
    return null;
  }
  return canTransitionTo(user, task, next) ? next : null;
}

export function listRowAdvanceAction(to: TaskStatus): 'start' | 'submit' | 'approve' | null {
  if (to === 'in_progress') return 'start';
  if (to === 'in_review') return 'submit';
  if (to === 'completed') return 'approve';
  return null;
}

export function listQuickActions(
  user: TaskActor | null | undefined,
  task: Task,
): { action: string; label: string; danger?: boolean }[] {
  const items: { action: string; label: string; danger?: boolean }[] = [{ action: 'open', label: 'Open' }];
  if (task.status === 'todo' && canTransitionTo(user, task, 'in_progress')) {
    items.push({ action: 'start', label: 'Start' });
  }
  if (task.status === 'in_progress' && canTransitionTo(user, task, 'in_review')) {
    items.push({ action: 'submit', label: 'Submit for review' });
  }
  if (task.status === 'in_review' && canTransitionTo(user, task, 'completed')) {
    items.push({ action: 'approve', label: 'Approve' });
  }
  if (canReassign(user, task)) items.push({ action: 'reassign', label: 'Reassign' });
  if (task.status !== 'completed' && task.status !== 'cancelled') {
    items.push({ action: 'block', label: task.blocked ? 'Unblock' : 'Mark blocked' });
    items.push({ action: 'cancel', label: 'Cancel', danger: true });
  }
  return items;
}

export function canAssignTo(
  actor: TaskActor | null | undefined,
  target: TaskActor,
): boolean {
  if (!actor || !target) return false;
  const aRole = roleOf(actor);
  const tRole = roleOf(target);
  if (aRole === 'client' || tRole === 'client') return false;
  if (tRole === 'hr' || tRole === 'operations') return false;
  const targetDept = String(target.primary_department || target.department || '').toLowerCase();
  if (targetDept === 'hr' || targetDept === 'human resources') return false;
  if (isAdmin(actor)) return true;
  if (uid(actor) === uid(target)) return true;
  const shared = [...deptSet(actor)].some((d) => deptSet(target).has(d));
  if (aRole === 'team_lead') {
    if (shared) return tRole === 'team_member' || tRole === 'team_lead';
    return tRole === 'team_lead';
  }
  if (aRole === 'team_member') {
    return shared && (tRole === 'team_member' || tRole === 'team_lead');
  }
  return false;
}

export function isViewOnly(user: TaskActor | null | undefined, task: Task): boolean {
  if (!canViewTask(user, task)) return true;
  if (isAdmin(user) || involved(user, task)) return false;
  return roleOf(user) === 'team_lead' && Boolean(task.department && deptSet(user).has(task.department));
}

export function changedFields<T extends Record<string, unknown>>(
  original: Partial<T>,
  next: Partial<T>,
): Partial<T> {
  const out: Record<string, unknown> = {};
  const o = original as Record<string, unknown>;
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined) continue;
    if (JSON.stringify(v) !== JSON.stringify(o[k])) out[k] = v;
  }
  return out as Partial<T>;
}
