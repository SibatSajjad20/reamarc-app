import type { Task, TaskRecurrence } from '@/types/task';

function parseYmd(value?: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Same stepping as backend `next_occurrence` (daily / weekly / monthly, until). */
export function nextOccurrence(dueDate?: string | null, recurrence?: TaskRecurrence | null): string | null {
  if (!dueDate || !recurrence) return null;
  const current = parseYmd(dueDate);
  if (!current) return null;
  const interval = Math.max(1, Number(recurrence.interval || 1));
  const freq = recurrence.freq || 'weekly';
  let next: Date;
  if (freq === 'daily') {
    next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + interval);
  } else if (freq === 'monthly') {
    const monthIndex = current.getMonth() + interval;
    const year = current.getFullYear() + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;
    const day = Math.min(current.getDate(), 28);
    next = new Date(year, month, day);
  } else {
    next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + interval * 7);
  }
  const until = parseYmd(recurrence.until);
  if (until && next.getTime() > until.getTime()) return null;
  return toYmd(next);
}

export function isRecurrenceTemplate(task: Pick<Task, 'recurrence' | 'recurrence_source_id' | 'status'>): boolean {
  return Boolean(task.recurrence) && !task.recurrence_source_id && task.status !== 'cancelled';
}

/** Dates in [rangeStart, rangeEnd] for a series, excluding dates that already have a real card. */
export function projectedRecurrenceDates(
  task: Task,
  rangeStart: string,
  rangeEnd: string,
  occupiedDates: Set<string>,
): string[] {
  if (!isRecurrenceTemplate(task) || !task.due_date || !task.recurrence) return [];
  const start = parseYmd(rangeStart);
  const end = parseYmd(rangeEnd);
  if (!start || !end) return [];

  const out: string[] = [];
  let cursor = task.due_date;
  let guard = 0;
  while (cursor && guard < 800) {
    guard += 1;
    const next = nextOccurrence(cursor, task.recurrence);
    if (!next) break;
    if (next > rangeEnd) break;
    if (next >= rangeStart && !occupiedDates.has(next) && next !== task.due_date) {
      out.push(next);
    }
    cursor = next;
  }
  return out;
}

export function seriesOccupiedDates(tasks: Task[], templateId: string): Set<string> {
  const dates = new Set<string>();
  for (const task of tasks) {
    const due = task.due_date?.includes('T') ? task.due_date.split('T')[0] : task.due_date;
    if (!due) continue;
    if (task.id === templateId || task.recurrence_source_id === templateId) dates.add(due);
  }
  return dates;
}
