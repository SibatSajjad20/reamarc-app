import { apiClient } from './apiClient';
import type {
  AdminMember,
  AdminUser,
  CreateMemberPayload,
  UpdateMemberPayload,
  AdAccount,
  CreateAdAccountPayload,
  UpdateAdAccountPayload,
  AdminCreateWorkspacePayload,
  AdminUpdateWorkspacePayload,
} from '../types/admin';
import type { Workspace } from '../types';

export const adminService = {
  // --- Team Member Management ---
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

  async deleteMember(userId: string): Promise<any> {
    return apiClient.delete(`/admin/members/${userId}`);
  },

  async deleteUser(userId: string): Promise<any> {
    return this.deleteMember(userId);
  },

  async getMembersActivity(days: number = 7): Promise<import('../types/admin').MemberActivity[]> {
    return apiClient.get<import('../types/admin').MemberActivity[]>(`/admin/members/activity?days=${days}`);
  },

  async sendMemberReminder(userId: string, payload?: { channel?: string; custom_message?: string }): Promise<import('../types/admin').ReminderResponse> {
    return apiClient.post<import('../types/admin').ReminderResponse>(`/admin/members/${userId}/remind`, payload || { channel: 'email' });
  },

  // --- Ad Account & Brand Management ---
  async getAdAccounts(): Promise<AdAccount[]> {
    return apiClient.get<AdAccount[]>('/admin/ad-accounts');
  },

  async createAdAccount(payload: CreateAdAccountPayload): Promise<AdAccount> {
    return apiClient.post<AdAccount>('/admin/ad-accounts', payload);
  },

  async updateAdAccount(accountId: string, payload: UpdateAdAccountPayload): Promise<AdAccount> {
    return apiClient.patch<AdAccount>(`/admin/ad-accounts/${accountId}`, payload);
  },

  async deleteAdAccount(accountId: string): Promise<any> {
    return apiClient.delete(`/admin/ad-accounts/${accountId}`);
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
    return this.createAdAccount(payload);
  },

  async updateWorkspace(workspaceId: string, payload: AdminUpdateWorkspacePayload): Promise<Workspace> {
    return this.updateAdAccount(workspaceId, payload);
  },

  async deleteWorkspace(workspaceId: string): Promise<any> {
    return this.deleteAdAccount(workspaceId);
  },
};
