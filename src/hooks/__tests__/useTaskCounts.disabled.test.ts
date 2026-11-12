import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const getCounts = vi.fn();

vi.mock('@/services/taskService', () => ({
  taskService: {
    getCounts: (...args: unknown[]) => getCounts(...args),
  },
}));

describe('useTaskCounts disabled', () => {
  beforeEach(() => {
    getCounts.mockResolvedValue({ open: 1 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('makes zero getCounts calls and ignores events when disabled', async () => {
    const mod = await import('@/hooks/useTaskCounts');
    mod.setTaskCountsEnabled(false);
    const n = getCounts.mock.calls.length;
    renderHook(() => mod.useTaskCounts());
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('reamarc-tasks-changed'));
    window.dispatchEvent(new Event('reamarc-task-activity'));
    await new Promise((r) => setTimeout(r, 20));
    expect(getCounts.mock.calls.length).toBe(n);
    const hooked = renderHook(() => mod.useTaskCounts());
    await hooked.result.current.refresh();
    expect(getCounts.mock.calls.length).toBe(n);
    mod.setTaskCountsEnabled(true);
  });
});
