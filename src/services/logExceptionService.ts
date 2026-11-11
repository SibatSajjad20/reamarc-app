import { apiClient } from './apiClient';
import { BoundedCache, type CacheEntry } from '../utils/cache';
import { emitInvalidation, registerCacheClearer } from '../utils/cacheBus';
import type { LogExceptionItem, OperatingSnapshot, EmployeeComplianceDetailResponse } from '../types/dailyLog';

export type LogExceptionType =
  | 'no_log'
  | 'large_variance'
  | 'over_logged'
  | 'missing_checkout'
  | 'logged_on_leave_or_off'
  | 'logged_without_attendance'
  | string;

const exceptionsCache = new BoundedCache<LogExceptionItem[]>(5);

export const logExceptionService = {
  async getInbox(date?: string, startDate?: string, endDate?: string): Promise<LogExceptionItem[]> {
    const params = new URLSearchParams();
    if (startDate && endDate) {
      params.set('start_date', startDate);
      params.set('end_date', endDate);
    } else if (date) {
      params.set('date', date);
    }
    const q = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get<LogExceptionItem[]>(`/log-exceptions/inbox${q}`);
    const key = startDate && endDate ? `${startDate}_${endDate}` : (date || 'today');
    if (res) {
      exceptionsCache.set(key, res);
    }
    return res;
  },

  getCachedInbox(date?: string, startDate?: string, endDate?: string): CacheEntry<LogExceptionItem[]> | undefined {
    const key = startDate && endDate ? `${startDate}_${endDate}` : (date || 'today');
    return exceptionsCache.get(key);
  },

  setCachedInbox(data: LogExceptionItem[], date?: string, startDate?: string, endDate?: string): void {
    const key = startDate && endDate ? `${startDate}_${endDate}` : (date || 'today');
    exceptionsCache.set(key, data);
  },

  clearAllCaches(): void {
    exceptionsCache.clear();
  },

  async act(
    scoreId: string,
    action: 'explain' | 'correct' | 'review' | 'escalate' | 'accept' | 'ask_again',
  ): Promise<{ success: boolean; action_status: string; notified: boolean; emailed: boolean; already_requested: boolean }> {
    const res = await apiClient.post<{ success: boolean; action_status: string; notified: boolean; emailed: boolean; already_requested: boolean }>(
      `/log-exceptions/inbox/${encodeURIComponent(scoreId)}/actions`,
      { action }
    );
    exceptionsCache.clear();
    emitInvalidation(['exceptions', 'dashboard', 'daily-log']);
    return res;
  },

  async submitReason(date: string, reason: string): Promise<{ success: boolean; action_status: string; date: string }> {
    const res = await apiClient.post<{ success: boolean; action_status: string; date: string }>(
      '/log-exceptions/my-reason',
      { date, reason }
    );
    exceptionsCache.clear();
    emitInvalidation(['exceptions', 'dashboard', 'daily-log']);
    return res;
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

// Register for app-wide cache sweep on logout and user switch
registerCacheClearer(() => logExceptionService.clearAllCaches());
