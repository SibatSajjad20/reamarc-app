import { apiClient } from './apiClient';
import type { Campaign, PlatformType, ToneType } from '../types';

export interface CreateCampaignPayload {
  title: string;
  target_audience?: string;
  tone?: ToneType;
  workspace_id?: string;
  platforms?: PlatformType[];
}

export interface DayPlanUpdatePayload {
  topic?: string;
  platform?: string;
  preview?: string;
}

function transformCampaign(raw: any): Campaign {
  return {
    id: raw.id,
    title: raw.title || 'Untitled Campaign',
    status: raw.status || 'Active',
    currentDay: raw.currentDay ?? raw.current_day ?? 1,
    totalDays: raw.totalDays ?? raw.total_days ?? 7,
    workspaceId: raw.workspaceId ?? raw.workspace_id ?? 'ws-1',
    platforms: raw.platforms || [],
    targetAudience: raw.targetAudience ?? raw.target_audience ?? '',
    tone: raw.tone || 'Punchy',
    createdAt: raw.createdAt ?? raw.created_at ?? 'Today',
    plan: raw.plan || [],
  };
}

export const campaignService = {
  async getCampaigns(workspaceId?: string): Promise<Campaign[]> {
    const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
    const rawList = await apiClient.get<any[]>(`/campaigns${query}`);
    return (rawList || []).map(transformCampaign);
  },

  async createCampaign(payload: CreateCampaignPayload): Promise<Campaign> {
    const raw = await apiClient.post<any>('/campaigns', payload);
    return transformCampaign(raw);
  },

  async deleteCampaign(campaignId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/campaigns/${campaignId}`);
  },

  async updateDayPlanItem(campaignId: string, dayNumber: number, payload: DayPlanUpdatePayload): Promise<Campaign> {
    const raw = await apiClient.patch<any>(`/campaigns/${campaignId}/plan/${dayNumber}`, payload);
    return transformCampaign(raw);
  },

  async regenerateDayPlanItem(campaignId: string, dayNumber: number): Promise<Campaign> {
    const raw = await apiClient.post<any>(`/campaigns/${campaignId}/plan/${dayNumber}/regenerate`, {});
    return transformCampaign(raw);
  },
};
