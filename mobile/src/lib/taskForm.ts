export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export const TASK_STAGES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'In Review' },
  { value: 'completed', label: 'Completed' },
];

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export type TaskComment = {
  id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: string;
};

export type Task = {
  id: string;
  serial?: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  creator_id?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assignee_role?: string | null;
  assigner_id?: string | null;
  assigner_name?: string | null;
  assigner_role?: string | null;
  department?: string | null;
  involved_ids?: string[] | null;
  start_date?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  estimate_hours?: number | null;
  client_id?: string | null;
  client_name?: string | null;
  creator_name?: string;
  comments?: TaskComment[];
  comments_count?: number;
  view_only?: boolean;
};

export type TaskActorLike = {
  id?: string | null;
  role?: string | null;
  department?: string | null;
  primary_department?: string | null;
  departments?: string[] | null;
};

export type TaskListResponse = {
  items: Task[];
  total: number;
  page: number;
  limit: number;
  stage_counts?: Partial<Record<TaskStatus, number>>;
};

export type TaskPerson = {
  id: string;
  name: string;
  full_name?: string;
  department?: string;
  role?: string;
};

export type TaskClientOption = {
  id: string;
  name: string;
};

function asList(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as { items?: unknown; results?: unknown; data?: unknown };
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.results)) return obj.results;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
}

export function normalizePeople(raw: unknown): TaskPerson[] {
  const seen = new Set<string>();
  const out: TaskPerson[] = [];
  for (const row of asList(raw)) {
    const id = String(row?.id || row?.user_id || row?._id || '').trim();
    const role = String(row?.role || '').toLowerCase();
    if (!id || seen.has(id) || role === 'client') continue;
    if (row?.is_active === false) continue;
    seen.add(id);
    const name = String(row?.full_name || row?.name || row?.email || 'User');
    out.push({
      id,
      name,
      full_name: name,
      department: row?.department || row?.primary_department || '',
      role: row?.role || 'team_member',
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

export function normalizeClients(raw: unknown): TaskClientOption[] {
  const seen = new Set<string>();
  const out: TaskClientOption[] = [];
  for (const row of asList(raw)) {
    const id = String(row?.id || row?._id || '').trim();
    const name = String(row?.name || '').trim();
    const status = String(row?.status || 'active').toLowerCase();
    if (!id || !name || seen.has(id) || status === 'inactive') continue;
    seen.add(id);
    out.push({ id, name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

export type TaskWritePayload = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  estimate_hours?: number | null;
  client_id?: string | null;
};

export function stageLabel(status?: string): string {
  return TASK_STAGES.find((s) => s.value === status)?.label || String(status || '—');
}

function normalizeStatus(raw: string | undefined): TaskStatus {
  const value = String(raw || 'todo').toLowerCase();
  if (value === 'in_review') return 'review';
  if (value === 'todo' || value === 'in_progress' || value === 'review' || value === 'completed') {
    return value;
  }
  return 'todo';
}

export function asCommentList(raw: unknown): TaskComment[] {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.comments)) return asCommentList(obj.comments);
    if (typeof obj.text === 'string' && !obj.items) return asCommentList([obj]);
  }
  return asList(raw)
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      id: String(row.id || row._id || `tc_${Math.random().toString(36).slice(2, 10)}`),
      user_id: String(row.user_id || ''),
      user_name: String(row.user_name || row.full_name || 'User'),
      text: String(row.text || row.body || ''),
      created_at: String(row.created_at || ''),
    }));
}

export function validateWorkTaskForm(input: { title?: string; estimate?: string }): {
  title?: string;
  estimate?: string;
} {
  const errors: { title?: string; estimate?: string } = {};
  if (!String(input.title || '').trim()) {
    errors.title = 'Task title cannot be empty';
  }
  const estimate = String(input.estimate || '').trim();
  if (estimate) {
    const hours = Number(estimate);
    if (!Number.isFinite(hours) || hours < 0) {
      errors.estimate = 'Estimated hours must be a positive number.';
    }
  }
  return errors;
}

export function normalizeTask(row: any): Task {
  const comments = asCommentList(row?.comments);
  return {
    ...row,
    id: String(row?.id || row?._id || ''),
    title: String(row?.title || row?.name || 'Untitled'),
    status: normalizeStatus(row?.status),
    priority: (row?.priority || 'medium') as TaskPriority,
    comments,
    comments_count: Number(row?.comments_count ?? comments.length),
  };
}

export function nextStage(status: TaskStatus): TaskStatus | null {
  const order: TaskStatus[] = ['todo', 'in_progress', 'review', 'completed'];
  const idx = order.indexOf(status);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1];
}

function uidOf(user?: TaskActorLike | null): string {
  return String(user?.id || '').trim();
}

