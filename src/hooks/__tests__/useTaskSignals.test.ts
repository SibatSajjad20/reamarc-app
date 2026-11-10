import { act, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const get = vi.fn();
const getCounts = vi.fn();
const getChatUnread = vi.fn();
const getConversations = vi.fn();

vi.mock('@/services/apiClient', () => ({
  apiClient: { get: (...args: unknown[]) => get(...args), post: vi.fn() },
}));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, switchCompany: vi.fn() }) }));
vi.mock('@/utils/cacheBus', () => ({ emitInvalidation: vi.fn(), useCacheInvalidation: () => undefined }));
vi.mock('@/services/webPushService', () => ({
  enableWebPush: vi.fn(),
  notificationPermission: () => 'default',
  syncWebPushSubscription: vi.fn(),
}));
vi.mock('@/services/taskService', () => ({
  taskService: {
    getCounts: (...args: unknown[]) => getCounts(...args),
    getChatUnread: (...args: unknown[]) => getChatUnread(...args),
    getConversations: (...args: unknown[]) => getConversations(...args),
    markRead: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

const emptyCounts = {
  open: 1,
  todo: 1,
  in_progress: 0,
  in_review: 0,
  completed: 0,
  cancelled: 0,
  overdue: 0,
  today: 0,
  upcoming: 0,
  no_due: 0,
  blocked: 0,
};

describe('reamarc-task-activity from the bell', () => {
  let swHandler: ((e: MessageEvent) => void) | null = null;

  beforeEach(() => {
    get.mockReset();
    swHandler = null;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: (_type: string, fn: (e: MessageEvent) => void) => {
          swHandler = fn;
        },
        removeEventListener: () => {
          swHandler = null;
        },
      },
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('skips the first load, dispatches on a new task_* item, ignores other kinds, and fires on a task push', async () => {
    get.mockResolvedValueOnce([
      { id: 'n1', kind: 'task_assigned', created_at: '2026-01-01T00:00:00Z', data: { task_id: 't1' } },
    ]);
    get.mockResolvedValueOnce([
      { id: 'n2', kind: 'task_comment', created_at: '2026-01-01T00:01:00Z', data: { task_id: 't1' } },
    ]);
    get.mockResolvedValueOnce([
      { id: 'n3', kind: 'crm_won', created_at: '2026-01-01T00:02:00Z' },
      { id: 'n2', kind: 'task_comment', created_at: '2026-01-01T00:01:00Z', data: { task_id: 't1' } },
    ]);

    const seen: Array<{ kind?: string; task_id?: string }> = [];
    const onActivity = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('reamarc-task-activity', onActivity);

    const { NotificationBell } = await import('@/components/NotificationBell');
    render(React.createElement(NotificationBell, { onSelectView: () => undefined }));
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(seen).toEqual([]);

    await act(async () => {
      window.dispatchEvent(new Event('reamarc-notification-refresh'));
      await Promise.resolve();
    });
    await waitFor(() => expect(seen).toEqual([{ kind: 'task_comment', task_id: 't1' }]));

    await act(async () => {
      window.dispatchEvent(new Event('reamarc-notification-refresh'));
      await Promise.resolve();
    });
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(seen).toHaveLength(1);

    await act(async () => {
      swHandler?.({ data: { type: 'reamarc-push-received', kind: 'task_mention', task_id: 't9' } } as MessageEvent);
    });
    expect(seen.some((d) => d.kind === 'task_mention' && d.task_id === 't9')).toBe(true);

    await act(async () => {
      swHandler?.({ data: { type: 'reamarc-push-received', kind: 'crm_won' } } as MessageEvent);
    });
    expect(seen.filter((d) => d.kind === 'crm_won')).toHaveLength(0);

    await act(async () => {
      swHandler?.({
        data: { type: 'reamarc-push-received', kind: 'task_comment', path: '/tasks?task=tsk_1' },
      } as MessageEvent);
    });
    expect(seen.some((d) => d.kind === 'task_comment' && d.task_id === 'tsk_1')).toBe(true);

    await act(async () => {
      swHandler?.({ data: { type: 'reamarc-push-received', kind: 'task_comment' } } as MessageEvent);
    });
    expect(seen.some((d) => d.kind === 'task_comment' && !d.task_id)).toBe(true);

    window.removeEventListener('reamarc-task-activity', onActivity);
  });
});

describe('useTaskCounts / useTaskChat signals', () => {
  beforeEach(() => {
    getCounts.mockReset();
    getChatUnread.mockReset();
    getConversations.mockReset();
    getCounts.mockResolvedValue(emptyCounts);
    getChatUnread.mockResolvedValue({ total: 0, by_task: {} });
    getConversations.mockResolvedValue({ items: [], total: 0 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('does not poll counts below 5 minutes and fetches on events, mutations, and throttled focus', async () => {
    vi.useFakeTimers();
    const { useTaskCounts } = await import('@/hooks/useTaskCounts');
    const hook = renderHook(() => useTaskCounts());
    await act(async () => {
      await Promise.resolve();
    });
    expect(getCounts).toHaveBeenCalledTimes(1);
    getCounts.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    });
    expect(getCounts).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('reamarc-task-activity', { detail: { kind: 'task_comment', task_id: 't1' } }));
      await Promise.resolve();
    });
    expect(getCounts).toHaveBeenCalledTimes(1);
    getCounts.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('reamarc-tasks-changed'));
      await Promise.resolve();
    });
    expect(getCounts).toHaveBeenCalledTimes(1);
    getCounts.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(getCounts).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000);
    });
    expect(getCounts).toHaveBeenCalled();

    hook.unmount();
    vi.useRealTimers();
  });

  it('dedupes concurrent count refreshes into one in-flight request', async () => {
    let resolveCounts: (value: typeof emptyCounts) => void = () => undefined;
    getCounts.mockImplementation(() => new Promise((resolve) => {
      resolveCounts = resolve;
    }));
    const { useTaskCounts } = await import('@/hooks/useTaskCounts');
    renderHook(() => useTaskCounts());
    await act(async () => {
      window.dispatchEvent(new Event('reamarc-tasks-changed'));
      window.dispatchEvent(new CustomEvent('reamarc-task-activity', { detail: { kind: 'task_assigned' } }));
      await Promise.resolve();
    });
    expect(getCounts).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveCounts(emptyCounts);
      await Promise.resolve();
    });
  });

  it('fetches unread on mount and conversations only while the panel is open', async () => {
    const { useTaskChat } = await import('@/hooks/useTaskChat');
    const closed = renderHook(({ open }) => useTaskChat(true, open), { initialProps: { open: false } });
    await waitFor(() => expect(getChatUnread).toHaveBeenCalled());
    expect(getConversations).not.toHaveBeenCalled();

    closed.rerender({ open: true });
    await waitFor(() => expect(getConversations).toHaveBeenCalled());

    getConversations.mockClear();
    getChatUnread.mockClear();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('reamarc-task-activity', { detail: { kind: 'task_comment', task_id: 't1' } }));
      await Promise.resolve();
    });
    await waitFor(() => expect(getChatUnread).toHaveBeenCalled());
    expect(getConversations).toHaveBeenCalled();

    closed.rerender({ open: false });
    getConversations.mockClear();
    getChatUnread.mockClear();
    await act(async () => {
      window.dispatchEvent(new Event('reamarc-tasks-changed'));
      await Promise.resolve();
    });
    await waitFor(() => expect(getChatUnread).toHaveBeenCalled());
    expect(getConversations).not.toHaveBeenCalled();
    closed.unmount();
  });
});
