import { apiClient } from './apiClient';
import type { Workspace } from '../types';

export interface WorkspaceCreatePayload {
  name: string;
  initials?: string;
  brandColor?: string;
  industry?: string;
}

export interface WorkspaceUpdatePayload {
  name?: string;
  initials?: string;
  brandColor?: string;
  industry?: string;
}

export const workspaceService = {
  async getWorkspaces(): Promise<Workspace[]> {
    return apiClient.get<Workspace[]>('/workspaces');
  },

  async createWorkspace(payload: WorkspaceCreatePayload): Promise<Workspace> {
    return apiClient.post<Workspace>('/workspaces', payload);
  },

  async updateWorkspace(workspaceId: string, payload: WorkspaceUpdatePayload): Promise<Workspace> {
    return apiClient.put<Workspace>(`/workspaces/${workspaceId}`, payload);
  },

  async deleteWorkspace(workspaceId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/workspaces/${workspaceId}`);
  },
};
