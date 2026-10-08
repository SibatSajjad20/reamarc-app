import { apiClient } from './apiClient';
import { BoundedCache, type CacheEntry } from '../utils/cache';
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
    return apiClient.post<Workspace>('/workspaces', payload);
  },

  async updateWorkspace(workspaceId: string, payload: WorkspaceUpdatePayload): Promise<Workspace> {
    return apiClient.patch<Workspace>(`/workspaces/${workspaceId}`, payload);
  },

  async deleteWorkspace(workspaceId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/workspaces/${workspaceId}`);
  },
};
