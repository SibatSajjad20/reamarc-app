import { apiClient } from './apiClient';
import { registerCacheClearer, subscribeInvalidation } from '../utils/cacheBus';
import type { TodayAttendanceResponse, PersonalTimesheetResponse, DailyMatrixResponse } from '../types/attendance';
import type { DayTarget } from '../types/dailyLog';

export interface CrmSummarySection {
  stages: Record<string, number>;
  total: number;
  overdueFollowUps?: number;
  unassigned?: number;
}

export interface ContentSummarySection {
  stages: Record<string, number>;
  activeTotal: number;
}

export interface WebsiteSummarySection {
  stages: Record<string, number>;
  total: number;
}

export interface ApprovalsSummarySection {
  pendingLeaves: number;
  pendingMissedPunch: number;
  pendingLogExceptions: number;
}

export interface AttendanceTodaySummarySection {
  present: number;
  late: number;
  remote: number;
  absent: number;
  onLeave: number;
}

export interface LogsSummarySection {
  missingToday: number;
  missingYesterday: number;
}

export interface DashboardSummaryResponse {
  crm?: CrmSummarySection;
  content?: ContentSummarySection;
  website?: WebsiteSummarySection;
  approvals?: ApprovalsSummarySection;
  attendanceToday?: AttendanceTodaySummarySection;
  logs?: LogsSummarySection;
  meta: {
    generatedAt: string;
    role: string;
    department?: string | null;
  };
}

export interface DashboardBootstrapResponse {
  summary: DashboardSummaryResponse;
  todayAttendance: TodayAttendanceResponse | null;
  timesheet: PersonalTimesheetResponse | null;
  matrix: DailyMatrixResponse | null;
  dayTarget: DayTarget | null;
  weeklyLogs: Array<{ date: string; hours: number }>;
  meta: {
    generatedAt: string;
    companyId: string;
    weekStart: string;
    today: string;
  };
}

class DashboardService {
  private summaryCache = new Map<string, { data: DashboardSummaryResponse; cachedAt: number }>();
  private bootstrapCache = new Map<string, { data: DashboardBootstrapResponse; cachedAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  public async getSummary(force = false, companyId = 'unknown'): Promise<DashboardSummaryResponse> {
    const key = `${companyId}:dashboard-summary`;
    const entry = this.summaryCache.get(key);
    if (!force && entry && Date.now() - entry.cachedAt < this.CACHE_TTL_MS) {
      return entry.data;
    }
    const data = await apiClient.get<DashboardSummaryResponse>('/dashboard/summary');
    this.summaryCache.set(key, { data, cachedAt: Date.now() });
    return data;
  }

  public getCachedSummary(companyId = 'unknown'): DashboardSummaryResponse | null {
    const entry = this.summaryCache.get(`${companyId}:dashboard-summary`);
    if (!entry) return null;
    return entry.data;
  }

  public getCachedBootstrap(companyId: string): DashboardBootstrapResponse | null {
    const entry = this.bootstrapCache.get(companyId);
    if (!entry || Date.now() - entry.cachedAt > this.CACHE_TTL_MS) return null;
    return entry.data;
  }

  public async getBootstrap(companyId: string, force = false): Promise<DashboardBootstrapResponse> {
    const cached = this.bootstrapCache.get(companyId);
    if (!force && cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.data;
    }
    const data = await apiClient.get<DashboardBootstrapResponse>('/dashboard/bootstrap');
    this.bootstrapCache.set(companyId, { data, cachedAt: Date.now() });
    this.summaryCache.set(`${companyId}:dashboard-summary`, {
      data: data.summary,
      cachedAt: Date.now(),
    });
    return data;
  }

  public clearCache(): void {
    this.summaryCache.clear();
    this.bootstrapCache.clear();
  }
}

export const dashboardService = new DashboardService();
registerCacheClearer(() => dashboardService.clearCache());
subscribeInvalidation(['attendance', 'daily-log', 'dashboard'], () => dashboardService.clearCache());
