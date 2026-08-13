import { apiClient } from './apiClient';
import type {
  AdminUser, AdminCreateUserPayload, AdminUpdateUserPayload,
  AdminCreateWorkspacePayload, AdminAssignWorkspacePayload
} from '../types/admin';
import type { Workspace } from '../types';

export const adminService = {
  async getUsers(): Promise<AdminUser[]> {
    return apiClient.get<AdminUser[]>('/admin/users');
  },

  async createUser(payload: AdminCreateUserPayload): Promise<AdminUser> {
    return apiClient.post<AdminUser>('/admin/users', payload);
  },

  async updateUser(userId: string, payload: AdminUpdateUserPayload): Promise<AdminUser> {
    return apiClient.patch<AdminUser>(`/admin/users/${userId}`, payload);
  },

  async createWorkspace(payload: AdminCreateWorkspacePayload): Promise<Workspace> {
    return apiClient.post<Workspace>('/admin/workspaces', payload);
  },

  async assignWorkspace(payload: AdminAssignWorkspacePayload): Promise<any> {
    return apiClient.post('/admin/workspaces/assign', payload);
  },
};
