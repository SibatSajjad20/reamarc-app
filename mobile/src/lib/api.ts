import { API_URL } from '../theme';
import { clearAttendanceCaches } from './attendanceCache';
import { clearDailyLogCaches } from './dailyLogCache';
import { clearCrmCaches } from './crmCache';
import { clearSession, getAccessToken, getRefreshToken, saveTokens } from './secure';

/** Hermes in Expo Go does not implement AbortSignal.timeout. */
function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(' ');
    if (data?.message) return String(data.message);
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** 401/403 from auth means the saved login is no longer valid. Network and 5xx are not. */
export function isAuthRejection(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403);
}

type RefreshResult = 'ok' | 'rejected' | 'unavailable';

let refreshing: Promise<RefreshResult> | null = null;

async function tryRefresh(): Promise<RefreshResult> {
  const refresh = await getRefreshToken();
  if (!refresh) {
    await clearSession();
    return 'rejected';
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client': 'mobile',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ refresh_token: refresh }),
    });
  } catch {
    return 'unavailable';
  }
  if (res.status === 401 || res.status === 403) {
    clearDailyLogCaches();
    clearAttendanceCaches();
    clearCrmCaches();
    await clearSession();
    return 'rejected';
  }
  if (!res.ok) return 'unavailable';
  const data = await res.json().catch(() => null);
  if (!data?.access_token) return 'unavailable';
  await saveTokens(data.access_token, data.refresh_token || refresh);
  return 'ok';
}

async function refreshOnce(): Promise<RefreshResult> {
  if (!refreshing) {
    refreshing = tryRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function api<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Client': 'mobile',
    // Satisfies production CSRF custom-header check if a prior Set-Cookie is replayed.
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (!options.skipAuth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const url = `${API_URL}${path}`;
  const timeout = timeoutSignal(35000);
  let res: Response;
  try {
    // Mobile auth is Bearer-only; never send cookie jars (Android may store Set-Cookie).
    res = await fetch(url, { ...options, headers, credentials: 'omit', signal: timeout.signal });
  } catch (err: any) {
    const name = String(err?.name || '');
    if (name === 'TimeoutError' || name === 'AbortError' || /network request timed out/i.test(String(err?.message))) {
      throw new Error(`Cannot reach ${API_URL}. Please check your internet connection or try again in a few seconds.`);
    }
    throw err;
  } finally {
    timeout.clear();
  }
  if (res.status === 401 && !options.skipAuth) {
    let refreshed: RefreshResult;
    try {
      refreshed = await refreshOnce();
    } catch {
      refreshed = 'unavailable';
    }
    if (refreshed === 'ok') {
      const retryHeaders = { ...headers };
      const token = await getAccessToken();
      if (token) retryHeaders.Authorization = `Bearer ${token}`;
      const retryTimeout = timeoutSignal(20000);
      try {
        const retry = await fetch(`${API_URL}${path}`, {
          ...options,
          headers: retryHeaders,
          credentials: 'omit',
          signal: retryTimeout.signal,
        });
        if (retry.status === 401) {
          clearDailyLogCaches();
          clearAttendanceCaches();
          clearCrmCaches();
          await clearSession();
          throw new ApiError(await parseError(retry), retry.status);
        }
        if (!retry.ok) throw new ApiError(await parseError(retry), retry.status);
        if (retry.status === 204) return undefined as T;
        return retry.json() as Promise<T>;
      } finally {
        retryTimeout.clear();
      }
    }
    if (refreshed === 'rejected') {
      throw new ApiError(await parseError(res), 401);
    }
    throw new ApiError('Cannot reach the server right now. You are still signed in.', 0);
  }
  if (!res.ok) throw new ApiError(await parseError(res), res.status);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
