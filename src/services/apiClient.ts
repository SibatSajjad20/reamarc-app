/**
 * Production-Grade API Client for Reamarc
 * Session auth via HttpOnly cookies (credentials: include).
 * No JWT in localStorage — XSS cannot steal the session that way.
 */

import { WORKLANE_API_BASE, isWorklaneHost } from '../utils/worklaneHost';

export class ApiError extends Error {
  public status: number;
  public details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function formatApiErrorMessage(data: any, status: number): string {
  if (typeof data?.detail === 'string') {
    return data.detail;
  }

  if (data?.detail && typeof data.detail === 'object' && !Array.isArray(data.detail)) {
    const msg = data.detail.message || data.detail.claimed_by;
    if (typeof msg === 'string' && msg.trim()) {
      return msg;
    }
  }

  if (Array.isArray(data?.detail)) {
    const fieldLabels: Record<string, string> = {
      email: 'Work Email',
      full_name: 'Full Name',
      phone: 'Phone Number',
      role: 'Role',
      department: 'Department',
      temporary_password: 'Password',
    };

    const messages = data.detail
      .map((item: any) => {
        const loc = Array.isArray(item?.loc) ? item.loc : [];
        const fieldKey = String(loc[loc.length - 1] || '');
        const label = fieldLabels[fieldKey] || fieldKey.replace(/_/g, ' ');
        let msg = String(item?.msg || 'Invalid value');

        if (fieldKey === 'email' && msg.toLowerCase().includes('valid email')) {
          msg = 'must be a valid email address (e.g. name@company.com)';
        }

        return label ? `${label}: ${msg}` : msg;
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(' • ');
    }
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message;
  }

  if (status === 429) {
    return 'Rate limit reached. Please wait a moment before trying again.';
  }

  return `API Request failed with status ${status}`;
}

interface RequestOptions extends RequestInit {
  timeout?: number;
  _retried?: boolean;
}

function normalizeApiBase(url: string): string {
  let cleaned = url.replace(/\/$/, '');
  if (!cleaned.endsWith('/api/v1') && !cleaned.includes('/api/v1')) {
    cleaned = `${cleaned}/api/v1`;
  }
  return cleaned;
}

const getBaseUrl = (): string => {
  const globalProcess = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
  const envUrl = (
    globalProcess?.env?.NEXT_PUBLIC_API_URL ||
    (import.meta as any).env?.NEXT_PUBLIC_API_URL ||
    (import.meta as any).env?.VITE_API_URL ||
    ''
  ).trim();
  const isDev = Boolean((import.meta as any).env?.DEV);
  const forceDirect = String((import.meta as any).env?.VITE_API_DIRECT || '') === '1';
  const browserHost =
    typeof window !== 'undefined' ? String(window.location?.hostname || '') : '';

  // Worklane browser hosts: ALWAYS same-origin `/api/v1` (Vercel rewrites to the
  // API). Calling api.oneworklane.com cross-origin makes the session cookie
  // third-party; Chrome Incognito blocks it → login loop. Set VITE_API_DIRECT=1
  // only for deliberate cross-origin debugging.
  if (typeof window !== 'undefined' && isWorklaneHost(browserHost) && !forceDirect) {
    return '/api/v1';
  }

  // Explicit env (local overrides, staging). Ignored for Worklane browsers above.
  if (envUrl) {
    return normalizeApiBase(envUrl);
  }

  // Vite dev: same-origin `/api` so a phone on an https tunnel still hits this PC.
  if (isDev) {
    return '/api/v1';
  }

  // Browser production on non-Worklane hosts (e.g. reamarc-app.vercel.app):
  // same-origin `/api/v1` so Vercel rewrites and cookies stay first-party.
  if (typeof window !== 'undefined' && !forceDirect) {
    return '/api/v1';
  }

  if (!isDev) {
    throw new Error(
      'VITE_API_URL (or NEXT_PUBLIC_API_URL) must be set for production builds. Refusing to default to localhost.'
    );
  }

  return normalizeApiBase('http://localhost:8000/api/v1');
};

export const API_BASE_URL = getBaseUrl();


/** 'unauthorized' = the server said 401/403; 'unavailable' = timeout, network error or 5xx. */
export type RefreshOutcome = 'ok' | 'unauthorized' | 'unavailable';

/** Render can take 30-60 s to wake up; never treat a slow answer as a sign-out. */
export const AUTH_REQUEST_TIMEOUT_MS = 30_000;

class ApiClient {
  private baseUrl: string;
  private onUnauthorizedCallback?: () => void;
  private activeWorkspaceId: string | null = null;
  private refreshPromise: Promise<RefreshOutcome> | null = null;
  private inFlightGets = new Map<string, Promise<any>>();

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /** @deprecated Cookie sessions — no-op kept for call-site compatibility during migration */
  public setToken(_token: string | null) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('reamarc_token');
      if (!_token) {
        localStorage.removeItem('reamarc_impersonation_token');
        sessionStorage.removeItem('reamarc_impersonation_token');
      }
    }
  }

