/**
 * Production-Grade API Client for Reamarc
 * Session auth via HttpOnly cookies (credentials: include).
 * No JWT in localStorage — XSS cannot steal the session that way.
 */

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

  // Vite dev: same-origin `/api` so a phone on an https tunnel still hits this PC.
  if (isDev && !envUrl) {
    return '/api/v1';
  }

  // Browser production: same-origin `/api/v1` so Vercel rewrites to Render and
  // auth cookies are first-party. Set VITE_API_DIRECT=1 to call the env URL instead.
  if (!isDev && typeof window !== 'undefined' && !forceDirect) {
    return '/api/v1';
  }

  if (!envUrl && !isDev) {
    throw new Error(
      'VITE_API_URL (or NEXT_PUBLIC_API_URL) must be set for production builds. Refusing to default to localhost.'
    );
  }

  let cleaned = (envUrl || 'http://localhost:8000/api/v1').replace(/\/$/, '');
  if (!cleaned.endsWith('/api/v1') && !cleaned.includes('/api/v1')) {
    cleaned = `${cleaned}/api/v1`;
  }
  return cleaned;
};

export const API_BASE_URL = getBaseUrl();


class ApiClient {
  private baseUrl: string;
  private onUnauthorizedCallback?: () => void;
  private activeWorkspaceId: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;
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
  public refreshSessionOnce(): Promise<boolean> {
    return this.tryRefreshSession();
  }

  private async tryRefreshSession(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const headers = {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        };
        const res = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: '{}',
        });
        if (res.ok) return true;
        // Another tab may already have rotated this browser's cookie.
        const me = await fetch(`${this.baseUrl}/auth/me`, {
          method: 'GET',
          credentials: 'include',
          headers,
        });
        return me.ok;
      } catch {
        return false;
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
          if (refreshed) {
            return this._executeRequest<T>(endpoint, { ...options, _retried: true });
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
          if (refreshed) {
            return this.requestWithHeaders<T>(endpoint, { ...options, _retried: true });
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
        if (refreshed) {
          return this.upload<T>(endpoint, formData, options);
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
          if (refreshed) {
            return this.getBlob(endpoint, { ...options, _retried: true });
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
