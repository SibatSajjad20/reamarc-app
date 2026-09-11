import { apiClient } from './apiClient';
import type { LogExceptionItem, OperatingSnapshot, EmployeeComplianceDetailResponse } from '../types/dailyLog';

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

  async getSnapshot(
    date?: string,
    range: 'today' | 'week' | 'range' = 'today',
    startDate?: string,
    endDate?: string,
  ): Promise<OperatingSnapshot> {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (range) params.set('range', range);
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    const q = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<OperatingSnapshot>(`/log-exceptions/snapshot${q}`);
  },

  async getEmployeeComplianceDetail(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<EmployeeComplianceDetailResponse> {
    const params = new URLSearchParams({
      user_id: userId,
      start_date: startDate,
      end_date: endDate,
    });
    return apiClient.get<EmployeeComplianceDetailResponse>(`/log-exceptions/employee-detail?${params.toString()}`);
  },
};

