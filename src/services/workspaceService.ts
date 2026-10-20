import { apiClient } from './apiClient';
import { BoundedCache, type CacheEntry } from '../utils/cache';
import { emitInvalidation, registerCacheClearer } from '../utils/cacheBus';
import type { Workspace } from '../types';

const workspacesCache = new BoundedCache<Workspace[]>(2);

export interface WorkspaceCreatePayload {
  name: string;
  initials?: string;
  brandColor?: string;
  status?: 'active' | 'inactive';
  proposal_url?: string | null;
  proposal_name?: string | null;
  proposal_size?: number | null;
  project_cycle?: 'Retainer' | 'One-Time Project';
  priority?: 'High' | 'Medium' | 'Low';
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  services?: string[];
  health?: 'Excellent' | 'Good' | 'Moderate' | 'Emergency';
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
}

export interface WorkspaceUpdatePayload {
  name?: string;
  initials?: string;
  brandColor?: string;
  status?: 'active' | 'inactive';
  proposal_url?: string | null;
  proposal_name?: string | null;
  proposal_size?: number | null;
  project_cycle?: 'Retainer' | 'One-Time Project';
  priority?: 'High' | 'Medium' | 'Low';
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  services?: string[];
  health?: 'Excellent' | 'Good' | 'Moderate' | 'Emergency';
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
}

export const workspaceService = {
  async getWorkspaces(): Promise<Workspace[]> {
    const res = await apiClient.get<Workspace[]>('/workspaces');
    if (res) {
      workspacesCache.set('workspaces', res);
    }
    return res;
  },

  getCachedWorkspaces(): CacheEntry<Workspace[]> | undefined {
    return workspacesCache.get('workspaces');
  },

  setCachedWorkspaces(data: Workspace[]): void {
    workspacesCache.set('workspaces', data);
  },

  clearAllCaches(): void {
    workspacesCache.clear();
  },

  async createWorkspace(payload: WorkspaceCreatePayload): Promise<Workspace> {
    const res = await apiClient.post<Workspace>('/workspaces', payload);
    workspacesCache.clear();
    emitInvalidation(['workspaces', 'dashboard']);
    return res;
  },

  async updateWorkspace(workspaceId: string, payload: WorkspaceUpdatePayload): Promise<Workspace> {
    const res = await apiClient.patch<Workspace>(`/workspaces/${workspaceId}`, payload);
    workspacesCache.clear();
    emitInvalidation(['workspaces', 'dashboard']);
    return res;
  },

  async deleteWorkspace(workspaceId: string): Promise<{ message: string }> {
    const res = await apiClient.delete<{ message: string }>(`/workspaces/${workspaceId}`);
    workspacesCache.clear();
    emitInvalidation(['workspaces', 'dashboard']);
    return res;
  },

  patchCachedWorkspace(updated: Workspace): void {
    const cached = workspacesCache.get('workspaces');
    if (cached?.data) {
      workspacesCache.set(
        'workspaces',
        cached.data.map((w) => (w.id === updated.id ? { ...w, ...updated } : w))
      );
    }
  },

  async uploadLogo(workspaceId: string, file: File): Promise<Workspace> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.upload<Workspace>(`/workspaces/${workspaceId}/logo`, formData);
    workspaceService.patchCachedWorkspace(res);
    emitInvalidation(['workspaces']);
    return res;
  },

  async removeLogo(workspaceId: string): Promise<Workspace> {
    const res = await apiClient.delete<Workspace>(`/workspaces/${workspaceId}/logo`);
    workspaceService.patchCachedWorkspace(res);
    emitInvalidation(['workspaces']);
    return res;
  },

  async uploadProposal(
    file: File,
    storeAs?: string | null
  ): Promise<{ file_url: string; file_name: string; file_size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    const qs =
      storeAs && storeAs.trim()
        ? `?store_as=${encodeURIComponent(storeAs.trim())}`
        : '';
    return apiClient.upload<{ file_url: string; file_name: string; file_size: number }>(
      `/workspaces/upload-proposal${qs}`,
      formData,
      { skipWorkspaceHeader: !storeAs || !storeAs.trim() }
    );
  },
};

// Register for app-wide cache sweep on logout and user switch
registerCacheClearer(() => workspaceService.clearAllCaches());
