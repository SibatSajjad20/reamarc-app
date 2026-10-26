import React, { useState, useEffect, useCallback, useRef } from 'react';
import { financeService } from '../../services/financeService';
import { workspaceService } from '../../services/workspaceService';
import { formatMinorMoney } from '../../utils/money';
import type { WhtReport } from '../../types/finance';
import type { Workspace } from '../../types';
import { FinanceReportFilters } from './financeUi';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { KpiRowSkeleton, TableSkeletonRows } from '../ui/Skeletons';

export const WhtView: React.FC = () => {
  const [dateFrom, setDateFrom] = useState<string>('2026-01-01');
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().split('T')[0]);
  const [clientName, setClientName] = useState<string>('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const cachedReport = financeService.getCachedWht(dateFrom, dateTo, clientName || undefined);
  const [data, setData] = useState<WhtReport | null>(() => cachedReport?.data || null);
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
    const cached = financeService.getCachedWht(dateFrom, dateTo, clientName || undefined);
    if (cached && !opts?.silent) {
      setData(cached.data);
      setLoading(false);
    } else if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await financeService.getWhtReport(
        dateFrom,
        dateTo,
        clientName || undefined,
        { signal: controller.signal },
      );
      if (reqId !== loadReqIdRef.current) return;
      setData(res);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== loadReqIdRef.current) return;
      setError(err?.message || 'Error loading withhold tax');
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

  return (
    <div className="p-6 w-full space-y-6">
      <div>
        <h1 className="text-h1 font-semibold tracking-tight text-fg">Withhold Tax (WHT)</h1>
        <p className="text-xs text-fg-muted mt-1">
          Complete summary of tax withheld on receipts, including certificate status
        </p>
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
        <KpiRowSkeleton count={3} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface p-5 rounded-lg border border-border">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Total WHT</p>
            <p className="text-xl font-bold text-fg mt-1">
              {formatMinorMoney(data?.total_wht_pkr || 0, 'PKR')}
            </p>
          </div>
          <div className="bg-surface p-5 rounded-lg border border-border">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">With certificate</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">{data?.total_with_cert || 0}</p>
          </div>
          <div className="bg-surface p-5 rounded-lg border border-border">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Pending certificate</p>
            <p className="text-xl font-bold text-amber-700 mt-1">{data?.total_pending_cert || 0}</p>
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
                <th className="py-3 px-4 text-right">WHT amount</th>
                <th className="py-3 px-4 text-right">WHT (PKR)</th>
                <th className="py-3 px-4 text-center">Certificate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <TableSkeletonRows rows={6} columns={6} />
              ) : !data?.items?.length ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-fg-muted">
                    No withhold tax recorded in this range.
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr key={item.receipt_id}>
                    <td className="py-3 px-4">{item.date}</td>
                    <td className="py-3 px-4 font-semibold">{item.receipt_number}</td>
                    <td className="py-3 px-4">{item.client_name}</td>
                    <td className="py-3 px-4 text-right font-numeric">
                      {formatMinorMoney(item.wht_amount, item.currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-numeric font-semibold">
                      {formatMinorMoney(item.wht_pkr, 'PKR')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.has_certificate && item.certificate_file_id ? (
                        <a
                          href={`/api/v1/uploads/${item.certificate_file_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-text hover:underline font-medium"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-amber-700">Pending</span>
                      )}
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
