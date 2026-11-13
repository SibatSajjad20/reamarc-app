import { apiClient } from './apiClient';
import type {
  Task,
  TaskAttachment,
  TaskActivity,
  TaskAssignableUser,
  TaskChatUnread,
  TaskComment,
  TaskConversation,
  TaskCounts,
  TaskFilters,
  TaskListResponse,
  TaskOverview,
  TaskSavedView,
  TaskSettings,
} from '../types/task';
import type { DrivePickerConfig, DrivePickedFile } from '../types/contentCalendar';

export function emitTasksChanged() {
  try {
    window.dispatchEvent(new Event('reamarc-tasks-changed'));
  } catch {
    /* ignore */
  }
}

function paramsOf(filter?: TaskFilters & { page?: number; limit?: number; parent_id?: string }): string {
  const q = new URLSearchParams();
  if (!filter) return '';
  Object.entries(filter).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || v === 'all' || v === false) return;
    q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const taskService = {
  async getTasks(filter?: TaskFilters & { page?: number; limit?: number; parent_id?: string }): Promise<TaskListResponse> {
    return apiClient.get<TaskListResponse>(`/tasks${paramsOf(filter)}`);
  },
  async getAllTasks(filter?: TaskFilters, opts?: { cap?: number }): Promise<TaskListResponse> {
    const pageSize = 200;
    const cap = Math.max(pageSize, opts?.cap ?? pageSize);
    let page = 1;
    let items: Task[] = [];
    let total = 0;
    let stage_counts: TaskListResponse['stage_counts'];
    while (items.length < cap) {
      const res = await this.getTasks({ ...filter, page, limit: pageSize });
      total = res.total;
      stage_counts = res.stage_counts;
      items = items.concat(res.items || []);
      if (!res.items?.length || items.length >= total || res.items.length < pageSize) break;
      page += 1;
    }
    return {
      items: items.slice(0, cap),
      total,
      page: 1,
      limit: items.length,
      stage_counts,
      truncated: total > items.length,
    };
  },
  async getCounts(): Promise<TaskCounts> {
    return apiClient.get<TaskCounts>('/tasks/counts');
  },
  async getFollowUp(): Promise<Record<string, Task[]>> {
    return apiClient.get<Record<string, Task[]>>('/tasks/follow-up');
  },
  async getCalendar(from: string, to: string): Promise<{ items: Task[] }> {
    return apiClient.get<{ items: Task[] }>(`/tasks/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  },
  async getOverview(): Promise<TaskOverview> {
    return apiClient.get<TaskOverview>('/tasks/overview');
  },
  async getAssignable(taskId?: string): Promise<{ items: TaskAssignableUser[] }> {
    const q = taskId ? `?task_id=${encodeURIComponent(taskId)}` : '';
    return apiClient.get<{ items: TaskAssignableUser[] }>(`/tasks/assignable-users${q}`);
  },
  async getMentionable(taskId: string): Promise<{ items: TaskAssignableUser[] }> {
    return apiClient.get<{ items: TaskAssignableUser[] }>(`/tasks/${taskId}/mentionable`);
  },
  async getConversations(page = 1, limit = 30): Promise<{ items: TaskConversation[]; total: number }> {
    return apiClient.get<{ items: TaskConversation[]; total: number }>(`/tasks/conversations?page=${page}&limit=${limit}`);
  },
  async getChatUnread(): Promise<TaskChatUnread> {
    return apiClient.get<TaskChatUnread>('/tasks/chat/unread');
  },
  async markRead(taskId: string): Promise<{ ok: boolean }> {
    return apiClient.post<{ ok: boolean }>(`/tasks/${taskId}/read`, {});
  },
  async getCompanyActivity(params?: {
    type?: string;
    actor_id?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: TaskActivity[] }> {
    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    });
    const s = q.toString();
    return apiClient.get<{ items: TaskActivity[] }>(`/tasks/activity${s ? `?${s}` : ''}`);
  },
  async getSettings(): Promise<TaskSettings> {
    return apiClient.get<TaskSettings>('/tasks/settings');
  },
  async patchSettings(payload: Partial<TaskSettings>): Promise<TaskSettings> {
    return apiClient.patch<TaskSettings>('/tasks/settings', payload);
  },
  async getTask(id: string): Promise<Task> {
    return apiClient.get<Task>(`/tasks/${id}`);
  },
  async createTask(payload: Record<string, unknown>): Promise<Task> {
    const created = await apiClient.post<Task>('/tasks', payload);
    emitTasksChanged();
    return created;
  },
  async bulkImport(payload: { items: Record<string, unknown>[]; upsert_by_serial?: boolean }) {
    const res = await apiClient.post<{
      total_processed: number;
      inserted_count: number;
      updated_count: number;
      errors: string[];
    }>('/tasks/bulk-import', payload);
    emitTasksChanged();
    return res;
  },
  async patchTask(id: string, payload: Record<string, unknown>): Promise<Task> {
    const updated = await apiClient.patch<Task>(`/tasks/${id}`, payload);
    emitTasksChanged();
    return updated;
  },
  async changeStage(id: string, to: string, reason?: string): Promise<Task> {
    const updated = await apiClient.patch<Task>(`/tasks/${id}/stage`, { to, reason });
    emitTasksChanged();
    return updated;
  },
  async assign(id: string, assignee_id: string, note?: string): Promise<Task> {
    const updated = await apiClient.post<Task>(`/tasks/${id}/assign`, { assignee_id, note });
    emitTasksChanged();
    return updated;
  },
  async setBlocked(id: string, blocked: boolean, reason?: string): Promise<Task> {
    return apiClient.post<Task>(`/tasks/${id}/block`, { blocked, reason });
  },
  async cancel(id: string, reason: string): Promise<Task> {
    return apiClient.post<Task>(`/tasks/${id}/cancel`, { reason });
  },
  async remove(id: string): Promise<{ ok: boolean }> {
    return apiClient.delete<{ ok: boolean }>(`/tasks/${id}`);
  },
  async batch(items: Record<string, unknown>[]): Promise<{ results: { id: string; ok: boolean; error?: string }[] }> {
    const result = await apiClient.patch<{ results: { id: string; ok: boolean; error?: string }[] }>('/tasks/batch', { items });
    emitTasksChanged();
    return result;
  },
  async addChecklist(id: string, text: string): Promise<Task> {
    return apiClient.post<Task>(`/tasks/${id}/checklist`, { text });
  },
  async patchChecklist(id: string, itemId: string, payload: { text?: string; done?: boolean }): Promise<Task> {
    return apiClient.patch<Task>(`/tasks/${id}/checklist/${itemId}`, payload);
  },
  async deleteChecklist(id: string, itemId: string): Promise<Task> {
    return apiClient.delete<Task>(`/tasks/${id}/checklist/${itemId}`);
  },
  async addWatcher(id: string, user_id: string): Promise<Task> {
    return apiClient.post<Task>(`/tasks/${id}/watchers`, { user_id });
  },
  attachmentThumbUrl(id: string, aid: string): string {
    return `/api/v1/tasks/${id}/attachments/${aid}/thumb`;
  },
  async getComments(id: string, page = 1, limit = 50): Promise<{ items: TaskComment[]; total: number; page?: number }> {
    return apiClient.get<{ items: TaskComment[]; total: number; page?: number }>(`/tasks/${id}/comments?page=${page}&limit=${limit}`);
  },
  async addComment(id: string, text: string, opts?: { question?: boolean; add_watchers?: string[] }): Promise<TaskComment> {
    const comment = await apiClient.post<TaskComment>(`/tasks/${id}/comments`, { text, question: opts?.question, add_watchers: opts?.add_watchers });
    emitTasksChanged();
    return comment;
  },
  async getAttachments(id: string): Promise<{ items: TaskAttachment[] }> {
    return apiClient.get<{ items: TaskAttachment[] }>(`/tasks/${id}/attachments`);
  },
  async uploadAttachment(
    id: string,
    file: File,
    options?: { signal?: AbortSignal; onProgress?: (percent: number) => void },
  ): Promise<TaskAttachment> {
    const body = new FormData();
    body.append('file', file);
    return apiClient.upload<TaskAttachment>(`/tasks/${id}/attachments`, body, options);
  },
  async addLink(id: string, name: string, url: string): Promise<TaskAttachment> {
    return apiClient.post<TaskAttachment>(`/tasks/${id}/attachments/link`, { name, url });
  },
  async addDrive(id: string, file: DrivePickedFile): Promise<TaskAttachment> {
    return apiClient.post<TaskAttachment>(`/tasks/${id}/attachments/from-drive`, {
      drive_file_id: file.id,
      name: file.name,
      mime_type: file.mime_type,
      url: file.url,
      thumb: file.thumbnail_url,
      size_bytes: file.size_bytes,
    });
  },
  async deleteAttachment(id: string, aid: string): Promise<{ ok: boolean }> {
    return apiClient.delete<{ ok: boolean }>(`/tasks/${id}/attachments/${aid}`);
  },
  attachmentFileUrl(id: string, aid: string): string {
    return `/api/v1/tasks/${id}/attachments/${aid}/file`;
  },
  attachmentDownloadUrl(id: string, aid: string): string {
    return `/api/v1/tasks/${id}/attachments/${aid}/file?download=1`;
  },
  async pickerConfig(id: string): Promise<DrivePickerConfig> {
    return apiClient.get<DrivePickerConfig>(`/tasks/${id}/picker-config`);
  },
  async getActivity(id: string): Promise<{ items: TaskActivity[] }> {
    return apiClient.get<{ items: TaskActivity[] }>(`/tasks/${id}/activity`);
  },
  async getSavedViews(): Promise<{ items: TaskSavedView[] }> {
    return apiClient.get<{ items: TaskSavedView[] }>('/tasks/saved-views');
  },
  async createSavedView(payload: { name: string; view: string; filters: TaskFilters }): Promise<TaskSavedView> {
    return apiClient.post<TaskSavedView>('/tasks/saved-views', payload);
  },
  async deleteSavedView(id: string): Promise<{ ok: boolean }> {
    return apiClient.delete<{ ok: boolean }>(`/tasks/saved-views/${id}`);
  },
};
