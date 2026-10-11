import { apiClient } from './apiClient';
import { registerCacheClearer } from '../utils/cacheBus';

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

class DashboardService {
  private summaryCache = new Map<string, { data: DashboardSummaryResponse; cachedAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  public async getSummary(force = false): Promise<DashboardSummaryResponse> {
    const key = 'dashboard-summary';
    const entry = this.summaryCache.get(key);
    if (!force && entry && Date.now() - entry.cachedAt < this.CACHE_TTL_MS) {
      return entry.data;
    }
    const data = await apiClient.get<DashboardSummaryResponse>('/dashboard/summary');
    this.summaryCache.set(key, { data, cachedAt: Date.now() });
    return data;
  }

  public getCachedSummary(): DashboardSummaryResponse | null {
    const entry = this.summaryCache.get('dashboard-summary');
    if (!entry) return null;
    return entry.data;
  }

  public clearCache(): void {
    this.summaryCache.clear();
  }
}

export const dashboardService = new DashboardService();
registerCacheClearer(() => dashboardService.clearCache());
