import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../apiClient';

/** fetch mock: each route returns {status, delayMs}; honours AbortSignal like a real browser. */
function mockFetch(routes: Record<string, () => { status: number; delayMs?: number; body?: unknown }>) {
  const calls: string[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://x').pathname;
    calls.push(path);
    const key = Object.keys(routes).find((k) => path.endsWith(k));
    const spec = key ? routes[key]() : { status: 404 };
    return new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => {
        resolve(new Response(JSON.stringify(spec.body ?? {}), {
          status: spec.status,
          headers: { 'content-type': 'application/json' },
        }));
      }, spec.delayMs ?? 0);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

describe('session refresh under a slow server', () => {
  let loggedOut = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    loggedOut = 0;
    apiClient.setOnUnauthorized(() => {
      loggedOut += 1;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  for (const latency of [9_000, 12_000, 15_000]) {
    it(`keeps the user signed in when /auth/refresh takes ${latency / 1000}s under load`, async () => {
      let first = true;
      mockFetch({
        '/tasks': () => (first ? ((first = false), { status: 401 }) : { status: 200, body: { ok: 1 } }),
        '/auth/refresh': () => ({ status: 200, delayMs: latency }),
        '/auth/me': () => ({ status: 200, delayMs: latency }),
      });
      const p = apiClient.request<{ ok: number }>('/tasks', { timeout: 60_000 });
      const settled = p.then((v) => ({ v }), (e) => ({ e }));
      await vi.advanceTimersByTimeAsync(latency + 1_000);
      const out = (await settled) as { v?: { ok: number }; e?: unknown };
      expect(loggedOut).toBe(0);
      expect(out.v).toEqual({ ok: 1 });
    });
  }

  it('does not sign out when /auth/refresh never answers (30s+), surfaces a retryable error', async () => {
    mockFetch({
      '/tasks': () => ({ status: 401 }),
      '/auth/refresh': () => ({ status: 200, delayMs: 10 * 60_000 }),
    });
    const settled = apiClient.request('/tasks', { timeout: 120_000 }).then(() => 'ok', (e) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    const err = await settled;
    expect(loggedOut).toBe(0);
    expect((err as { status?: number }).status).toBe(503);
  });

  it('does not sign out on a 502/503 from /auth/refresh', async () => {
    mockFetch({
      '/tasks': () => ({ status: 401 }),
      '/auth/refresh': () => ({ status: 503 }),
      '/auth/me': () => ({ status: 503 }),
    });
    const settled = apiClient.request('/tasks').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(10);
    await settled;
    expect(loggedOut).toBe(0);
  });

  it('still signs out on a real 401 from refresh and /auth/me', async () => {
    mockFetch({
      '/tasks': () => ({ status: 401 }),
      '/auth/refresh': () => ({ status: 401 }),
      '/auth/me': () => ({ status: 401 }),
    });
    const settled = apiClient.request('/tasks').catch((e) => e);
    await vi.advanceTimersByTimeAsync(100);
    await settled;
    expect(loggedOut).toBe(1);
  });
});
