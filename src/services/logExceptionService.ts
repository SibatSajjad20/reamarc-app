import { apiClient } from './apiClient';
import type { LogExceptionItem, OperatingSnapshot } from '../types/dailyLog';

export const logExceptionService = {
  async getInbox(date?: string): Promise<LogExceptionItem[]> {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return apiClient.get<LogExceptionItem[]>(`/log-exceptions/inbox${q}`);
  },

  async act(
    scoreId: string,
    action: 'explain' | 'correct' | 'review' | 'escalate' | 'accept' | 'ask_again',
  ): Promise<{ success: boolean; action_status: string; notified: boolean; emailed: boolean; already_requested: boolean }> {
    return apiClient.post(`/log-exceptions/inbox/${encodeURIComponent(scoreId)}/actions`, { action });
  },

  async submitReason(date: string, reason: string): Promise<{ success: boolean; action_status: string; date: string }> {
    return apiClient.post('/log-exceptions/my-reason', { date, reason });
  },

  async getSnapshot(date?: string, range: 'today' | 'week' = 'today'): Promise<OperatingSnapshot> {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (range) params.set('range', range);
    const q = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<OperatingSnapshot>(`/log-exceptions/snapshot${q}`);
  },
};
