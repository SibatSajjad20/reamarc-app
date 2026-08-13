/**
 * Custom hook for fetching Executive Command Center dashboard summary metrics.
 * Manages date range filter, workspace context, and AbortController request cancellation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { dashboardService, type DashboardSummary } from '../services/dashboardService';
import { apiClient } from '../services/apiClient';

export function useDashboard(workspaceId?: string) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Default date range: Last 30 days
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });

  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSummary = useCallback(async (sDate?: string, eDate?: string, wsId?: string) => {
    const activeStart = sDate || startDate;
    const activeEnd = eDate || endDate;
    const activeWs = wsId !== undefined ? wsId : workspaceId;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      apiClient.setWorkspaceId(activeWs || null);
      const data = await dashboardService.getSummary(activeWs, activeStart, activeEnd, controller.signal);
      setSummary(data);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Request aborted.') {
        return;
      }
      setError(err.message || 'Failed to load dashboard summary.');
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, [startDate, endDate, workspaceId]);

  useEffect(() => {
    fetchSummary(startDate, endDate, workspaceId);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [workspaceId, startDate, endDate, fetchSummary]);

  return {
    summary,
    isLoading,
    error,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    refetch: () => fetchSummary(startDate, endDate, workspaceId),
  };
}
