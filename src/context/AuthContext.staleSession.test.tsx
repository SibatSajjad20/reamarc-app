import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { resetStaleClientStorage, STORAGE_VERSION } from '../utils/storageReset';

vi.mock('../services/webPushService', () => ({
  disableWebPush: vi.fn(async () => undefined),
  syncWebPushSubscription: vi.fn(async () => undefined),
}));

function Probe() {
  const { isLoading, user } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user ? user.id : 'null'}</span>
    </div>
  );
}

function json401() {
  return new Response(JSON.stringify({ detail: 'Not authenticated' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

function hung(signal?: AbortSignal | null) {
  return new Promise<Response>((_, reject) => {
    const fail = () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    };
    if (!signal) return;
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener('abort', fail, { once: true });
  });
}

describe('stale session bootstrap', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stops loading when /auth/me 401s and /auth/refresh never resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/auth/refresh')) {
          return hung(init?.signal);
        }
        if (url.includes('/auth/me')) {
          return Promise.resolve(json401());
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );

    vi.useFakeTimers();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('clears a seeded workspace id after me+refresh 401', async () => {
    localStorage.setItem('reamarc_active_workspace_id', 'ws-stale');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/auth/me') || url.includes('/auth/refresh')) {
          return Promise.resolve(json401());
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(localStorage.getItem('reamarc_active_workspace_id')).toBeNull();
  });

  it('resets stale reamarc keys once and keeps the theme', () => {
    localStorage.setItem('reamarc_active_workspace_id', 'ws-old');
    localStorage.setItem('reamarc_token', 'legacy');
    localStorage.setItem('sidebar_collapsed', 'true');
    localStorage.setItem('reamarc-theme', 'dark');
    sessionStorage.setItem('reamarc_impersonation_token', 'imp');

    resetStaleClientStorage();

    expect(localStorage.getItem('reamarc_active_workspace_id')).toBeNull();
    expect(localStorage.getItem('reamarc_token')).toBeNull();
    expect(localStorage.getItem('sidebar_collapsed')).toBeNull();
    expect(sessionStorage.getItem('reamarc_impersonation_token')).toBeNull();
    expect(localStorage.getItem('reamarc-theme')).toBe('dark');
    expect(localStorage.getItem('reamarc_storage_version')).toBe(STORAGE_VERSION);

    localStorage.setItem('reamarc_active_view', 'dashboard');
    resetStaleClientStorage();
    expect(localStorage.getItem('reamarc_active_view')).toBe('dashboard');
    expect(localStorage.getItem('reamarc-theme')).toBe('dark');
  });
});
