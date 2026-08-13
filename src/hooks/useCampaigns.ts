import { useState, useEffect, useCallback } from 'react';
import type { Campaign } from '../types';
import { campaignService, type GenerateMatrixPayload } from '../services/campaignService';
import { useAsync } from './useAsync';

export function useCampaigns(workspaceId?: string) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const fetchFn = useCallback(() => campaignService.getCampaigns(workspaceId), [workspaceId]);
  const { isLoading, error, execute } = useAsync(fetchFn);

  const fetchCampaigns = useCallback(async () => {
    const data = await execute();
    if (data) {
      setCampaigns(data);
    } else {
      setCampaigns([]);
    }
  }, [execute]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const addCampaign = async (payload: {
    title: string;
    target_audience: string;
    tone: any;
    workspace_id: string;
    platforms: any[];
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
  }) => {
    const created = await campaignService.createCampaign({
      ...payload,
      status: payload.status || 'Active',
    });
    setCampaigns((prev) => [created, ...prev]);
    return created;
  };

  const generateMatrixCampaign = async (payload: GenerateMatrixPayload) => {
    const created = await campaignService.generateMatrix(payload);
    setCampaigns((prev) => [created, ...prev]);
    return created;
  };

  const deleteCampaign = async (id: string) => {
    await campaignService.deleteCampaign(id);
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
  };

  const updateCampaign = (updated: Campaign) => {
    setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  return {
    campaigns,
    isLoading,
    error: error ? (error.message || 'Failed to fetch campaigns.') : null,
    refetch: fetchCampaigns,
    addCampaign,
    generateMatrixCampaign,
    deleteCampaign,
    updateCampaign,
    setCampaigns,
  };
}
