import { apiClient } from './apiClient';
import { registerCacheClearer, subscribeInvalidation } from '../utils/cacheBus';
import { isBootstrapMissing } from '../utils/bootstrapCompat';
import { attendanceService } from './attendanceService';
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
  summary: DashboardSummaryResponse | null;
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
  private readonly CACHE_TTL_MS = 60 * 1000;
  private bootstrapMissing = false;
  private revalidating = new Set<string>();

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
    const key = `${companyId}:dashboard-bootstrap`;
    const entry = this.bootstrapCache.get(key);
    if (!entry || Date.now() - entry.cachedAt > this.CACHE_TTL_MS) return null;
    return entry.data;
  }

  public async getBootstrap(companyId: string, force = false): Promise<DashboardBootstrapResponse> {
    const key = `${companyId}:dashboard-bootstrap`;
    const cached = this.bootstrapCache.get(key);
    if (!force && cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      this.scheduleSilentRevalidate(companyId);
      return cached.data;
    }
    return this.fetchBootstrap(companyId);
  }

  private scheduleSilentRevalidate(companyId: string): void {
    const key = `${companyId}:dashboard-bootstrap`;
    if (this.revalidating.has(key)) return;
    this.revalidating.add(key);
    window.setTimeout(() => {
      void this.fetchBootstrap(companyId)
        .catch(() => undefined)
        .finally(() => this.revalidating.delete(key));
    }, 2500);
  }

  private remember(companyId: string, data: DashboardBootstrapResponse): DashboardBootstrapResponse {
    const key = `${companyId}:dashboard-bootstrap`;
    this.bootstrapCache.set(key, { data, cachedAt: Date.now() });
    if (data.summary) {
      this.summaryCache.set(`${companyId}:dashboard-summary`, {
        data: data.summary,
        cachedAt: Date.now(),
      });
    }
    return data;
  }

  private async fetchBootstrap(companyId: string): Promise<DashboardBootstrapResponse> {
    if (this.bootstrapMissing) {
      return this.remember(companyId, await this.legacyBootstrap(companyId));
    }
    try {
      const data = await apiClient.get<DashboardBootstrapResponse>('/dashboard/bootstrap');
      return this.remember(companyId, {
        ...data,
        matrix: null,
        summary: data.summary ?? {
          meta: { generatedAt: new Date().toISOString(), role: '' },
        },
      });
    } catch (error) {
      if (isBootstrapMissing(error) && !this.bootstrapMissing) {
        this.bootstrapMissing = true;
        return this.remember(companyId, await this.legacyBootstrap(companyId));
      }
      throw error;
    }
  }

  private async legacyBootstrap(companyId: string): Promise<DashboardBootstrapResponse> {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const [todayAttendance, timesheet] = await Promise.all([
      attendanceService.getTodayStatus().catch(() => null),
      attendanceService.getMyTimesheet(now.getFullYear(), now.getMonth() + 1).catch(() => null),
    ]);
    return {
      summary: { meta: { generatedAt: now.toISOString(), role: '' } },
      todayAttendance,
      timesheet,
      matrix: null,
      dayTarget: null,
      weeklyLogs: [],
      meta: {
        generatedAt: now.toISOString(),
        companyId,
        weekStart: today,
        today,
      },
    };
  }

  public clearCache(): void {
    this.summaryCache.clear();
    this.bootstrapCache.clear();
    this.bootstrapMissing = false;
    this.revalidating.clear();
  }
}

export const dashboardService = new DashboardService();
registerCacheClearer(() => dashboardService.clearCache());
subscribeInvalidation(['attendance', 'daily-log', 'dashboard'], () => dashboardService.clearCache());
