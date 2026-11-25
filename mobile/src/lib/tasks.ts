import { api } from './api';
import { invalidateModuleCache } from './moduleCache';
import {
  asCommentList,
  normalizeClients,
  normalizePeople,
  normalizeTask,
  remainingTaskPages,
  toApiTaskStatus,
  type Task,
  type TaskClientOption,
  type TaskComment,
  type TaskListResponse,
  type TaskPerson,
  type TaskStatus,
  type TaskWritePayload,
} from './taskForm';

export * from './taskForm';

function bustTaskCaches() {
  invalidateModuleCache('tasks');
  invalidateModuleCache('home-tasks');
}

export async function listTasks(params?: {
  scope?: string;
  stage?: string;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<TaskListResponse> {
  const q = new URLSearchParams();
  Object.entries({
    scope: params?.scope,
    stage: params?.status || params?.stage,
    q: params?.q,
    page: params?.page,
    limit: params?.limit,
  }).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    q.set(key, String(value));
  });
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const res = await api<TaskListResponse>(`/tasks${suffix}`);
  return {
    ...res,
    items: (res.items || []).map(normalizeTask).filter((t) => t.id),
  };
}

export async function listAllTasks(params?: {
  scope?: string;
  stage?: string;
  status?: string;
  q?: string;
  assignee_id?: string;
}): Promise<TaskListResponse> {
  // Server caps a page at 500. Page 1 gives the total; the rest load together.
  const pageSize = 500;
  const cap = 2000;
  const scope = params?.assignee_id ? 'mine' : params?.scope;
  const query = { scope, stage: params?.status || params?.stage, q: params?.q, limit: pageSize };
  const first = await listTasks({ ...query, page: 1 });
  const total = Number(first.total || 0);
  const firstItems = first.items || [];
  const rest = await Promise.all(
    remainingTaskPages(total, firstItems.length, pageSize, cap).map((page) => listTasks({ ...query, page })),
  );
  let items: Task[] = firstItems;
  for (const res of rest) items = items.concat(res.items || []);
  const last = rest.length ? rest[rest.length - 1] : first;
  return { items: items.slice(0, cap), total: rest.length ? Number(last.total || 0) : total, page: 1, limit: items.length, stage_counts: last.stage_counts };
}

export async function getTask(id: string): Promise<Task> {
  const row = await api<any>(`/tasks/${encodeURIComponent(id)}`);
  return normalizeTask(row);
}

async function firstPeople(urls: string[]): Promise<TaskPerson[]> {
  for (const url of urls) {
    try {
      const people = normalizePeople(await api<unknown>(url));
      if (people.length) return people;
    } catch {
      /* try the next known directory endpoint */
    }
  }
  return [];
}

async function firstClients(urls: string[]): Promise<TaskClientOption[]> {
  for (const url of urls) {
    try {
      const clients = normalizeClients(await api<unknown>(url));
      if (clients.length) return clients;
    } catch {
      /* try the next known workspace endpoint */
    }
  }
  return [];
}

export function listTaskAssignees(): Promise<TaskPerson[]> {
  return firstPeople(['/tasks/assignable-users', '/users', '/crm/assignees', '/admin/users']);
}

export function listTaskClients(): Promise<TaskClientOption[]> {
  return firstClients(['/workspaces', '/tasks/options/clients']);
}

export async function createTask(payload: TaskWritePayload): Promise<Task> {
  const row = await api<any>('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  bustTaskCaches();
  return normalizeTask(row);
}

/** Main task (assigned to a team lead) plus its sub-tasks in one request. */
export async function createCollectiveTask(payload: {
  main: TaskWritePayload;
  subtasks: { title: string; assignee_id: string }[];
}): Promise<Task> {
  const row = await api<any>('/tasks/collective', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  bustTaskCaches();
  return normalizeTask(row);
}

export async function updateTask(taskId: string, payload: Partial<TaskWritePayload>): Promise<Task> {
  const row = await api<any>(`/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  bustTaskCaches();
  return normalizeTask(row);
}

export async function deleteTask(taskId: string): Promise<void> {
  await api(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  bustTaskCaches();
}

export async function addTaskComment(taskId: string, text: string): Promise<TaskComment[]> {
  const rows = await api<unknown>(`/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  bustTaskCaches();
  return asCommentList(rows);
}

export function changeTaskStage(id: string, to: TaskStatus): Promise<Task> {
  return api<Task>(`/tasks/${encodeURIComponent(id)}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ to: toApiTaskStatus(to) }),
  }).then((row) => {
    bustTaskCaches();
    return normalizeTask(row);
  });
}
