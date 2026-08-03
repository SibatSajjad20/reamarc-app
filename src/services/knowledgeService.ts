import { apiClient } from './apiClient';
import type { KnowledgeSource } from '../types';

export interface CreateKnowledgeSourcePayload {
  name: string;
  type: 'pdf' | 'url';
  sizeOrTokens?: string;
  workspaceId?: string;
}

export const knowledgeService = {
  async getKnowledgeSources(workspaceId?: string): Promise<KnowledgeSource[]> {
    const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
    return apiClient.get<KnowledgeSource[]>(`/knowledge${query}`);
  },

  async createKnowledgeSource(payload: CreateKnowledgeSourcePayload): Promise<KnowledgeSource> {
    return apiClient.post<KnowledgeSource>('/knowledge', payload);
  },

  async deleteKnowledgeSource(sourceId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/knowledge/${sourceId}`);
  },
};
