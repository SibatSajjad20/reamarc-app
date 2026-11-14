import { BoundedCache } from './cache';
import { registerCacheClearer } from './cacheBus';
import type { Task, TaskFilters, TaskListResponse, TaskStatus } from '../types/task';

export type TaskListCachePayload = Pick<TaskListResponse, 'items' | 'total' | 'page' | 'limit' | 'truncated' | 'stage_counts'>;

const listCache = new BoundedCache<TaskListCachePayload>(24);

export function taskListCacheKey(filters: TaskFilters): string {
  return JSON.stringify({
    scope: filters.scope || 'all',
    stage: filters.stage || 'all',
    q: (filters.q || '').trim().toLowerCase(),
    priority: filters.priority || 'all',
    assignee_id: filters.assignee_id || '',
    department: filters.department || '',
    due_from: filters.due_from || '',
    due_to: filters.due_to || '',
    blocked: Boolean(filters.blocked),
  });
}

export function mergePolledTaskPage(previous: Task[], polled: Task[]): Task[] {
  if (!previous.length || previous.length <= polled.length) return polled;
  const polledIds = new Set(polled.map((task) => task.id));
  return [...polled, ...previous.filter((task) => !polledIds.has(task.id))];
}

export function overlayPendingStages(tasks: Task[], pending: Map<string, TaskStatus>): Task[] {
  if (!pending.size) return tasks;
  return tasks.map((task) => {
    const status = pending.get(task.id);
    return status && status !== task.status ? { ...task, status } : task;
  });
}

export function appendUniqueTasks(previous: Task[], nextPage: Task[]): Task[] {
  const seen = new Set(previous.map((task) => task.id));
  const extra = nextPage.filter((task) => !seen.has(task.id));
  return extra.length ? [...previous, ...extra] : previous;
}

export const taskManagerViewCache = {
  getList(key: string) {
    return listCache.get(key);
  },
  setList(key: string, data: TaskListCachePayload) {
    listCache.set(key, data);
  },
  invalidateLists() {
    listCache.clear();
  },
  clearAll() {
    listCache.clear();
  },
};

registerCacheClearer(() => taskManagerViewCache.clearAll());
