import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Clock,
  ArrowRight,
  Plus,
  CreditCard,
  Building2,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  ChevronRight,
  RefreshCw,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { formatMinorMoney } from '../../utils/money';
import type { Invoice, FinanceAccount, FinanceLedgerEntry, AgeingSummaryReport, FinanceTab } from '../../types/finance';

interface FinanceOverviewProps {
  onNavigateTab: (tab: FinanceTab, extra?: { action?: string; invoiceId?: string }) => void;
  onEditInvoice: (inv: Invoice) => void;
}

export const FinanceOverview: React.FC<FinanceOverviewProps> = ({
  onNavigateTab,
  onEditInvoice,
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [ledger, setLedger] = useState<FinanceLedgerEntry[]>([]);
  const [ageingReport, setAgeingReport] = useState<AgeingSummaryReport | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [invRes, accs, ledgRes, ageing] = await Promise.all([
        financeService.getInvoices({ limit: 6 }),
        financeService.getAccounts(),
        financeService.getLedger({ limit: 6 }),
        financeService.getAgeingSummary().catch(() => null),
      ]);
      setInvoices(invRes.items || []);
      setAccounts(accs || []);
      setLedger(ledgRes.items || []);
      if (ageing) setAgeingReport(ageing);
    } catch (err) {
      console.error('Failed to load finance overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">Paid</span>;
      case 'partially_paid':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">Partial</span>;
      case 'issued':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400">Issued</span>;
      case 'overdue':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400">Overdue</span>;
      case 'draft':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-navy-700 dark:text-slate-300">Draft</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Finance Hub Overview
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time accounts, client receivables, billing lifecycle, and audit movements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigateTab('invoices', { action: 'create' })}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </button>

          <button
            onClick={() => onNavigateTab('receipts', { action: 'create' })}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 hover:bg-slate-50 dark:hover:bg-navy-700/50 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition"
          >
            <CreditCard className="w-4 h-4 text-emerald-600" />
            Record Payment
          </button>

          <button
            onClick={() => onNavigateTab('accounts')}
            className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 hover:bg-slate-50 dark:hover:bg-navy-700/50 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition"
          >
            <Wallet className="w-4 h-4 text-primary-500" />
            Transfer Cash
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Liquid Position */}
        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-slate-200 dark:border-navy-700 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Liquid Cash
            </span>
            <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/60 flex items-center justify-center text-primary-600 dark:text-primary-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {formatMinorMoney(totalLiquid, 'PKR')}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Cash + ABL + Meezan</span>
            <button
              onClick={() => onNavigateTab('accounts')}
              className="text-primary-600 hover:underline font-medium inline-flex items-center gap-0.5"
            >
              Accounts <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Total Outstanding Receivables */}
        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-slate-200 dark:border-navy-700 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Receivables
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {formatMinorMoney(totalReceivablesPKR, 'PKR')}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
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
        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-slate-200 dark:border-navy-700 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Overdue Receivables
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
            {formatMinorMoney(overdueReceivablesPKR, 'PKR')}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
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
        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-slate-200 dark:border-navy-700 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Account Breakdown
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold">Verified Ledger</span>
          </div>
          <div className="space-y-1.5 mt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400">Cash:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {formatMinorMoney(cashAccount?.balance || 0, 'PKR')}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400">ABL:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {formatMinorMoney(ablAccount?.balance || 0, 'PKR')}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400">Meezan:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {formatMinorMoney(meezanAccount?.balance || 0, 'PKR')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two Columns: Recent Invoices & Recent Ledger Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices Card */}
        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-slate-200 dark:border-navy-700 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-navy-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Invoices</h3>
            </div>
            <button
              onClick={() => onNavigateTab('invoices')}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium inline-flex items-center gap-1"
            >
              View all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-navy-700 flex-1">
            {invoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No invoices generated yet.</div>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => onEditInvoice(inv)}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-navy-750/50 cursor-pointer transition"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {inv.number}
                      </span>
                      {getStatusBadge(inv.status)}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                      {inv.client_name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Due: {inv.due_date}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                      {formatMinorMoney(inv.total, inv.currency)}
                    </p>
                    {inv.balance_due > 0 ? (
                      <p className="text-[11px] text-rose-600 font-mono">
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
        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-slate-200 dark:border-navy-700 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-navy-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Ledger Transactions</h3>
            </div>
            <button
              onClick={() => onNavigateTab('accounts')}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium inline-flex items-center gap-1"
            >
              Full Ledger <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-navy-700 flex-1">
            {ledger.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No ledger transactions recorded yet.</div>
            ) : (
              ledger.map((entry) => {
                const isIn = entry.direction === 'in';
                return (
                  <div
                    key={entry.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-navy-750/50 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 uppercase">
                          {entry.account_code}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">{entry.date}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate max-w-xs">
                        {entry.memo || entry.source_type}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-mono text-xs font-bold ${
                          isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isIn ? `+ ${formatMinorMoney(entry.amount, 'PKR')}` : `- ${formatMinorMoney(entry.amount, 'PKR')}`}
                      </span>
                      <p className="text-[11px] text-slate-400 uppercase font-medium">{entry.source_type}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
