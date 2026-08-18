import { apiClient } from './apiClient';
import type { Workspace } from '../types';

export interface WorkspaceCreatePayload {
  name: string;
  initials?: string;
  brandColor?: string;
  status?: 'active' | 'inactive';
  proposal_url?: string;
  proposal_name?: string;
  proposal_size?: number;
  project_cycle?: 'Retainer' | 'One-Time Project';
  priority?: 'High' | 'Medium' | 'Low';
  contract_start_date?: string;
  contract_end_date?: string;
  services?: string[];
  health?: 'Excellent' | 'Good' | 'Moderate' | 'Emergency';
  poc_name?: string;
  poc_email?: string;
  poc_phone?: string;
  billing_name?: string;
  billing_email?: string;
  billing_phone?: string;
}

export interface WorkspaceUpdatePayload {
  name?: string;
  initials?: string;
  brandColor?: string;
  status?: 'active' | 'inactive';
  proposal_url?: string;
  proposal_name?: string;
  proposal_size?: number;
  project_cycle?: 'Retainer' | 'One-Time Project';
  priority?: 'High' | 'Medium' | 'Low';
  contract_start_date?: string;
  contract_end_date?: string;
  services?: string[];
  health?: 'Excellent' | 'Good' | 'Moderate' | 'Emergency';
  poc_name?: string;
  poc_email?: string;
  poc_phone?: string;
  billing_name?: string;
  billing_email?: string;
  billing_phone?: string;
}

export const workspaceService = {
  async getWorkspaces(): Promise<Workspace[]> {
    return apiClient.get<Workspace[]>('/workspaces');
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
