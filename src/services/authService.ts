import { apiClient } from './apiClient';
import type { AuthUser, LoginPayload, RegisterPayload, AuthResponse } from '../types/auth';

export const authService = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/auth/login', payload);
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/auth/register', payload);
  },

  async getMe(): Promise<AuthUser> {
    return apiClient.get<AuthUser>('/auth/me');
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // ignore
    }
  },
};
