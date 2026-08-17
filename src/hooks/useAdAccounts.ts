import { useState, useEffect, useCallback } from 'react';
import type { AdAccount } from '../types/admin';
import { adminService } from '../services/adminService';
import { apiClient } from '../services/apiClient';

export function useAdAccounts(enabled: boolean = true) {
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selectedAdAccount, setSelectedAdAccountState] = useState<AdAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAdAccounts = useCallback(async () => {
    if (!enabled) return;
    try {
      setIsLoading(true);
      const data = await adminService.getAdAccounts();
      if (data) {
        const sorted = [...data].sort((a, b) =>
          (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );
        setAdAccounts(sorted);

        const savedId = localStorage.getItem('reamarc_selected_ad_account_id');
        if (savedId && savedId !== 'ALL') {
          const found = sorted.find((a) => a.id === savedId);
          if (found) {
            setSelectedAdAccountState(found);
            apiClient.setWorkspaceId(found.id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load ad accounts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchAdAccounts();
  }, [fetchAdAccounts]);

  const setSelectedAdAccount = useCallback((acc: AdAccount | null) => {
    setSelectedAdAccountState(acc);
    apiClient.setWorkspaceId(acc?.id || null);
    if (acc) {
      localStorage.setItem('reamarc_selected_ad_account_id', acc.id);
    } else {
      localStorage.setItem('reamarc_selected_ad_account_id', 'ALL');
    }
  }, []);

  return {
    adAccounts,
    selectedAdAccount,
    setSelectedAdAccount,
    isLoading,
    refetch: fetchAdAccounts,
  };
}
