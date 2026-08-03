import { apiClient } from './apiClient';
import type { AuthUser, LoginPayload, RegisterPayload, AuthResponse } from '../types/auth';

export const authService = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/login', payload);
    if (res.access_token) {
      localStorage.setItem('reamarc_access_token', res.access_token);
    }
    return res;
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/register', payload);
    if (res.access_token) {
      localStorage.setItem('reamarc_access_token', res.access_token);
    }
    return res;
  },

  async getMe(): Promise<AuthUser> {
    return apiClient.get<AuthUser>('/auth/me');
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      localStorage.removeItem('reamarc_access_token');
    }
  },
};
