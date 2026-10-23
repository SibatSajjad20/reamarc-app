import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getMe = vi.fn();
vi.mock('../../services/authService', () => ({ authService: { getMe: (...a: unknown[]) => getMe(...a) } }));
vi.mock('../../services/webPushService', () => ({
  disableWebPush: vi.fn(async () => undefined),
  syncWebPushSubscription: vi.fn(async () => undefined),
}));

import { AuthProvider, useAuth } from '../AuthContext';

let snapshot: { user: unknown; isLoading: boolean } = { user: undefined, isLoading: true };
function Probe() {
  const { user, isLoading } = useAuth();
  snapshot = { user, isLoading };
  return null;
}
const ME = { id: 'u1', email: 'a@b.test', role: 'employee', full_name: 'A' };
const delayed = (ms: number, fn: () => unknown) =>
  new Promise((res, rej) => setTimeout(() => {
    try { res(fn()); } catch (e) { rej(e); }
  }, ms));
const httpErr = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('page load while the server is slow (laptop wakes up, 9 AM rush)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getMe.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('a 12 s /auth/me under load does not drop the user to the login screen', async () => {
    getMe.mockImplementation(() => delayed(12_000, () => ME));
    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
    expect(snapshot.user).toBeFalsy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(snapshot.user).toMatchObject({ id: 'u1' });
  });

  it('a flaky network (timeout, then 503) is retried and the user stays signed in', async () => {
    getMe
      .mockImplementationOnce(() => delayed(15_000, () => { throw httpErr(408); }))
      .mockImplementationOnce(() => delayed(100, () => { throw httpErr(503); }))
      .mockImplementation(() => delayed(100, () => ME));
    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(13_000); });
    expect(snapshot.isLoading).toBe(true); // still "connecting", not the login form
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(snapshot.user).toMatchObject({ id: 'u1' });
  });

  it('a real 401 still shows the login screen right away', async () => {
    getMe.mockImplementation(() => delayed(50, () => { throw httpErr(401); }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(snapshot.user).toBeNull();
    expect(snapshot.isLoading).toBe(false);
    expect(getMe).toHaveBeenCalledTimes(1);
  });
});
