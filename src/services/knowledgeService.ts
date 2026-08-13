import { apiClient, API_BASE_URL } from './apiClient';
import type { KnowledgeSource } from '../types';

export interface CreateKnowledgeSourcePayload {
  name: string;
  type: 'pdf' | 'url';
  sizeOrTokens?: string;
  workspaceId?: string;
}

export const knowledgeService = {
  async getKnowledgeSources(workspaceId?: string, skip: number = 0, limit: number = 50): Promise<KnowledgeSource[]> {
    const params = new URLSearchParams();
    if (workspaceId) params.append('workspaceId', workspaceId);
    if (skip > 0) params.append('skip', skip.toString());
    if (limit !== 50) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<KnowledgeSource[]>(`/knowledge${query}`);
  },

  async uploadFiles(files: File[], workspaceId: string): Promise<KnowledgeSource[]> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('workspace_id', workspaceId);
    const response = await fetch(
      `${API_BASE_URL}/knowledge/upload`,
      {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.detail || `Upload failed with status ${response.status}`);
    }
    return response.json();
  },

  async uploadPdf(file: File, workspaceId: string): Promise<KnowledgeSource> {
    const res = await this.uploadFiles([file], workspaceId);
    return res[0];
  },

  async scrapeUrl(url: string, workspaceId: string): Promise<KnowledgeSource> {
    const formData = new FormData();
    formData.append('url', url);
    formData.append('workspace_id', workspaceId);
    const response = await fetch(
      `${API_BASE_URL}/knowledge/scrape-url`,
      {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.detail || `Scrape failed with status ${response.status}`);
    }
    return response.json();
  },

  async createKnowledgeSource(payload: CreateKnowledgeSourcePayload): Promise<KnowledgeSource> {
    return apiClient.post<KnowledgeSource>('/knowledge', payload);
  },

  async deleteKnowledgeSource(sourceId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/knowledge/${sourceId}`);
  },
};