  /** @deprecated Cookie sessions — always null */
  public getToken(): string | null {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('reamarc_token');
    }
    return null;
  }

  public setOnUnauthorized(callback: () => void) {
    this.onUnauthorizedCallback = callback;
  }

  public setWorkspaceId(workspaceId: string | null) {
    this.activeWorkspaceId = workspaceId;
  }

  /** Refresh the HttpOnly session once. Used by raw upload fetches that skip request(). */
  public async refreshSessionOnce(): Promise<boolean> {
    return (await this.tryRefreshSession()) === 'ok';
  }

  /** Same as refreshSessionOnce, but tells a real sign-out apart from a slow or unreachable server. */
  public refreshSessionStatus(): Promise<RefreshOutcome> {
    return this.tryRefreshSession();
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = AUTH_REQUEST_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (init.signal) {
      if (init.signal.aborted) {
        controller.abort();
      } else {
        init.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Only one tab of this browser refreshes at a time (Web Locks when available). */
  private withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
    if (locks && typeof locks.request === 'function') {
      return locks.request('reamarc-auth-refresh', fn) as Promise<T>;
    }
    return fn();
  }

  private async tryRefreshSession(): Promise<RefreshOutcome> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async (): Promise<RefreshOutcome> => {
      try {
        return await this.withRefreshLock(async () => {
          const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          };
          const res = await this.fetchWithTimeout(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: '{}',
          });
          if (res.ok) return 'ok';
          if (res.status !== 401 && res.status !== 403) return 'unavailable';
          // Another tab may already have rotated this browser's cookie.
          const me = await this.fetchWithTimeout(`${this.baseUrl}/auth/me`, {
            method: 'GET',
            credentials: 'include',
            headers,
          });
          if (me.ok) return 'ok';
          return me.status === 401 || me.status === 403 ? 'unauthorized' : 'unavailable';
        });
      } catch {
        // Timeout or network error: the server is slow or asleep, not a sign-out.
        return 'unavailable';
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  private buildHeaders(customHeaders?: HeadersInit, skipContentType = false, _endpoint?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(skipContentType ? {} : { 'Content-Type': 'application/json' }),
      ...(this.activeWorkspaceId ? { 'X-Workspace-ID': this.activeWorkspaceId } : {}),
      ...(customHeaders as Record<string, string>),
    };

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('reamarc_impersonation_token');
        localStorage.removeItem('reamarc_impersonation_token');
      } catch {
        // Ignore storage access errors
      }
    }

    return headers;
  }

  public request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('reamarc_impersonation_token');
        localStorage.removeItem('reamarc_impersonation_token');
      } catch {
        // Stale impersonation tokens should not crash the client.
      }
    }
    const isGet = (!options.method || options.method.toUpperCase() === 'GET') && !options.signal;
    if (isGet) {
      const cacheKey = `${this.activeWorkspaceId || ''}::${endpoint}`;
      const inFlight = this.inFlightGets.get(cacheKey);
      if (inFlight) {
        return inFlight as Promise<T>;
      }
      const promise = this._executeRequest<T>(endpoint, options).finally(() => {
        this.inFlightGets.delete(cacheKey);
      });
      this.inFlightGets.set(cacheKey, promise);
      return promise;
    }
    return this._executeRequest<T>(endpoint, options);
  }

  private async _executeRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { timeout = 15000, headers: customHeaders, signal: externalSignal, _retried, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    const config: RequestInit = {
      ...fetchOptions,
      headers: this.buildHeaders(customHeaders, false, endpoint),
      credentials: 'include',
      signal: controller.signal,
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      clearTimeout(timeoutId);

      let data: any = null;
      if (response.status !== 204) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            const text = await response.text();
            data = text && text.trim() ? JSON.parse(text) : null;
          } catch {
            data = null;
          }
        }
      }

      if (!response.ok) {
        if (
          response.status === 401 &&
          !_retried &&
          !endpoint.includes('/auth/login') &&
          !endpoint.includes('/auth/refresh')
        ) {
          const refreshed = await this.tryRefreshSession();
          if (refreshed === 'ok') {
            return this._executeRequest<T>(endpoint, { ...options, _retried: true });
          }
          if (refreshed === 'unavailable') {
            throw new ApiError('Server is not responding. Retrying shortly.', 503, data);
          }
          if (this.onUnauthorizedCallback) {
            this.onUnauthorizedCallback();
          }
        } else if (response.status === 401 && this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }

        const errorMessage = formatApiErrorMessage(data, response.status);
        throw new ApiError(errorMessage, response.status, data);
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        if (externalSignal?.aborted) {
          const abortErr = new ApiError('Request aborted.', 499);
          abortErr.name = 'AbortError';
          throw abortErr;
        }
        throw new ApiError('Request timed out. Please check your network connection.', 408);
      }
      if (err instanceof ApiError) {
        throw err;
      }
      throw new ApiError(err.message || 'Network communication failure.', 500);
    }
  }

  public async requestWithHeaders<T>(endpoint: string, options: RequestOptions = {}): Promise<{ data: T; headers: Headers }> {
    const { timeout = 15000, headers: customHeaders, signal: externalSignal, _retried, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    const config: RequestInit = {
      ...fetchOptions,
      headers: this.buildHeaders(customHeaders, false, endpoint),
      credentials: 'include',
      signal: controller.signal,
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      clearTimeout(timeoutId);

      let data: any = null;
      if (response.status !== 204) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            const text = await response.text();
            data = text && text.trim() ? JSON.parse(text) : null;
          } catch {
            data = null;
          }
        }
      }

      if (!response.ok) {
        if (
          response.status === 401 &&
          !_retried &&
          !endpoint.includes('/auth/login') &&
          !endpoint.includes('/auth/refresh')
        ) {
          const refreshed = await this.tryRefreshSession();
          if (refreshed === 'ok') {
            return this.requestWithHeaders<T>(endpoint, { ...options, _retried: true });
          }
          if (refreshed === 'unavailable') {
            throw new ApiError('Server is not responding. Retrying shortly.', 503, data);
          }
          if (this.onUnauthorizedCallback) {
            this.onUnauthorizedCallback();
          }
        } else if (response.status === 401 && this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }

        const errorMessage = formatApiErrorMessage(data, response.status);
        throw new ApiError(errorMessage, response.status, data);
      }

      return { data: data as T, headers: response.headers };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        if (externalSignal?.aborted) {
          const abortErr = new ApiError('Request aborted.', 499);
          abortErr.name = 'AbortError';
          throw abortErr;
        }
        throw new ApiError('Request timed out. Please check your network connection.', 408);
      }
      if (err instanceof ApiError) {
        throw err;
      }
      throw new ApiError(err.message || 'Network communication failure.', 500);
    }
  }

  public get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public put<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public patch<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  public async upload<T>(
    endpoint: string,
    formData: FormData,
    options?: { headers?: HeadersInit; skipWorkspaceHeader?: boolean }
  ): Promise<T> {
    const headers = this.buildHeaders(options?.headers, true, endpoint);
    if (options?.skipWorkspaceHeader) {
      delete headers['X-Workspace-ID'];
      delete headers['x-workspace-id'];
    }
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      if (response.status === 401) {
        const refreshed = await this.tryRefreshSession();
        if (refreshed === 'ok') {
          return this.upload<T>(endpoint, formData, options);
        }
        if (refreshed === 'unavailable') {
          throw new ApiError('Server is not responding. Retrying shortly.', 503, data);
        }
        if (this.onUnauthorizedCallback) this.onUnauthorizedCallback();
      }
      throw new ApiError(data?.detail || data?.message || 'File upload failed.', response.status, data);
    }
    return data as T;
  }

  public async getBlob(endpoint: string, options: RequestOptions = {}): Promise<Blob> {
    const { timeout = 120000, headers: customHeaders, signal: externalSignal, _retried, ...fetchOptions } = options;

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch (_) {}
    }, timeout);

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    const config: RequestInit = {
      ...fetchOptions,
      headers: this.buildHeaders(customHeaders, true, endpoint),
      credentials: 'include',
      signal: controller.signal,
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 && !_retried) {
          const refreshed = await this.tryRefreshSession();
          if (refreshed === 'ok') {
            return this.getBlob(endpoint, { ...options, _retried: true });
          }
          if (refreshed === 'unavailable') {
            throw new ApiError('Server is not responding. Retrying shortly.', 503);
          }
          if (this.onUnauthorizedCallback) this.onUnauthorizedCallback();
        }
        let errorMsg = `Download failed with status ${response.status}`;
        try {
          const errJson = await response.json();
          errorMsg = errJson.detail || errJson.message || errorMsg;
        } catch (_) {}
        throw new ApiError(errorMsg, response.status);
      }

      return await response.blob();
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err instanceof ApiError) throw err;
      if (timedOut || err.name === 'AbortError') {
        throw new ApiError('File export request timed out. Please try again.', 408);
      }
      throw new ApiError(err.message || 'File download failed.', 500);
    }
  }
}

export const apiClient = new ApiClient();
