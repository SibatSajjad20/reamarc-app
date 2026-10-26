import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { financeService } from '../../services/financeService';
import { formatMinorMoney } from '../../utils/money';
import type { Invoice } from '../../types/finance';
import { FinanceReportFilters } from './financeUi';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { KpiRowSkeleton, TableSkeletonRows } from '../ui/Skeletons';

interface ClientDueRow {
  client_name: string;
  currency: string;
  total: number;
}

export const ReceivablesView: React.FC = () => {
  const [dateFrom, setDateFrom] = useState<string>('2026-01-01');
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().split('T')[0]);
  const listParams = useMemo(
    () => ({ status: 'unpaid', date_from: dateFrom, date_to: dateTo, limit: 500 }),
    [dateFrom, dateTo],
  );
  const cachedList = financeService.getCachedInvoices(listParams);
  const [invoices, setInvoices] = useState<Invoice[]>(() => cachedList?.data.items || []);
  const [loading, setLoading] = useState(!cachedList);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadReqIdRef = useRef(0);
  useModuleLoadGate(loading);

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const reqId = ++loadReqIdRef.current;
    const cached = financeService.getCachedInvoices(listParams);
    if (cached && !opts?.silent) {
      setInvoices(cached.data.items || []);
      setLoading(false);
    } else if (!opts?.silent) {
      setLoading(true);
    }
    try {
      const res = await financeService.getInvoices(listParams, { signal: controller.signal });
      if (reqId !== loadReqIdRef.current) return;
      setInvoices(res.items || []);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
    } finally {
      if (reqId === loadReqIdRef.current) setLoading(false);
    }
  }, [listParams]);

  useEffect(() => {
    void loadData();
    return () => loadAbortRef.current?.abort();
  }, [loadData]);

  useCacheInvalidation(['finance'], () => {
    void loadData({ silent: true });
  });

  const rows = useMemo<ClientDueRow[]>(() => {
    const map = new Map<string, ClientDueRow>();
    for (const inv of invoices) {
      if (inv.balance_due <= 0) continue;
      if (inv.status === 'void' || inv.status === 'deleted' || inv.status === 'draft') continue;
      const key = `${inv.client_name}::${inv.currency}`;
      const existing = map.get(key);
      if (existing) {
        existing.total += inv.balance_due;
      } else {
        map.set(key, {
          client_name: inv.client_name,
          currency: inv.currency,
          total: inv.balance_due,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.client_name.localeCompare(b.client_name));
  }, [invoices]);

  const totalsByCurrency = useMemo(() => {
    const totals = { PKR: 0, USD: 0, GBP: 0 };
    for (const row of rows) {
      if (row.currency === 'USD') totals.USD += row.total;
      else if (row.currency === 'GBP') totals.GBP += row.total;
      else totals.PKR += row.total;
    }
    return totals;
  }, [rows]);

  return (
    <div className="p-6 w-full space-y-6">
      <div>
        <h1 className="text-h1 font-semibold tracking-tight text-fg">Receivables</h1>
        <p className="text-xs text-fg-muted mt-1">Outstanding balances by client</p>
      </div>

      <FinanceReportFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
      />

      {loading ? (
        <KpiRowSkeleton count={3} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['PKR', 'USD', 'GBP'] as const).map((currency) => (
            <div key={currency} className="bg-surface p-4 rounded-lg border border-border">
              <p className="text-caption text-fg-muted">Total due · {currency}</p>
              <p className="text-h2 font-semibold font-numeric text-fg mt-1">
                {formatMinorMoney(totalsByCurrency[currency], currency)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas text-fg-2 border-b border-border font-bold">
                <th className="py-3 px-4">Client Name</th>
                <th className="py-3 px-4 text-center">Currency</th>
                <th className="py-3 px-4 text-right">Total Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeletonRows rows={6} columns={3} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-fg-muted">
                    No outstanding receivables in this date range.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.client_name}-${row.currency}`} className="hover:bg-canvas/70">
                    <td className="py-3 px-4 font-bold text-fg">{row.client_name}</td>
                    <td className="py-3 px-4 text-center text-fg-muted font-semibold">{row.currency}</td>
                    <td className="py-3 px-4 text-right font-semibold text-accent-text">
                      {formatMinorMoney(row.total, row.currency)}
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
