/**
 * Production-Grade API Client for Reamarc AI
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

  // Vite dev: same-origin `/api` so a phone on an https tunnel still hits this PC.
  if ((import.meta as any).env?.DEV && !envUrl) {
    return '/api/v1';
  }

  if (!envUrl && !(import.meta as any).env?.DEV) {
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

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /** @deprecated Cookie sessions — no-op kept for call-site compatibility during migration */
  public setToken(_token: string | null) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('reamarc_token');
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

  private async tryRefreshSession(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: '{}',
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  private buildHeaders(customHeaders?: HeadersInit, skipContentType = false): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(skipContentType ? {} : { 'Content-Type': 'application/json' }),
      ...(this.activeWorkspaceId ? { 'X-Workspace-ID': this.activeWorkspaceId } : {}),
      ...(customHeaders as Record<string, string>),
    };
    return headers;
  }

  public async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
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
      headers: this.buildHeaders(customHeaders),
      credentials: 'include',
      signal: controller.signal,
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      clearTimeout(timeoutId);

      let data: any = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
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
            return this.request<T>(endpoint, { ...options, _retried: true });
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
      headers: this.buildHeaders(customHeaders),
      credentials: 'include',
      signal: controller.signal,
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      clearTimeout(timeoutId);

      let data: any = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
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

  public async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.buildHeaders(undefined, true),
      body: formData,
      credentials: 'include',
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        const refreshed = await this.tryRefreshSession();
        if (refreshed) {
          return this.upload<T>(endpoint, formData);
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
      headers: this.buildHeaders(customHeaders, true),
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