function roleOf(role?: string | null): string {
  const raw = String(role || '')
    .toLowerCase()
    .replace(/[-\s]/g, '_');
  if (raw === 'lead') return 'team_lead';
  if (raw === 'member') return 'team_member';
  if (raw === 'super_admin') return 'admin';
  return raw || 'team_member';
}

function deptSet(user?: TaskActorLike | null): Set<string> {
  const out = new Set<string>();
  const push = (v?: string | null) => {
    const n = String(v || '').trim();
    if (n) out.add(n);
  };
  push(user?.primary_department);
  push(user?.department);
  (user?.departments || []).forEach(push);
  return out;
}

function isSelfAssigned(task: Task): boolean {
  return Boolean(task.assignee_id) && task.assignee_id === task.assigner_id;
}

export function isTaskApprover(user: TaskActorLike | null | undefined, task: Task): boolean {
  if (!user || !task) return false;
  const id = uidOf(user);
  if (!id) return false;
  const role = roleOf(user.role);
  if (role === 'team_lead' && id === task.assignee_id && (isSelfAssigned(task) || roleOf(task.assigner_role) === 'admin')) {
    return true;
  }
  if (id === task.assignee_id) return false;
  if (roleOf(task.assignee_role) === 'team_lead' && !isSelfAssigned(task) && roleOf(task.assigner_role) !== 'admin') {
    return id === task.assigner_id || role === 'admin';
  }
  if (role === 'admin') return true;
  if (role === 'team_lead' && Boolean(task.department && deptSet(user).has(task.department))) return true;
  return false;
}

export function canAdvanceTo(
  user: TaskActorLike | null | undefined,
  task: Task,
  to: TaskStatus,
): boolean {
  if (!user || !task) return false;
  const dest = to;
  const current = task.status;
  if (dest === current) return true;
  const role = roleOf(user.role);
  const admin = role === 'admin';
  const id = uidOf(user);
  const assigner = id === task.assigner_id;
  const assignee = id === task.assignee_id;
  const creator = id === task.creator_id;
  if (current === 'completed') {
    return dest === 'in_progress' && (admin || assigner || creator);
  }
  if (dest === 'in_progress') {
    return admin || assigner || assignee;
  }
  if (dest === 'review') {
    if (admin || assigner) return true;
    return Boolean(assignee && !isSelfAssigned(task));
  }
  if (dest === 'completed') {
    if (assignee && !isTaskApprover(user, task)) return false;
    return isTaskApprover(user, task);
  }
  return false;
}

/** One-step advance the current user is allowed to take. Matches web Task Manager. */
export function nextAllowedStage(
  user: TaskActorLike | null | undefined,
  task: Task,
): TaskStatus | null {
  if (!user || !task || task.view_only) return null;
  const next = nextStage(task.status);
  if (!next) return null;
  if ((task.status === 'todo' || task.status === 'in_progress') && uidOf(user) !== task.assignee_id) {
    return null;
  }
  return canAdvanceTo(user, task, next) ? next : null;
}

export function toApiTaskStatus(status: TaskStatus): string {
  return status === 'review' ? 'in_review' : status;
}

export function allowedTaskStages(
  user: TaskActorLike | null | undefined,
  task: Task,
): { value: TaskStatus; label: string }[] {
  return TASK_STAGES.filter((s) => s.value === task.status || canAdvanceTo(user, task, s.value));
}

export type HomeTaskCounts = {
  todo: number;
  progress: number;
  review: number;
  done: number;
};

export function countHomeTasks(items: Task[]): HomeTaskCounts {
  const next: HomeTaskCounts = { todo: 0, progress: 0, review: 0, done: 0 };
  for (const task of items) {
    const status = normalizeStatus(task.status);
    if (status === 'todo') next.todo += 1;
    else if (status === 'in_progress') next.progress += 1;
    else if (status === 'review') next.review += 1;
    else if (status === 'completed') next.done += 1;
  }
  return next;
}

export function filterTaskList(
  items: Task[],
  opts: { filter: string; search?: string; userId?: string | null },
): Task[] {
  const q = (opts.search || '').trim().toLowerCase();
  return items.filter((task) => {
    if (opts.filter === 'mine' && opts.userId && task.assignee_id !== opts.userId) return false;
    if (opts.filter && opts.filter !== 'all' && opts.filter !== 'mine') {
      if (normalizeStatus(task.status) !== opts.filter) return false;
    }
    if (!q) return true;
    return (
      (task.title || '').toLowerCase().includes(q) ||
      (task.serial || '').toLowerCase().includes(q) ||
      (task.assignee_name || '').toLowerCase().includes(q) ||
      (task.client_name || '').toLowerCase().includes(q)
    );
  });
}
