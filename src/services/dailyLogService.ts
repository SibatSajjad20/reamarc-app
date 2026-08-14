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
      if (params.resource_name) searchParams.append('resource_name', params.resource_name);
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
};
