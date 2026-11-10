import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getCounts = vi.fn();

vi.mock('@/services/taskService', () => ({
  taskService: {
    getCounts: (...args: unknown[]) => getCounts(...args),
  },
}));

describe('useTaskCounts poller', () => {
  beforeEach(() => {
    getCounts.mockResolvedValue({ open: 3, todo: 1, in_progress: 1, in_review: 1, completed: 0, cancelled: 0, overdue: 0, today: 0, upcoming: 0, no_due: 0, blocked: 0 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('shares one poller and pauses when hidden', async () => {
    const { useTaskCounts } = await import('@/hooks/useTaskCounts');
    const a = renderHook(() => useTaskCounts());
    const b = renderHook(() => useTaskCounts());
    await waitFor(() => expect(a.result.current.canSeeTasks).toBe(true));
    expect(b.result.current.canSeeTasks).toBe(true);
    const n = getCounts.mock.calls.length;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    window.dispatchEvent(new Event('reamarc-tasks-changed'));
    await new Promise((r) => setTimeout(r, 20));
    expect(getCounts.mock.calls.length).toBe(n);
    a.unmount();
    b.unmount();
  });
});
