import React, { useState, useEffect, useCallback, useRef } from 'react';
import { financeService } from '../../services/financeService';
import { workspaceService } from '../../services/workspaceService';
import { formatMinorMoney } from '../../utils/money';
import type { CollectionsReport } from '../../types/finance';
import type { Workspace } from '../../types';
import { FinanceReportFilters } from './financeUi';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { KpiRowSkeleton, TableSkeletonRows } from '../ui/Skeletons';

export const CollectionsView: React.FC = () => {
  const [dateFrom, setDateFrom] = useState<string>('2026-01-01');
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().split('T')[0]);
  const [clientName, setClientName] = useState<string>('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const cachedReport = financeService.getCachedCollections(dateFrom, dateTo, undefined, undefined, clientName || undefined);
  const [data, setData] = useState<CollectionsReport | null>(() => cachedReport?.data || null);
  const [loading, setLoading] = useState(!cachedReport);
  const [error, setError] = useState<string | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadReqIdRef = useRef(0);
  useModuleLoadGate(loading);

  useEffect(() => {
    workspaceService.getWorkspaces().then((ws) => setWorkspaces(ws || [])).catch(() => {});
  }, []);

  const loadReport = useCallback(async (opts?: { silent?: boolean }) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const reqId = ++loadReqIdRef.current;
    const cached = financeService.getCachedCollections(dateFrom, dateTo, undefined, undefined, clientName || undefined);
    if (cached && !opts?.silent) {
      setData(cached.data);
      setLoading(false);
    } else if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await financeService.getCollectionsReport(
        dateFrom,
        dateTo,
        undefined,
        undefined,
        clientName || undefined,
        { signal: controller.signal },
      );
      if (reqId !== loadReqIdRef.current) return;
      setData(res);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== loadReqIdRef.current) return;
      setError(err?.message || 'Error loading collections');
    } finally {
      if (reqId === loadReqIdRef.current) setLoading(false);
    }
  }, [dateFrom, dateTo, clientName]);

  useEffect(() => {
    void loadReport();
    return () => loadAbortRef.current?.abort();
  }, [loadReport]);

  useCacheInvalidation(['finance'], () => {
    void loadReport({ silent: true });
  });

  const handleConfirm = async (id: string) => {
    try {
      await financeService.confirmReceipt(id);
      void loadReport({ silent: true });
    } catch (err: any) {
      setError(err?.message || 'Could not release pending receipt');
    }
  };

  const summary = data?.summary;

  return (
    <div className="p-6 w-full space-y-6">
      <div>
        <h1 className="text-h1 font-semibold tracking-tight text-fg">Collections</h1>
        <p className="text-xs text-fg-muted mt-1">Approved collections and pending cheque receipts</p>
      </div>

      <FinanceReportFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
        clientName={clientName}
        onClientName={setClientName}
        clientOptions={workspaces.map((ws) => ({ value: ws.name, label: ws.name }))}
      />

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {loading && !data ? (
        <KpiRowSkeleton count={2} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-surface p-5 rounded-lg border border-border">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Total Collection</p>
            <p className="text-xl font-bold text-fg mt-1">
              {formatMinorMoney(summary?.total_collected_pkr || 0, 'PKR')}
            </p>
          </div>
          <div className="bg-surface p-5 rounded-lg border border-border">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Pending from clients</p>
            <p className="text-xl font-bold text-amber-700 mt-1">
              {formatMinorMoney(summary?.pending_pkr || 0, 'PKR')}
            </p>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas text-fg-2 border-b border-border">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Receipt</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <TableSkeletonRows rows={6} columns={7} />
              ) : !data?.receipts?.length ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-fg-muted">No collections in this range.</td>
                </tr>
              ) : (
                data.receipts.map((rcpt) => (
                  <tr key={rcpt.id}>
                    <td className="py-3 px-4">{rcpt.date}</td>
                    <td className="py-3 px-4 font-semibold">{rcpt.number}</td>
                    <td className="py-3 px-4">{rcpt.client_name}</td>
                    <td className="py-3 px-4 capitalize">
                      {rcpt.is_cheque ? 'Cheque' : rcpt.method}
                      {rcpt.bank ? ` (${rcpt.bank.toUpperCase()})` : ''}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">
                      {formatMinorMoney(rcpt.amount_received, rcpt.currency)}
                    </td>
                    <td className="py-3 px-4 align-middle">
                      <div className="flex items-center justify-center">
                        {rcpt.status === 'posted' && (
                          <span className="inline-flex h-7 items-center px-2.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Approved</span>
                        )}
                        {rcpt.status === 'pending' && (
                          <span className="inline-flex h-7 items-center px-2.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Pending</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-middle">
                      <div className="flex items-center justify-end">
                        {rcpt.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => void handleConfirm(rcpt.id)}
                            className="inline-flex h-7 items-center px-2.5 text-xs font-semibold rounded-md bg-accent text-accent-fg hover:bg-accent-hover"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
