/**
 * Dashboard Service for Executive Command Center.
 * Fetches aggregated performance KPIs, action queue, and workspace health.
 */

import { apiClient } from './apiClient';

export interface PerformanceKPIs {
  ad_spend: number;
  leads_conversions: number;
  blended_cpa: number;
  active_campaigns_count: number;
  currency?: string;
  currency_symbol?: string;
  is_normalized?: boolean;
}

export interface ActionQueueItem {
  id: string;
  title: string;
  workspace_name: string;
  status: string;
  updated_at?: string;
  platform?: string;
  message?: string;
}

export interface ActionQueue {
  pending_approvals: ActionQueueItem[];
  system_alerts: ActionQueueItem[];
}

export interface RAGFileSummary {
  id: string;
  name: string;
  type: string;
  workspace_name: string;
  date_added: string;
}

export interface WorkspaceHealth {
  total_workspaces: number;
  total_users: number;
  recent_rag_files: RAGFileSummary[];
}

export interface DashboardSummary {
  performance_kpis: PerformanceKPIs;
  action_queue: ActionQueue;
  workspace_health: WorkspaceHealth;
}

export const dashboardService = {
  /** Fetch dashboard summary metrics with optional workspace and date range filters */
  async getSummary(
    workspaceId?: string | null,
    startDate?: string,
    endDate?: string,
    signal?: AbortSignal
  ): Promise<DashboardSummary> {
    const params = new URLSearchParams();
    if (workspaceId && workspaceId !== 'ALL') {
      params.append('workspace_id', workspaceId);
    }
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<DashboardSummary>(`/dashboard/summary${queryStr}`, { signal });
  },
};
