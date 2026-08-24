import { apiClient } from './apiClient';
import type {
  AdminMember,
  AdminUser,
  CreateMemberPayload,
  UpdateMemberPayload,
  AdAccount,
  CreateAdAccountPayload,
  UpdateAdAccountPayload,
  CreateWorkspacePayload,
  UpdateWorkspacePayload,
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

  // --- Workspaces Management ---
  async getWorkspaces(): Promise<Workspace[]> {
    return apiClient.get<Workspace[]>('/admin/workspaces');
  },

  async createWorkspace(payload: CreateWorkspacePayload): Promise<Workspace> {
    return apiClient.post<Workspace>('/admin/workspaces', payload);
  },

  async updateWorkspace(workspaceId: string, payload: UpdateWorkspacePayload): Promise<Workspace> {
    return apiClient.patch<Workspace>(`/admin/workspaces/${workspaceId}`, payload);
  },

  async deleteWorkspace(workspaceId: string): Promise<any> {
    return apiClient.delete(`/admin/workspaces/${workspaceId}`);
  },

  // --- Ad Accounts Management ---
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

  async listMobileDevices(): Promise<any[]> {
    return apiClient.get('/mobile/devices');
  },

  async transferMobileDevice(userId: string): Promise<{ message: string; unbound: number }> {
    return apiClient.post('/mobile/devices/transfer', { user_id: userId });
  },

  async broadcastMobilePush(payload: { title: string; body: string; user_ids?: string[] }): Promise<{
    sent: number;
    skipped: number;
    in_app?: number;
    message: string;
  }> {
    return apiClient.post('/mobile/broadcast', payload);
  },
};
