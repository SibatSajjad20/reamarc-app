import { describe, expect, it } from 'vitest';
import { mergePolledTaskPage, overlayPendingStages } from './taskManagerViewCache';
import type { Task, TaskStatus } from '@/types/task';

const task = (id: string, status: TaskStatus): Task =>
  ({ id, serial: id, title: id, status, priority: 'medium' }) as Task;

describe('taskManagerViewCache polling merge', () => {
  it('keeps an in-flight stage move when a stale poll still has the old status', () => {
    const previous = [task('a', 'in_progress')];
    const polled = [task('a', 'todo')];
    const merged = mergePolledTaskPage(previous, polled);
    const pending = new Map<string, TaskStatus>([['a', 'in_progress']]);
    expect(overlayPendingStages(merged, pending)[0].status).toBe('in_progress');
  });
});
