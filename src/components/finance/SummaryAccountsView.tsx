import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { financeService } from '../../services/financeService';
import { workspaceService } from '../../services/workspaceService';
import { formatMinorMoney } from '../../utils/money';
import type { Invoice } from '../../types/finance';
import type { Workspace } from '../../types';
import { FinanceReportFilters } from './financeUi';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { TableSkeletonRows } from '../ui/Skeletons';

export const SummaryAccountsView: React.FC = () => {
  const [dateFrom, setDateFrom] = useState<string>('2026-01-01');
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().split('T')[0]);
  const [clientName, setClientName] = useState<string>('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const listParams = useMemo(
    () => ({ status: 'all', date_from: dateFrom, date_to: dateTo, search: clientName || undefined, limit: 500 }),
    [dateFrom, dateTo, clientName],
  );
  const cachedList = financeService.getCachedInvoices(listParams);
  const [invoices, setInvoices] = useState<Invoice[]>(() => cachedList?.data.items || []);
  const [loading, setLoading] = useState(!cachedList);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadReqIdRef = useRef(0);
  useModuleLoadGate(loading);

  useEffect(() => {
    workspaceService.getWorkspaces().then((ws) => setWorkspaces(ws || [])).catch(() => {});
  }, []);

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

  const rows = useMemo(
    () =>
      invoices
        .filter((inv) => inv.status !== 'void' && inv.status !== 'deleted' && inv.status !== 'draft')
        .filter((inv) => !clientName || inv.client_name === clientName)
        .sort((a, b) => a.issue_date.localeCompare(b.issue_date)),
    [invoices, clientName],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, inv) => {
          acc.invoice += inv.total;
          acc.received += inv.amount_paid + inv.wht_settled;
          acc.due += inv.balance_due;
          return acc;
        },
        { invoice: 0, received: 0, due: 0 },
      ),
    [rows],
  );

  return (
    <div className="p-6 w-full space-y-6">
      <div>
        <h1 className="text-h1 font-semibold tracking-tight text-fg">Summary Accounts</h1>
        <p className="text-xs text-fg-muted mt-1">Invoice, receipts, and remaining balance by client</p>
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

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas text-fg-2 border-b border-border font-bold">
                <th className="py-3 px-4 w-14">Sr</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Client Name</th>
                <th className="py-3 px-4 text-right">Invoice Amount</th>
                <th className="py-3 px-4 text-right">Amount Receive</th>
                <th className="py-3 px-4 text-right">Balance Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeletonRows rows={8} columns={6} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-fg-muted">No invoices in this range.</td>
                </tr>
              ) : (
                rows.map((inv, idx) => (
                  <tr key={inv.id}>
                    <td className="py-3 px-4 font-numeric text-fg-muted">{idx + 1}</td>
                    <td className="py-3 px-4">{inv.issue_date}</td>
                    <td className="py-3 px-4 font-medium">{inv.client_name}</td>
                    <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(inv.total, inv.currency)}</td>
                    <td className="py-3 px-4 text-right font-numeric text-emerald-700">
                      {formatMinorMoney(inv.amount_paid + inv.wht_settled, inv.currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-numeric font-semibold">
                      {formatMinorMoney(inv.balance_due, inv.currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot>
                <tr className="bg-subtle font-bold border-t-2 border-border-strong">
                  <td className="py-3 px-4" colSpan={3}>Total</td>
                  <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(totals.invoice, 'PKR')}</td>
                  <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(totals.received, 'PKR')}</td>
                  <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(totals.due, 'PKR')}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
