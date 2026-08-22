/**
 * useMarketingMatrix — Data-fetching hook for the Performance Marketing grid.
 * Manages date state, debounced fetching, AbortController request cancellation,
 * and metric upsert handlers.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MarketingMatrixRow } from '../types';
import { marketingService, type MetricUpsertPayload, type MarketingCampaignCreatePayload } from '../services/marketingService';
import { apiClient } from '../services/apiClient';
import { useDebounce } from './useDebounce';

export function useMarketingMatrix(workspaceId?: string) {
  const [rows, setRows] = useState<MarketingMatrixRow[]>([]);
  const [hiddenCount, setHiddenCount] = useState<number>(0);
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
  });

  // Debounce date changes by 400ms to prevent rapid API requests
  const debouncedDate = useDebounce(selectedDate, 400);

  // Store active AbortController for in-flight GET requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchDaily = useCallback(async (date?: string, includeInactiveOverride?: boolean) => {
    const targetDate = date || debouncedDate;
    const activeIncludeInactive = includeInactiveOverride !== undefined ? includeInactiveOverride : showInactive;

    // Abort previous in-flight request if present
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      // Strictly DB-only read, passing AbortController signal
      const { rows: data, hiddenCount: hidden } = await marketingService.getDaily(
        targetDate,
        activeIncludeInactive,
        controller.signal
      );
      
      setRows(data || []);
      setHiddenCount(hidden || 0);
    } catch (err: any) {
      // If request was canceled by AbortController, ignore error silently
      if (err.name === 'AbortError' || err.message === 'Request aborted.') {
        return;
      }
      setError(err.message || 'Failed to fetch marketing data.');
      setRows([]);
      setHiddenCount(0);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, [debouncedDate, showInactive]);

  useEffect(() => {
    apiClient.setWorkspaceId(workspaceId || null);
    fetchDaily(debouncedDate);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [debouncedDate, workspaceId, fetchDaily]);

  const toggleShowInactive = useCallback(() => {
    setShowInactive((prev) => {
      const nextVal = !prev;
      fetchDaily(debouncedDate, nextVal);
      return nextVal;
    });
  }, [fetchDaily, debouncedDate]);

  const changeDate = useCallback((newDate: string) => {
    setSelectedDate(newDate);
  }, []);

  const upsertMetric = useCallback(async (payload: MetricUpsertPayload) => {
    try {
      await marketingService.upsertMetric(payload);
      // Optimistically update local row state
      setRows((prev) =>
        prev.map((row) => {
          if (row.campaign_id === payload.campaign_id) {
            const updated = { ...row };
            if (payload.ad_spend !== undefined) updated.ad_spend = payload.ad_spend;
            if (payload.cpl_cpa !== undefined) updated.cpl_cpa = payload.cpl_cpa;
            if (payload.leads_conversions !== undefined) updated.leads_conversions = payload.leads_conversions;
            if (payload.impressions !== undefined) updated.impressions = payload.impressions;
            if (payload.clicks !== undefined) updated.clicks = payload.clicks;
            if (payload.reach !== undefined) updated.reach = payload.reach;
            if (payload.avg_frequency !== undefined) updated.avg_frequency = payload.avg_frequency;
            if (payload.remarks !== undefined) updated.remarks = payload.remarks;
            if (payload.budget_set !== undefined) updated.budget_set = payload.budget_set;
            if (payload.status !== undefined) updated.status = payload.status as any;
            if (payload.ad_spend !== undefined && updated.leads_conversions > 0) {
              updated.cpl_cpa = Math.round((updated.ad_spend / updated.leads_conversions) * 100) / 100;
            }
            if (payload.leads_conversions !== undefined && updated.ad_spend > 0 && payload.leads_conversions > 0) {
              updated.cpl_cpa = Math.round((updated.ad_spend / payload.leads_conversions) * 100) / 100;
            }
            return updated;
          }
          return row;
        })
      );
    } catch (err: any) {
      throw err;
    }
  }, []);

  const addCampaign = useCallback(async (payload: MarketingCampaignCreatePayload) => {
    const created = await marketingService.createCampaign(payload);
    await fetchDaily(selectedDate);
    return created;
  }, [fetchDaily, selectedDate]);

  const triggerSyncNow = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await marketingService.syncNow(selectedDate, workspaceId, showInactive);
      // Refetch from database once background task is queued or completed
      await fetchDaily(selectedDate);
      return res;
    } catch (err: any) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchDaily, selectedDate, workspaceId, showInactive]);

  return {
    rows,
    hiddenCount,
    showInactive,
    toggleShowInactive,
    isLoading,
    error,
    selectedDate,
    changeDate,
    upsertMetric,
    addCampaign,
    triggerSyncNow,
    refetch: () => fetchDaily(selectedDate),
  };
}
