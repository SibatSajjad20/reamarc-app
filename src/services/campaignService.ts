import { apiClient } from './apiClient';
import type { Campaign, PlatformType, ToneType } from '../types';

export interface CreateCampaignPayload {
  title: string;
  target_audience?: string;
  tone?: ToneType;
  workspace_id?: string;
  platforms?: PlatformType[];
  plan?: any[];
  status?: string;
  duration_days?: number;
  durationDays?: number;
  campaignType?: string;
  offer?: string;
  cta?: string;
  painPoints?: string;
  customPrompt?: string;
  matrixRows?: any[];
}

export interface GenerateMatrixPayload {
  title: string;
  campaignType?: string;
  targetAudience: string;
  tone: ToneType;
  offer?: string;
  cta?: string;
  painPoints?: string;
  durationDays: number;
  platforms: PlatformType[];
  customPrompt?: string;
  workspaceId: string;
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
    matrixRows: raw.matrixRows || [],
  };
}

export const campaignService = {
  async getCampaigns(workspaceId?: string, skip: number = 0, limit: number = 50): Promise<Campaign[]> {
    const params = new URLSearchParams();
    if (workspaceId) params.append('workspaceId', workspaceId);
    if (skip > 0) params.append('skip', skip.toString());
    if (limit !== 50) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    const rawList = await apiClient.get<any[]>(`/campaigns${query}`);
    return (rawList || []).map(transformCampaign);
  },

  async previewPlan(payload: CreateCampaignPayload): Promise<any[]> {
    return apiClient.post<any[]>('/campaigns/preview-plan', payload, { timeout: 60000 });
  },

  async generateMatrix(payload: GenerateMatrixPayload): Promise<Campaign> {
    const raw = await apiClient.post<any>('/campaigns/generate-matrix', payload, { timeout: 90000 });
    return transformCampaign(raw);
  },

  async getMatrix(campaignId: string): Promise<{ campaignId: string; matrixRows: any[] }> {
    return apiClient.get<{ campaignId: string; matrixRows: any[] }>(`/campaigns/${campaignId}/matrix`);
  },

  async updateMatrix(campaignId: string, matrixRows: any[]): Promise<{ message: string; rowCount: number }> {
    return apiClient.patch<{ message: string; rowCount: number }>(`/campaigns/${campaignId}/matrix`, { matrixRows });
  },

  async createCampaign(payload: CreateCampaignPayload): Promise<Campaign> {
    const raw = await apiClient.post<any>('/campaigns', payload, { timeout: 60000 });
    return transformCampaign(raw);
  },

  async deleteCampaign(campaignId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/campaigns/${campaignId}`);
  },

  async activateCampaign(campaignId: string): Promise<Campaign> {
    const raw = await apiClient.post<any>(`/campaigns/${campaignId}/activate`, {});
    return transformCampaign(raw);
  },

  async updateDayPlanItem(campaignId: string, dayNumber: number, payload: DayPlanUpdatePayload): Promise<Campaign> {
    const raw = await apiClient.patch<any>(`/campaigns/${campaignId}/plan/${dayNumber}`, payload);
    return transformCampaign(raw);
  },

  async regenerateDayPlanItem(campaignId: string, dayNumber: number): Promise<Campaign> {
    const raw = await apiClient.post<any>(`/campaigns/${campaignId}/plan/${dayNumber}/regenerate`, {}, { timeout: 60000 });
    return transformCampaign(raw);
  },
};
