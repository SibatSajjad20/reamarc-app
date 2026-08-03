import { apiClient } from './apiClient';
import type { InboxTask } from '../types';

export interface PolishCopyPayload {
  copy: string;
  action_type: 'punchy' | 'emojis' | 'hashtags' | 'fix' | 'creative_angle';
  platform?: string;
}

export const postService = {
  async getInboxTasks(workspaceId?: string): Promise<InboxTask[]> {
    const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
    return apiClient.get<InboxTask[]>(`/posts/inbox${query}`);
  },

  async approvePost(postId: number | string): Promise<{ message: string; post_id: number | string }> {
    return apiClient.post<{ message: string; post_id: number | string }>(`/posts/${postId}/approve`);
  },

  async saveDraft(postId: number | string, copy: string): Promise<{ message: string; post: InboxTask }> {
    return apiClient.patch<{ message: string; post: InboxTask }>(`/posts/${postId}/draft`, { copy });
  },

  async polishCopy(payload: PolishCopyPayload): Promise<{ polished_copy: string }> {
    return apiClient.post<{ polished_copy: string }>('/posts/polish', payload);
  },

  async regenerateFullPost(postId: number | string): Promise<{ message: string; post: InboxTask }> {
    return apiClient.post<{ message: string; post: InboxTask }>(`/posts/${postId}/regenerate-full`, {});
  },
};
