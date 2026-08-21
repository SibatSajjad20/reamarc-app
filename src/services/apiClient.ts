/**
 * Production-Grade API Client for Reamarc AI
 * Handles authentication headers, HttpOnly cookies, request timeouts,
 * and standardized error parsing.
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

interface RequestOptions extends RequestInit {
  timeout?: number;
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
  private token: string | null = typeof window !== 'undefined' ? localStorage.getItem('reamarc_token') : null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  public setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('reamarc_token', token);
      } else {
        localStorage.removeItem('reamarc_token');
      }
    }
  }

  public getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('reamarc_token');
    }
    return this.token;
  }

  public setOnUnauthorized(callback: () => void) {
    this.onUnauthorizedCallback = callback;
  }

  public setWorkspaceId(workspaceId: string | null) {
    this.activeWorkspaceId = workspaceId;
  }

  public async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { timeout = 15000, headers: customHeaders, signal: externalSignal, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    const currentToken = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      ...(this.activeWorkspaceId ? { 'X-Workspace-ID': this.activeWorkspaceId } : {}),
      ...(customHeaders as Record<string, string>),
    };

    const config: RequestInit = {
      ...fetchOptions,
      headers,
      credentials: 'include', // Send HttpOnly cookies automatically
      signal: controller.signal,
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      clearTimeout(timeoutId);

      // Parse JSON response body if present
      let data: any = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      }

      if (!response.ok) {
        if (response.status === 401 && this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }

        const errorMessage =
          typeof data?.detail === 'string'
            ? data.detail
            : data?.message || `API Request failed with status ${response.status}`;
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
    const { timeout = 15000, headers: customHeaders, signal: externalSignal, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    const currentToken = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      ...(this.activeWorkspaceId ? { 'X-Workspace-ID': this.activeWorkspaceId } : {}),
      ...(customHeaders as Record<string, string>),
    };

    const config: RequestInit = {
      ...fetchOptions,
      headers,
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
        if (response.status === 401 && this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }

        const errorMessage =
          typeof data?.detail === 'string'
            ? data.detail
            : data?.message || `API Request failed with status ${response.status}`;
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
    const currentToken = this.getToken();
    const headers: Record<string, string> = {
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      ...(this.activeWorkspaceId ? { 'X-Workspace-ID': this.activeWorkspaceId } : {}),
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data?.detail || data?.message || 'File upload failed.', response.status, data);
    }
    return data as T;
  }
}

export const apiClient = new ApiClient();
