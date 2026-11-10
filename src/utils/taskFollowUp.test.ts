import { describe, expect, it } from 'vitest';
import { isDueToday, isOverdue, taskFollowUpBucket } from './taskFollowUp';
import type { Task } from '@/types/task';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't',
  serial: 'T-0001',
  title: 'x',
  status: 'todo',
  priority: 'medium',
  ...over,
});

describe('taskFollowUp', () => {
  it('buckets overdue / today / upcoming / no due', () => {
    const now = new Date(2026, 10, 10, 15, 0, 0).getTime();
    expect(taskFollowUpBucket(task({ due_date: '2026-11-09' }), now)).toBe('overdue');
    expect(taskFollowUpBucket(task({ due_date: '2026-11-10' }), now)).toBe('today');
    expect(taskFollowUpBucket(task({ due_date: '2026-11-12' }), now)).toBe('upcoming');
    expect(taskFollowUpBucket(task({}), now)).toBe('no_due');
    expect(taskFollowUpBucket(task({ status: 'completed', due_date: '2026-11-09' }), now)).toBeNull();
    expect(isOverdue(task({ due_date: '2026-11-09' }), now)).toBe(true);
    expect(isDueToday(task({ due_date: '2026-11-10' }), now)).toBe(true);
  });

  it('treats due_time before now as overdue even on today', () => {
    const now = new Date(2026, 10, 10, 15, 0, 0).getTime();
    expect(taskFollowUpBucket(task({ due_date: '2026-11-10', due_time: '09:00' }), now)).toBe('overdue');
    expect(taskFollowUpBucket(task({ due_date: '2026-11-10', due_time: '18:00' }), now)).toBe('today');
  });
});
