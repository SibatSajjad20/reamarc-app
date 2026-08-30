import { API_URL } from '../theme';
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

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refresh = await getRefreshToken();
  if (!refresh) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile', Accept: 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    await clearSession();
    return false;
  }
  const data = await res.json();
  if (!data?.access_token) return false;
  await saveTokens(data.access_token, data.refresh_token || refresh);
  return true;
}

async function refreshOnce() {
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
    res = await fetch(url, { ...options, headers, signal: timeout.signal });
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
    const ok = await refreshOnce();
    if (ok) {
      const retryHeaders = { ...headers };
      const token = await getAccessToken();
      if (token) retryHeaders.Authorization = `Bearer ${token}`;
      const retryTimeout = timeoutSignal(20000);
      try {
        const retry = await fetch(`${API_URL}${path}`, {
          ...options,
          headers: retryHeaders,
          signal: retryTimeout.signal,
        });
        if (!retry.ok) throw new Error(await parseError(retry));
        if (retry.status === 204) return undefined as T;
        return retry.json() as Promise<T>;
      } finally {
        retryTimeout.clear();
      }
    }
  }
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
