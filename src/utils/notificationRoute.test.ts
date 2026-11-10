import { describe, expect, it } from 'vitest';
import { viewForNotificationKind, viewFromNotificationPath } from './notificationRoute';

describe('notificationRoute tasks', () => {
  it('maps task_* kinds and /tasks path', () => {
    expect(viewForNotificationKind('task_assigned')).toBe('tasks');
    expect(viewForNotificationKind('task_overdue')).toBe('tasks');
    expect(viewForNotificationKind('task_mention')).toBe('tasks');
    expect(viewFromNotificationPath('/tasks')).toBe('tasks');
    expect(viewFromNotificationPath('/tasks/todo')).toBe('tasks');
  });
});
