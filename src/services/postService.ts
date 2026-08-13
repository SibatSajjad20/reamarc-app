import { apiClient } from './apiClient';
import type { InboxTask } from '../types';

export interface PolishCopyPayload {
  copy: string;
  action_type: 'punchy' | 'emojis' | 'hashtags' | 'fix' | 'creative_angle';
  platform?: string;
}

export const postService = {
  async getInboxTasks(workspaceId?: string, skip: number = 0, limit: number = 50): Promise<InboxTask[]> {
    const params = new URLSearchParams();
    if (workspaceId) params.append('workspaceId', workspaceId);
    if (skip > 0) params.append('skip', skip.toString());
    if (limit !== 50) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<InboxTask[]>(`/posts/inbox${query}`);
  },

  async approvePost(postId: number | string): Promise<{ message: string; post_id: number | string }> {
    return apiClient.post<{ message: string; post_id: number | string }>(`/posts/${postId}/approve`);
  },

  async rejectPost(postId: number | string): Promise<{ message: string; post_id: number | string }> {
    return apiClient.post<{ message: string; post_id: number | string }>(`/posts/${postId}/reject`);
  },

  async saveDraft(postId: number | string, copy: string): Promise<{ message: string; post: InboxTask }> {
    return apiClient.patch<{ message: string; post: InboxTask }>(`/posts/${postId}/draft`, { copy });
  },

  async revertPostVersion(postId: number | string): Promise<{ message: string; post: InboxTask }> {
    return apiClient.post<{ message: string; post: InboxTask }>(`/posts/${postId}/revert`);
  },

  async bulkApprove(postIds: (number | string)[]): Promise<{ message: string; approved_count: number }> {
    return apiClient.post<{ message: string; approved_count: number }>('/posts/bulk-approve', { post_ids: postIds });
  },

  async bulkReject(postIds: (number | string)[]): Promise<{ message: string; rejected_count: number }> {
    return apiClient.post<{ message: string; rejected_count: number }>('/posts/bulk-reject', { post_ids: postIds });
  },

  async polishCopy(payload: PolishCopyPayload): Promise<{ polished_copy: string }> {
    return apiClient.post<{ polished_copy: string }>('/posts/polish', payload, { timeout: 60000 });
  },

  async regenerateFullPost(postId: number | string): Promise<{ message: string; post: InboxTask }> {
    return apiClient.post<{ message: string; post: InboxTask }>(`/posts/${postId}/regenerate-full`, {}, { timeout: 60000 });
  },

  async feedbackRewritePost(
    postId: number | string,
    feedback: string,
    presetTags: string[] = []
  ): Promise<{ message: string; post: InboxTask }> {
    return apiClient.post<{ message: string; post: InboxTask }>(
      `/posts/${postId}/feedback-rewrite`,
      { feedback, preset_tags: presetTags },
      { timeout: 60000 }
    );
  },
};
