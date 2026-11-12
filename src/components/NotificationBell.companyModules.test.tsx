import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { NotificationBell } from './NotificationBell';

const authState = vi.hoisted(() => ({
  user: { id: 'u1', company_modules: ['sales', 'active_clients'] } as Record<string, unknown>,
}));

const get = vi.hoisted(() => vi.fn());

vi.mock('@/services/apiClient', () => ({
  apiClient: { get: (...args: unknown[]) => get(...args), post: vi.fn() },
}));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: authState.user, switchCompany: vi.fn() }),
}));
vi.mock('@/utils/cacheBus', () => ({ emitInvalidation: vi.fn(), useCacheInvalidation: () => undefined }));
vi.mock('@/services/webPushService', () => ({
  enableWebPush: vi.fn(),
  notificationPermission: () => 'default',
  syncWebPushSubscription: vi.fn(),
}));

describe('NotificationBell fetch count and equal user rerender', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue([]);
    authState.user = { id: 'u1', company_modules: ['sales', 'active_clients'] };
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('fetches /mobile/notifications?limit=30 once and does NOT refetch on equal user rerender', async () => {
    const view = render(React.createElement(NotificationBell, { onSelectView: () => undefined }));
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledWith('/mobile/notifications?limit=30');
    });

    // Re-render with new equal user object
    authState.user = { id: 'u1', company_modules: ['sales', 'active_clients'] };
    view.rerender(React.createElement(NotificationBell, { onSelectView: () => undefined }));

    await act(async () => {
      await Promise.resolve();
    });

    // Must still be 1 (fails if bell deps depend on [user])
    expect(get).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('does not dispatch reamarc-task-activity on push message when tasks module is off', async () => {
    authState.user = { id: 'u1', company_modules: ['sales', 'active_clients'] };
    const taskSpy = vi.fn();
    window.addEventListener('reamarc-task-activity', taskSpy);

    let swMessageHandler: ((e: MessageEvent) => void) | null = null;
    const swMock = {
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'message') swMessageHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swMock,
    });

    const view = render(React.createElement(NotificationBell, { onSelectView: () => undefined }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    expect(swMessageHandler).toBeTruthy();
    act(() => {
      swMessageHandler?.({
        data: { type: 'reamarc-push-received', kind: 'task_assigned', task_id: 't1' },
      } as MessageEvent);
    });

    expect(taskSpy).not.toHaveBeenCalled();
    window.removeEventListener('reamarc-task-activity', taskSpy);
    view.unmount();
  });
});
