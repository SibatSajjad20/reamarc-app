import { apiClient } from './apiClient';
import type {
  DailyLogEntry,
  DailyLogColumn,
  CreateDailyLogEntryPayload,
  UpdateDailyLogEntryPayload,
  GetDailyLogEntriesParams,
} from '../types/dailyLog';

export const dailyLogService = {
  async getColumns(): Promise<DailyLogColumn[]> {
    return apiClient.get<DailyLogColumn[]>('/daily-log/columns');
  },

  async updateColumns(columns: DailyLogColumn[]): Promise<DailyLogColumn[]> {
    return apiClient.put<DailyLogColumn[]>('/daily-log/columns', columns);
  },

  async getSheets(): Promise<string[]> {
    return apiClient.get<string[]>('/daily-log/sheets');
  },

  async getEntries(params?: GetDailyLogEntriesParams | string): Promise<DailyLogEntry[]> {
    let queryString = '';
    if (typeof params === 'string') {
      queryString = `?month_sheet=${encodeURIComponent(params)}`;
    } else if (params) {
      const searchParams = new URLSearchParams();
      if (params.month_sheet) searchParams.append('month_sheet', params.month_sheet);
      if (params.start_date) searchParams.append('start_date', params.start_date);
      if (params.end_date) searchParams.append('end_date', params.end_date);
      if (params.department) searchParams.append('department', params.department);
      if (params.user_id) searchParams.append('user_id', params.user_id);
      if (params.resource_name) searchParams.append('resource_name', params.resource_name);
      if (params.client_project) searchParams.append('client_project', params.client_project);
      if (params.task_status) searchParams.append('task_status', params.task_status);
      if (params.task_type) searchParams.append('task_type', params.task_type);
      if (params.limit !== undefined) searchParams.append('limit', String(params.limit));
      if (params.skip !== undefined) searchParams.append('skip', String(params.skip));
      const str = searchParams.toString();
      if (str) queryString = `?${str}`;
    }
    return apiClient.get<DailyLogEntry[]>(`/daily-log/entries${queryString}`);
  },

  async createEntry(payload: CreateDailyLogEntryPayload): Promise<DailyLogEntry> {
    return apiClient.post<DailyLogEntry>('/daily-log/entries', payload);
  },

  async updateEntry(id: string, payload: UpdateDailyLogEntryPayload): Promise<DailyLogEntry> {
    return apiClient.put<DailyLogEntry>(`/daily-log/entries/${id}`, payload);
  },

  async deleteEntry(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/daily-log/entries/${id}`);
  },

  async getMyLogActivity(days: number = 7): Promise<import('../types/dailyLog').UserLogActivity> {
    return apiClient.get<import('../types/dailyLog').UserLogActivity>(`/daily-log/my-activity?days=${days}`);
  },

  async uploadDeliverableFile(file: File): Promise<{ file_url: string; file_name: string; file_size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload<{ file_url: string; file_name: string; file_size: number }>('/daily-log/upload', formData);
  },
};


