import { apiClient } from './apiClient';
import type { DailyLogEntry, DailyLogColumn, CreateDailyLogEntryPayload } from '../types/dailyLog';

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

  async getEntries(monthSheet?: string): Promise<DailyLogEntry[]> {
    const query = monthSheet ? `?month_sheet=${encodeURIComponent(monthSheet)}` : '';
    return apiClient.get<DailyLogEntry[]>(`/daily-log/entries${query}`);
  },

  async createEntry(payload: CreateDailyLogEntryPayload): Promise<DailyLogEntry> {
    return apiClient.post<DailyLogEntry>('/daily-log/entries', payload);
  },

  async updateEntry(id: string, payload: Partial<DailyLogEntry>): Promise<DailyLogEntry> {
    return apiClient.put<DailyLogEntry>(`/daily-log/entries/${id}`, payload);
  },

  async deleteEntry(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/daily-log/entries/${id}`);
  },
};
