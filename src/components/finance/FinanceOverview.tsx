import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Clock,
  ArrowRight,
  Plus,
  CreditCard,
  Wallet,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { formatMinorMoney } from '../../utils/money';
import type { Invoice, FinanceAccount, FinanceLedgerEntry, AgeingSummaryReport, FinanceTab } from '../../types/finance';
import { FinanceStatusBadge } from './financeUi';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { KpiRowSkeleton, CardListSkeleton } from '../ui/Skeletons';

interface FinanceOverviewProps {
  onNavigateTab: (tab: FinanceTab, extra?: { action?: string; invoiceId?: string }) => void;
  onEditInvoice: (inv: Invoice) => void;
}

export const FinanceOverview: React.FC<FinanceOverviewProps> = ({
  onNavigateTab,
  onEditInvoice,
}) => {
  const cachedInvoices = financeService.getCachedInvoices({ limit: 6 });
  const cachedAccounts = financeService.getCachedAccounts();
  const cachedLedger = financeService.getCachedLedger({ limit: 6 });
  const cachedAgeing = financeService.getCachedAgeingSummary();
  const hasCache = Boolean(cachedInvoices || cachedAccounts);

  const [invoices, setInvoices] = useState<Invoice[]>(() => cachedInvoices?.data.items || []);
  const [accounts, setAccounts] = useState<FinanceAccount[]>(() => cachedAccounts?.data || []);
  const [ledger, setLedger] = useState<FinanceLedgerEntry[]>(() => cachedLedger?.data.items || []);
  const [ageingReport, setAgeingReport] = useState<AgeingSummaryReport | null>(() => cachedAgeing?.data || null);
  const [loading, setLoading] = useState(!hasCache);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadReqIdRef = useRef(0);
  const hasLoadedOnceRef = useRef(hasCache);
  useModuleLoadGate(loading);

  const loadOverview = useCallback(async (opts?: { silent?: boolean }) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const reqId = ++loadReqIdRef.current;
    const cached = financeService.getCachedInvoices({ limit: 6 }) || financeService.getCachedAccounts();
    const silent = Boolean(opts?.silent) || hasLoadedOnceRef.current || Boolean(cached);

    if (cached && !opts?.silent) {
      const inv = financeService.getCachedInvoices({ limit: 6 });
      const accs = financeService.getCachedAccounts();
      const ledg = financeService.getCachedLedger({ limit: 6 });
      const ageing = financeService.getCachedAgeingSummary();
      if (inv) setInvoices(inv.data.items || []);
      if (accs) setAccounts(accs.data || []);
      if (ledg) setLedger(ledg.data.items || []);
      if (ageing) setAgeingReport(ageing.data);
      setLoading(false);
    } else if (!silent) {
      setLoading(true);
    }

    try {
      const signal = controller.signal;
      const [invRes, accs, ledgRes, ageing] = await Promise.all([
        financeService.getInvoices({ limit: 6 }, { signal }),
        financeService.getAccounts({ signal }),
        financeService.getLedger({ limit: 6 }, { signal }),
        financeService.getAgeingSummary(undefined, undefined, { signal }).catch(() => null),
      ]);
      if (reqId !== loadReqIdRef.current) return;
      setInvoices(invRes.items || []);
      setAccounts(accs || []);
      setLedger(ledgRes.items || []);
      if (ageing) setAgeingReport(ageing);
      hasLoadedOnceRef.current = true;
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== loadReqIdRef.current) return;
      console.error('Failed to load finance overview:', err);
    } finally {
      if (reqId === loadReqIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    return () => loadAbortRef.current?.abort();
  }, [loadOverview]);

  useCacheInvalidation(['finance'], () => {
    void loadOverview({ silent: true });
  });

  const cashAccount = accounts.find((a) => a.code === 'cash');
  const ablAccount = accounts.find((a) => a.code === 'abl');
  const meezanAccount = accounts.find((a) => a.code === 'meezan');

  const totalLiquid = (cashAccount?.balance || 0) + (ablAccount?.balance || 0) + (meezanAccount?.balance || 0);

  // Calculate totals from Ageing summary or invoices
  const pkrSummary = ageingReport?.currencies_summary?.PKR;
  const totalReceivablesPKR = pkrSummary ? pkrSummary.total : 0;
  const overdueReceivablesPKR = pkrSummary
    ? pkrSummary['1_30'] + pkrSummary['31_60'] + pkrSummary['61_90'] + pkrSummary['90_plus']
    : 0;

  const usdSummary = ageingReport?.currencies_summary?.USD;
  const totalReceivablesUSD = usdSummary ? usdSummary.total : 0;

  const getStatusBadge = (status: string) => <FinanceStatusBadge status={status} />;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-fg dark:text-white flex items-center gap-2">
            Overview
          </h2>
          <p className="text-sm text-fg-muted dark:text-fg-muted">
            Real-time accounts, client receivables, billing lifecycle, and audit movements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigateTab('invoices', { action: 'create' })}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-accent text-accent-fg hover:bg-accent-hover rounded-md text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </button>

          <button
            onClick={() => onNavigateTab('receipts', { action: 'create' })}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-border dark:border-border bg-surface dark:bg-surface hover:bg-canvas dark:hover:bg-hover text-fg-2 dark:text-fg-2 rounded-lg text-sm font-medium transition"
          >
            <CreditCard className="w-4 h-4 text-emerald-600" />
            Record Payment
          </button>

          <button
            onClick={() => onNavigateTab('accounts')}
            className="inline-flex items-center gap-2 px-3 py-2 border border-border dark:border-border bg-surface dark:bg-surface hover:bg-canvas dark:hover:bg-hover text-fg-2 dark:text-fg-2 rounded-lg text-sm font-medium transition"
          >
            <Wallet className="w-4 h-4 text-accent-text" />
            Transfer Cash
          </button>
        </div>
      </div>

      {loading ? (
        <>
          <KpiRowSkeleton count={4} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CardListSkeleton rows={5} />
            <CardListSkeleton rows={5} />
          </div>
        </>
      ) : (
      <>
      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Liquid Position */}
        <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted dark:text-fg-muted">
              Total Liquid Cash
            </span>
            <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/60 flex items-center justify-center text-accent-text dark:text-primary-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className="text-h2 font-semibold font-numeric text-fg mt-2">
            {formatMinorMoney(totalLiquid, 'PKR')}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
            <span>Cash + ABL + Meezan</span>
            <button
              onClick={() => onNavigateTab('accounts')}
              className="text-accent-text hover:underline font-medium inline-flex items-center gap-0.5"
            >
              Accounts <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Total Outstanding Receivables */}
        <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted dark:text-fg-muted">
              Total Receivables
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-h2 font-semibold font-numeric text-fg mt-2">
            {formatMinorMoney(totalReceivablesPKR, 'PKR')}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
            <span>
              {totalReceivablesUSD > 0 ? `+ ${formatMinorMoney(totalReceivablesUSD, 'USD')}` : 'All open clients'}
            </span>
            <button
              onClick={() => onNavigateTab('receivables')}
              className="text-blue-600 hover:underline font-medium inline-flex items-center gap-0.5"
            >
              Ageing <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Overdue Receivables */}
        <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted dark:text-fg-muted">
              Overdue Receivables
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-h2 font-semibold font-numeric text-rose-700 dark:text-rose-300 mt-2">
            {formatMinorMoney(overdueReceivablesPKR, 'PKR')}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
            <span>Past due date</span>
            <button
              onClick={() => onNavigateTab('receivables')}
              className="text-rose-600 hover:underline font-medium inline-flex items-center gap-0.5"
            >
              View Report <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Bank & Cash Breakdown */}
        <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted dark:text-fg-muted">
              Account Breakdown
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold">Verified Ledger</span>
          </div>
          <div className="space-y-1.5 mt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-2 dark:text-fg-muted">Cash:</span>
              <span className="font-numeric font-semibold text-fg">
                {formatMinorMoney(cashAccount?.balance || 0, 'PKR')}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-2 dark:text-fg-muted">ABL:</span>
              <span className="font-numeric font-semibold text-fg">
                {formatMinorMoney(ablAccount?.balance || 0, 'PKR')}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-2 dark:text-fg-muted">Meezan:</span>
              <span className="font-numeric font-semibold text-fg dark:text-fg-2">
                {formatMinorMoney(meezanAccount?.balance || 0, 'PKR')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two Columns: Recent Invoices & Recent Ledger Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices Card */}
        <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border dark:border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent-text" />
              <h3 className="text-sm font-bold text-fg dark:text-white">Recent Invoices</h3>
            </div>
            <button
              onClick={() => onNavigateTab('invoices')}
              className="text-xs text-accent-text dark:text-primary-400 hover:underline font-medium inline-flex items-center gap-1"
            >
              View all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-border dark:divide-border flex-1">
            {invoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-fg-muted">No invoices generated yet.</div>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => onEditInvoice(inv)}
                  className="p-4 flex items-center justify-between hover:bg-canvas dark:hover:bg-hover cursor-pointer transition"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-numeric font-semibold text-xs text-fg dark:text-white">
                        {inv.number}
                      </span>
                      {getStatusBadge(inv.status)}
                    </div>
                    <p className="text-xs text-fg-2 dark:text-fg-muted font-medium mt-0.5">
                      {inv.client_name}
                    </p>
                    <p className="text-[11px] text-fg-muted">
                      Due: {inv.due_date}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-numeric font-semibold text-fg dark:text-white">
                      {formatMinorMoney(inv.total, inv.currency)}
                    </p>
                    {inv.balance_due > 0 ? (
                      <p className="text-[11px] text-rose-600 font-numeric">
                        Due: {formatMinorMoney(inv.balance_due, inv.currency)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-emerald-600 font-semibold">Settled</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Ledger Entries Card */}
        <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border dark:border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <h3 className="text-sm font-bold text-fg dark:text-white">Recent Ledger Transactions</h3>
            </div>
            <button
              onClick={() => onNavigateTab('accounts')}
              className="text-xs text-accent-text dark:text-primary-400 hover:underline font-medium inline-flex items-center gap-1"
            >
              Full Ledger <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-border dark:divide-border flex-1">
            {ledger.length === 0 ? (
              <div className="p-8 text-center text-xs text-fg-muted">No ledger transactions recorded yet.</div>
            ) : (
              ledger.map((entry) => {
                const isIn = entry.direction === 'in';
                return (
                  <div
                    key={entry.id}
                    className="p-4 flex items-center justify-between hover:bg-canvas dark:hover:bg-hover transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-fg dark:text-fg-2 uppercase">
                          {entry.account_code}
                        </span>
                        <span className="text-[11px] text-fg-muted font-numeric">{entry.date}</span>
                      </div>
                      <p className="text-xs text-fg-2 dark:text-fg-muted mt-0.5 truncate max-w-xs">
                        {entry.memo || entry.source_type}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-numeric text-xs font-semibold ${
                          isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isIn ? `+ ${formatMinorMoney(entry.amount, 'PKR')}` : `- ${formatMinorMoney(entry.amount, 'PKR')}`}
                      </span>
                      <p className="text-[11px] text-fg-muted uppercase font-medium">{entry.source_type}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
