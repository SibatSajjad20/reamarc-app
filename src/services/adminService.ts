import { apiClient } from './apiClient';
import type {
  AdminMember,
  AdminUser,
  CreateMemberPayload,
  UpdateMemberPayload,
  AdminCreateWorkspacePayload,
  AdminAssignWorkspacePayload,
} from '../types/admin';
import type { Workspace } from '../types';

export const adminService = {
  async getMembers(params?: { search?: string; department?: string; role?: string; is_active?: boolean }): Promise<AdminMember[]> {
    let query = '';
    if (params) {
      const sp = new URLSearchParams();
      if (params.search) sp.append('search', params.search);
      if (params.department) sp.append('department', params.department);
      if (params.role) sp.append('role', params.role);
      if (params.is_active !== undefined) sp.append('is_active', String(params.is_active));
      const str = sp.toString();
      if (str) query = `?${str}`;
    }
    return apiClient.get<AdminMember[]>(`/admin/members${query}`);
  },

  async createMember(payload: CreateMemberPayload): Promise<AdminMember> {
    return apiClient.post<AdminMember>('/admin/members', payload);
  },

  async updateMember(userId: string, payload: UpdateMemberPayload): Promise<AdminMember> {
    return apiClient.patch<AdminMember>(`/admin/members/${userId}`, payload);
  },

  // Compatibility aliases
  async getUsers(): Promise<AdminUser[]> {
    return this.getMembers();
  },

  async createUser(payload: CreateMemberPayload): Promise<AdminUser> {
    return this.createMember(payload);
  },

  async updateUser(userId: string, payload: UpdateMemberPayload): Promise<AdminUser> {
    return this.updateMember(userId, payload);
  },

  async createWorkspace(payload: AdminCreateWorkspacePayload): Promise<Workspace> {
    return apiClient.post<Workspace>('/admin/workspaces', payload);
  },

  async assignWorkspace(payload: AdminAssignWorkspacePayload): Promise<any> {
    return apiClient.post('/admin/workspaces/assign', payload);
  },
};
