import { apiClient } from './apiClient';
import { attendanceService } from './attendanceService';
import { crmService } from './crmService';
import { contentCalendarService } from './contentCalendarService';
import { websiteProjectService } from './websiteProjectService';
import { dailyLogService } from './dailyLogService';
import { adminService } from './adminService';
import { logExceptionService } from './logExceptionService';
import { workspaceService } from './workspaceService';
import { marketingService } from './marketingService';
import { emitInvalidation } from '../utils/cacheBus';
import type { AuthUser, LoginPayload, AuthResponse } from '../types/auth';

export const authService = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/auth/login', payload);
  },

  async getMe(): Promise<AuthUser> {
    return apiClient.get<AuthUser>('/auth/me');
  },

  async updateProfile(payload: {
    full_name?: string;
    email?: string;
    phone?: string;
    current_password?: string;
    new_password?: string;
  }): Promise<AuthUser> {
    return apiClient.put<AuthUser>('/auth/me/profile', payload);
  },

  async uploadAvatar(file: File | Blob): Promise<AuthUser> {
    const formData = new FormData();
    formData.append('file', file, 'avatar.webp');
    const updatedUser = await apiClient.upload<AuthUser>('/users/me/avatar', formData);
    try {
      const cached = adminService.getCachedMembers();
      if (cached?.data) {
        const patched = cached.data.map((m) =>
          m.id === updatedUser.id ? { ...m, avatar_url: updatedUser.avatar_url } : m
        );
        adminService.setCachedMembers(patched);
      }
    } catch {
      // ignore
    }
    emitInvalidation(['admin.members', 'dashboard']);
    return updatedUser;
  },

  async deleteAvatar(): Promise<AuthUser> {
    const updatedUser = await apiClient.delete<AuthUser>('/users/me/avatar');
    try {
      const cached = adminService.getCachedMembers();
      if (cached?.data) {
        const patched = cached.data.map((m) =>
          m.id === updatedUser.id ? { ...m, avatar_url: null } : m
        );
        adminService.setCachedMembers(patched);
      }
    } catch {
      // ignore
    }
    emitInvalidation(['admin.members', 'dashboard']);
    return updatedUser;
  },

  async logout(): Promise<void> {
    try {
      // Clear all in-memory session caches
      attendanceService.clearAllCaches();
      crmService.clearAllCaches();
      contentCalendarService.clearAllCaches();
      websiteProjectService.clearAllCaches();
      dailyLogService.clearAllCaches();
      adminService.clearAllCaches();
      logExceptionService.clearAllCaches();
      workspaceService.clearAllCaches();
      marketingService.clearAllCaches();
      await apiClient.post('/auth/logout');
    } catch {
      // ignore
    }
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/auth/forgot-password', { email });
  },

  async verifyResetCode(email: string, code: string): Promise<{ message: string; valid: boolean }> {
    return apiClient.post<{ message: string; valid: boolean }>('/auth/verify-reset-code', { email, code });
  },

  async resetPassword(payload: { email: string; code: string; new_password: string }): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/auth/reset-password', payload);
  },
};

