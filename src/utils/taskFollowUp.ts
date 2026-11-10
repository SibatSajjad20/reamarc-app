import type { Task, TaskFollowUpBucket } from '../types/task';

const OPEN = new Set(['todo', 'in_progress', 'in_review']);

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function taskDueDate(task: { due_date?: string | null; due_time?: string | null }): Date | null {
  const day = String(task.due_date || '').trim();
  if (!day) return null;
  const time = String(task.due_time || '').trim();
  const iso = time ? `${day}T${time.length === 5 ? `${time}:00` : time}` : `${day}T23:59:59`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function taskFollowUpBucket(task: Task, now = Date.now()): TaskFollowUpBucket | null {
  if (!OPEN.has(String(task.status || ''))) return null;
  const due = taskDueDate(task);
  if (!due) return 'no_due';
  const t = due.getTime();
  if (t < now) return 'overdue';
  if (t <= endOfLocalDay(new Date(now)).getTime()) return 'today';
  return 'upcoming';
}

export function isDueToday(task: Task, now = Date.now()): boolean {
  return taskFollowUpBucket(task, now) === 'today';
}

export function isOverdue(task: Task, now = Date.now()): boolean {
  return taskFollowUpBucket(task, now) === 'overdue';
}
