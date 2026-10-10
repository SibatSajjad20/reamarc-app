import { apiClient } from './apiClient';
import { BoundedCache, type CacheEntry } from '../utils/cache';
import { emitInvalidation, registerCacheClearer } from '../utils/cacheBus';

const adminMembersCache = new BoundedCache<AdminMember[]>(2);
const adminActivityCache = new BoundedCache<import('../types/admin').MemberActivity[]>(2);
const adminAdAccountsCache = new BoundedCache<AdAccount[]>(2);
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
    const res = await apiClient.get<AdminMember[]>(`/admin/members${query}`);
    if (!params || (Object.keys(params).length === 1 && params.is_active !== undefined)) {
      adminMembersCache.set('members', res);
    }
    return res;
  },

  async createMember(payload: CreateMemberPayload): Promise<AdminMember> {
    const res = await apiClient.post<AdminMember>('/admin/members', payload);
    adminMembersCache.clear();
    emitInvalidation(['admin.members', 'dashboard', 'attendance']);
    return res;
  },

  async updateMember(userId: string, payload: UpdateMemberPayload): Promise<AdminMember> {
    const res = await apiClient.patch<AdminMember>(`/admin/members/${userId}`, payload);
    adminMembersCache.clear();
    emitInvalidation(['admin.members', 'dashboard', 'attendance']);
    return res;
  },

  async deleteMember(userId: string): Promise<any> {
    const res = await apiClient.delete(`/admin/members/${userId}`);
    adminMembersCache.clear();
    emitInvalidation(['admin.members', 'dashboard', 'attendance']);
    return res;
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
    const res = await apiClient.post<Workspace>('/admin/workspaces', payload);
    emitInvalidation(['workspaces', 'dashboard']);
    return res;
  },

  async updateWorkspace(workspaceId: string, payload: UpdateWorkspacePayload): Promise<Workspace> {
    const res = await apiClient.patch<Workspace>(`/admin/workspaces/${workspaceId}`, payload);
    emitInvalidation(['workspaces', 'dashboard']);
    return res;
  },

  async deleteWorkspace(workspaceId: string): Promise<any> {
    const res = await apiClient.delete(`/admin/workspaces/${workspaceId}`);
    emitInvalidation(['workspaces', 'dashboard']);
    return res;
  },

  // --- Ad Accounts Management ---
  async getAdAccounts(): Promise<AdAccount[]> {
    return apiClient.get<AdAccount[]>('/admin/ad-accounts');
  },

  async createAdAccount(payload: CreateAdAccountPayload): Promise<AdAccount> {
    const res = await apiClient.post<AdAccount>('/admin/ad-accounts', payload);
    adminAdAccountsCache.clear();
    emitInvalidation(['marketing', 'dashboard']);
    return res;
  },

  async updateAdAccount(accountId: string, payload: UpdateAdAccountPayload): Promise<AdAccount> {
    const res = await apiClient.patch<AdAccount>(`/admin/ad-accounts/${accountId}`, payload);
    adminAdAccountsCache.clear();
    emitInvalidation(['marketing', 'dashboard']);
    return res;
  },

  async deleteAdAccount(accountId: string): Promise<any> {
    const res = await apiClient.delete(`/admin/ad-accounts/${accountId}`);
    adminAdAccountsCache.clear();
    emitInvalidation(['marketing', 'dashboard']);
    return res;
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

  async transferMobileDevice(userId?: string, deviceId?: string): Promise<{ message: string; unbound: number }> {
    return apiClient.post('/mobile/devices/transfer', { user_id: userId, device_id: deviceId });
  },

  async broadcastMobilePush(payload: { title: string; body: string; user_ids?: string[] }): Promise<{
    sent: number;
    skipped: number;
    in_app?: number;
    message: string;
  }> {
    return apiClient.post('/mobile/broadcast', payload);
  },

  getCachedMembers(): CacheEntry<AdminMember[]> | undefined {
    return adminMembersCache.get('members');
  },
  setCachedMembers(data: AdminMember[]): void {
    adminMembersCache.set('members', data);
  },
  getCachedActivities(): CacheEntry<import('../types/admin').MemberActivity[]> | undefined {
    return adminActivityCache.get('activities');
  },
  setCachedActivities(data: import('../types/admin').MemberActivity[]): void {
    adminActivityCache.set('activities', data);
  },
  getCachedAdAccounts(): CacheEntry<AdAccount[]> | undefined {
    return adminAdAccountsCache.get('ad_accounts');
  },
  setCachedAdAccounts(data: AdAccount[]): void {
    adminAdAccountsCache.set('ad_accounts', data);
  },
  hasInitialCache(): boolean {
    return adminMembersCache.size() > 0;
  },
  clearAllCaches(): void {
    adminMembersCache.clear();
    adminActivityCache.clear();
    adminAdAccountsCache.clear();
  },
};

// Register for app-wide cache sweep on logout and user switch
registerCacheClearer(() => adminService.clearAllCaches());
