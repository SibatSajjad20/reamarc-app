/**
 * Marketing Service — API client methods for the Performance Marketing Module.
 * Follows the same pattern as campaignService.ts and matrixService.ts.
 */

import { apiClient } from './apiClient';
import type { MarketingMatrixRow } from '../types';

export interface MarketingCampaignCreatePayload {
  campaign_name: string;
  platform: string;
  objective: string;
  industry?: string;
  budget_set?: number;
  workspace_id: string;
}

export interface MetricUpsertPayload {
  campaign_id: string;
  date: string;
  ad_spend?: number;
  cpl_cpa?: number;
  leads_conversions?: number;
  impressions?: number;
  clicks?: number;
  reach?: number;
  avg_frequency?: number;
  remarks?: string;
  budget_set?: number;
  status?: string;
}

export interface MarketingCampaignResponse {
  id: string;
  workspace_id: string;
  campaign_name: string;
  platform: string;
  objective: string;
  industry: string;
  budget_set: number;
  status: string;
  created_at: string;
}

export const marketingService = {
  /** Fetch daily matrix rows (campaign + metrics) for a specific date with optional includeInactive toggle and AbortSignal. */
  async getDaily(date?: string, includeInactive: boolean = false, signal?: AbortSignal): Promise<{ rows: MarketingMatrixRow[]; hiddenCount: number }> {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (includeInactive) params.append('include_inactive', 'true');

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.requestWithHeaders<MarketingMatrixRow[]>(`/marketing/daily${queryString}`, { method: 'GET', timeout: 20000, signal });
    const hiddenCount = parseInt(res.headers.get('x-hidden-count') || res.headers.get('X-Hidden-Count') || '0', 10);
    return { rows: res.data || [], hiddenCount };
  },

  /** Create a new marketing campaign. */
  async createCampaign(payload: MarketingCampaignCreatePayload): Promise<MarketingCampaignResponse> {
    return apiClient.post<MarketingCampaignResponse>('/marketing/campaigns', payload);
  },

  /** Upsert daily metrics for a campaign on a specific date. */
  async upsertMetric(payload: MetricUpsertPayload): Promise<any> {
    return apiClient.post('/marketing/daily/upsert', payload);
  },

  /** Update campaign static fields (name, budget, status, etc.). */
  async updateCampaign(id: string, payload: Partial<MarketingCampaignResponse>): Promise<MarketingCampaignResponse> {
    return apiClient.patch<MarketingCampaignResponse>(`/marketing/campaigns/${id}`, payload);
  },

  /** Manually trigger immediate API sync for Meta & Google Ads. */
  async syncNow(date?: string, workspace_id?: string, includeInactive: boolean = false): Promise<{ message: string; synced_campaigns_count: number; synced_metrics_count: number; date: string; errors: string[]; rows?: MarketingMatrixRow[]; hidden_count?: number }> {
    const params = includeInactive ? '?include_inactive=true' : '';
    return apiClient.post(`/marketing/sync-now${params}`, { date, workspace_id, include_inactive: includeInactive }, { timeout: 120000 });
  },

  /** Query real-time background sync job status. */
  async getSyncStatus(workspaceId?: string): Promise<{
    status: 'idle' | 'processing' | 'completed' | 'error';
    message: string;
    synced_campaigns_count: number;
    synced_metrics_count: number;
    date: string;
    errors: string[];
  }> {
    const params = workspaceId ? `?workspace_id=${workspaceId}` : '';
    return apiClient.get(`/marketing/sync-status${params}`);
  },

  /** Get registered ad credentials for a workspace. */
  async getCredentials(workspaceId?: string): Promise<any[]> {
    const params = workspaceId ? `?workspace_id=${workspaceId}` : '';
    return apiClient.get(`/marketing/credentials${params}`);
  },

  /** Save or update ad account credentials. */
  async saveCredential(payload: {
    workspace_id?: string;
    workspace_name?: string;
    platform: string;
    account_id: string;
    access_token?: string;
    refresh_token?: string;
    developer_token?: string;
    client_id?: string;
    client_secret?: string;
    is_active?: boolean;
  }): Promise<any> {
    return apiClient.post('/marketing/credentials', payload);
  },

  /** Delete an ad account credential. */
  async deleteCredential(credentialId: string): Promise<any> {
    return apiClient.delete(`/marketing/credentials/${credentialId}`);
  },
};
