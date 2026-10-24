import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Building2,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Sliders,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  X,
  RefreshCw,
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { formatMinorMoney, majorToMinor } from '../../utils/money';
import type { FinanceAccount, FinanceLedgerEntry } from '../../types/finance';
import { CustomSelect } from '../ui/CustomSelect';
import { ACCOUNT_OPTIONS, BANK_OPTIONS } from './financeUi';
import { FINANCE_PROOF_ACCEPT } from '../../utils/financeProof';

export const AccountsView: React.FC = () => {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [ledger, setLedger] = useState<FinanceLedgerEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters for ledger
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Modals
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);

  // Transfer Form State
  const [transferToBank, setTransferToBank] = useState<'abl' | 'meezan'>('abl');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [transferRef, setTransferRef] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Opening Balance Form State
  const [openingAccount, setOpeningAccount] = useState<'cash' | 'abl' | 'meezan'>('cash');
  const [openingAmount, setOpeningAmount] = useState<string>('');
  const [openingDate, setOpeningDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [openingMemo, setOpeningMemo] = useState<string>('Initial Opening Balance');
  const [openingSubmitting, setOpeningSubmitting] = useState(false);
  const [openingError, setOpeningError] = useState<string | null>(null);

  // Adjustment Form State
  const [adjAccount, setAdjAccount] = useState<'cash' | 'abl' | 'meezan'>('cash');
  const [adjDirection, setAdjDirection] = useState<'in' | 'out'>('in');
  const [adjAmount, setAdjAmount] = useState<string>('');
  const [adjDate, setAdjDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [adjMemo, setAdjMemo] = useState<string>('');
  const [adjReason, setAdjReason] = useState<string>('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [accs, ledg] = await Promise.all([
        financeService.getAccounts(),
        financeService.getLedger({
          account: accountFilter !== 'all' ? accountFilter : undefined,
          source_type: sourceTypeFilter !== 'all' ? sourceTypeFilter : undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          limit: 100,
        }),
      ]);
      setAccounts(accs);
      setLedger(ledg.items || []);
      setTotalEntries(ledg.total || 0);
    } catch (err: any) {
      console.error('Failed to load accounts/ledger:', err);
      showNotification('error', err.message || 'Failed to load accounts data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [accountFilter, sourceTypeFilter, dateFrom, dateTo]);

  // Calculations
  const cashAccount = accounts.find((a) => a.code === 'cash');
  const ablAccount = accounts.find((a) => a.code === 'abl');
  const meezanAccount = accounts.find((a) => a.code === 'meezan');

  const totalBankBalance = (ablAccount?.balance || 0) + (meezanAccount?.balance || 0);
  const totalLiquidCash = (cashAccount?.balance || 0) + totalBankBalance;

  // Handle Transfer
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError(null);

    const numAmount = parseFloat(transferAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setTransferError('Please enter a valid transfer amount greater than 0');
      return;
    }

    const minorAmount = majorToMinor(numAmount);
    if (minorAmount > (cashAccount?.balance || 0)) {
      setTransferError(
        `Insufficient cash balance (${formatMinorMoney(cashAccount?.balance || 0, 'PKR')}) to transfer ${formatMinorMoney(minorAmount, 'PKR')}`
      );
      return;
    }

    setTransferSubmitting(true);
    try {
      let slipFileId: string | undefined = undefined;
      if (slipFile) {
        setUploadingSlip(true);
        const uploaded = await financeService.uploadProofFile(slipFile);
        slipFileId = uploaded.file_id;
        setUploadingSlip(false);
      }

      await financeService.transferCashToBank({
        to_account: transferToBank,
        amount: minorAmount,
        date: transferDate,
        deposit_slip_reference: transferRef || undefined,
        slip_file_id: slipFileId,
        notes: transferNotes || undefined,
      });

      showNotification('success', `Transferred ${formatMinorMoney(minorAmount, 'PKR')} from Cash to ${transferToBank.toUpperCase()} Bank successfully`);
      setIsTransferModalOpen(false);
      setTransferAmount('');
      setTransferRef('');
      setTransferNotes('');
      setSlipFile(null);
      await fetchData();
    } catch (err: any) {
      setTransferError(err.message || 'Transfer failed');
    } finally {
      setTransferSubmitting(false);
      setUploadingSlip(false);
    }
  };

  // Handle Opening Balance
  const handleOpeningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpeningError(null);

    const numAmount = parseFloat(openingAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setOpeningError('Please enter a valid amount greater than 0');
      return;
    }

    setOpeningSubmitting(true);
    try {
      const minorAmount = majorToMinor(numAmount);
      await financeService.setOpeningBalance({
        account_code: openingAccount,
        amount: minorAmount,
        date: openingDate,
        memo: openingMemo || undefined,
      });

      showNotification('success', `Opening balance recorded for ${openingAccount.toUpperCase()}`);
      setIsOpeningModalOpen(false);
      setOpeningAmount('');
      await fetchData();
    } catch (err: any) {
      setOpeningError(err.message || 'Failed to record opening balance');
    } finally {
      setOpeningSubmitting(false);
    }
  };

  // Handle Adjustment
  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjError(null);

    const numAmount = parseFloat(adjAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setAdjError('Please enter a valid amount greater than 0');
      return;
    }

    if (!adjMemo.trim() || !adjReason.trim()) {
      setAdjError('Memo and detailed audit reason are both required for accounting adjustments');
      return;
    }

    setAdjSubmitting(true);
    try {
      const minorAmount = majorToMinor(numAmount);
      await financeService.makeAdjustment({
        account_code: adjAccount,
        direction: adjDirection,
        amount: minorAmount,
        date: adjDate,
        memo: adjMemo,
        reason: adjReason,
      });

      showNotification('success', `Adjustment recorded for ${adjAccount.toUpperCase()}`);
      setIsAdjustmentModalOpen(false);
      setAdjAmount('');
      setAdjMemo('');
      setAdjReason('');
      await fetchData();
    } catch (err: any) {
      setAdjError(err.message || 'Failed to record adjustment');
    } finally {
      setAdjSubmitting(false);
    }
  };

  const getSourceTypeBadge = (sourceType: string) => {
    switch (sourceType) {
      case 'receipt':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">Client Payment</span>;
      case 'transfer':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent-soft text-accent-text">Cash Transfer</span>;
      case 'opening_balance':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">Opening Balance</span>;
      case 'adjustment':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-400">Adjustment</span>;
      case 'reversal':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400">Reversal</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-subtle text-fg dark:bg-subtle dark:text-fg-muted">{sourceType}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-lg border flex items-center justify-between animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            )}
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-fg-muted hover:text-fg-2 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-fg dark:text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-accent-text" />
            Accounts & Money Movements
          </h2>
          <p className="text-sm text-fg-muted dark:text-fg-muted">
            Real-time balances calculated from append-only ledger entries across Cash and Bank accounts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="p-2 border border-border dark:border-border rounded-lg text-fg-2 dark:text-fg-muted hover:bg-canvas dark:hover:bg-hover transition"
            title="Refresh Balances"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Transfer Cash to Bank
          </button>

          <button
            onClick={() => setIsOpeningModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 border border-border dark:border-border bg-surface dark:bg-surface hover:bg-canvas dark:hover:bg-hover text-fg-2 dark:text-fg-2 rounded-lg text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" />
            Opening Balance
          </button>

          <button
            onClick={() => setIsAdjustmentModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 border border-border dark:border-border bg-surface dark:bg-surface hover:bg-canvas dark:hover:bg-hover text-fg-2 dark:text-fg-2 rounded-lg text-sm font-medium transition"
          >
            <Sliders className="w-4 h-4" />
            Adjustment
          </button>
        </div>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Cash in Hand */}
        <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-5 relative overflow-hidden group hover:border-emerald-300 dark:hover:border-emerald-700 transition">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
              Active Drawer
            </span>
          </div>

          <div className="mt-4">
            <h3 className="text-base font-bold text-fg dark:text-white">Cash in Hand</h3>
            <p className="text-xs text-fg-muted dark:text-fg-muted mt-0.5">Physical office register & clearing</p>
          </div>

          <div className="mt-4 pt-3 border-t border-border dark:border-border">
            <p className="text-xs text-fg-muted dark:text-fg-muted uppercase tracking-wider font-semibold">Available Balance</p>
            <p className="text-2xl font-semibold text-fg dark:text-white mt-1">
              {formatMinorMoney(cashAccount?.balance || 0, 'PKR')}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-fg-muted dark:text-fg-muted bg-canvas dark:bg-canvas/40 p-2.5 rounded-lg">
            <span>Transferable to bank</span>
            <button
              onClick={() => setIsTransferModalOpen(true)}
              className="text-accent-text dark:text-primary-400 hover:underline font-medium inline-flex items-center gap-1"
            >
              Deposit <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Allied Bank Limited */}
        <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-5 relative overflow-hidden group hover:border-blue-300 dark:hover:border-blue-700 transition">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Building2 className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
              ABL Account
            </span>
          </div>

          <div className="mt-4">
            <h3 className="text-base font-bold text-fg dark:text-white">Allied Bank Limited (ABL)</h3>
            <p className="text-xs text-fg-muted dark:text-fg-muted font-mono mt-0.5">
              Acc: {ablAccount?.account_number || '0010086701850017'}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border dark:border-border">
            <p className="text-xs text-fg-muted dark:text-fg-muted uppercase tracking-wider font-semibold">Ledger Balance</p>
            <p className="text-2xl font-semibold text-fg dark:text-white mt-1">
              {formatMinorMoney(ablAccount?.balance || 0, 'PKR')}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-fg-muted dark:text-fg-muted bg-canvas dark:bg-canvas/40 p-2.5 rounded-lg">
            <span>IBAN:</span>
            <span className="font-mono text-fg-2 dark:text-fg-muted truncate max-w-[170px]" title={ablAccount?.iban || 'PK08ABPA0010086701850017'}>
              {ablAccount?.iban || 'PK08ABPA0010086701850017'}
            </span>
          </div>
        </div>

        {/* Meezan Bank */}
        <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border p-5 relative overflow-hidden group hover:border-amber-300 dark:hover:border-amber-700 transition">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Building2 className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
              Meezan Account
            </span>
          </div>

          <div className="mt-4">
            <h3 className="text-base font-bold text-fg dark:text-white">Meezan Bank Limited</h3>
            <p className="text-xs text-fg-muted dark:text-fg-muted font-mono mt-0.5">
              Acc: {meezanAccount?.account_number || '02070105658422'}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border dark:border-border">
            <p className="text-xs text-fg-muted dark:text-fg-muted uppercase tracking-wider font-semibold">Ledger Balance</p>
            <p className="text-2xl font-semibold text-fg dark:text-white mt-1">
              {formatMinorMoney(meezanAccount?.balance || 0, 'PKR')}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-fg-muted dark:text-fg-muted bg-canvas dark:bg-canvas/40 p-2.5 rounded-lg">
            <span>IBAN:</span>
            <span className="font-mono text-fg-2 dark:text-fg-muted truncate max-w-[170px]" title={meezanAccount?.iban || 'PK71MEZN0002070105658422'}>
              {meezanAccount?.iban || 'PK71MEZN0002070105658422'}
            </span>
          </div>
        </div>
      </div>

      {/* Aggregated Totals Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-900 text-white rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-surface/10 flex items-center justify-center text-primary-300">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Total Liquid Position</p>
            <p className="text-2xl font-semibold text-white mt-0.5">
              {formatMinorMoney(totalLiquidCash, 'PKR')}
            </p>
            <p className="text-xs text-fg-muted">Sum of all Cash and Bank Balances</p>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-white/10 pt-4 sm:pt-0 sm:pl-6">
          <div className="w-12 h-12 rounded-lg bg-surface/10 flex items-center justify-center text-blue-300">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Total In Banks</p>
            <p className="text-2xl font-semibold text-white mt-0.5">
              {formatMinorMoney(totalBankBalance, 'PKR')}
            </p>
            <p className="text-xs text-fg-muted">ABL + Meezan verified ledger balances</p>
          </div>
        </div>
      </div>

      {/* Ledger Section */}
      <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border overflow-hidden">
        {/* Ledger Header & Filters */}
        <div className="p-5 border-b border-border dark:border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-fg dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-fg-muted" />
                Append-Only Audit Ledger
              </h3>
              <p className="text-xs text-fg-muted dark:text-fg-muted">
                Every entry is immutable. Showing {ledger.length} of {totalEntries} transactions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Account Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-fg-muted dark:text-fg-muted font-medium">Account:</span>
                <CustomSelect
                  size="sm"
                  value={accountFilter}
                  onChange={setAccountFilter}
                  options={[{ value: 'all', label: 'All accounts' }, ...ACCOUNT_OPTIONS]}
                />
              </div>

              {/* Source Type Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-fg-muted dark:text-fg-muted font-medium">Type:</span>
                <CustomSelect
                  size="sm"
                  value={sourceTypeFilter}
                  onChange={setSourceTypeFilter}
                  options={[
                    { value: 'all', label: 'All types' },
                    { value: 'receipt', label: 'Client receipts' },
                    { value: 'transfer', label: 'Cash transfers' },
                    { value: 'opening_balance', label: 'Opening balance' },
                    { value: 'adjustment', label: 'Adjustments' },
                    { value: 'reversal', label: 'Reversals' },
                  ]}
                />
              </div>

              {/* Date Filters */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-fg-muted dark:text-fg-muted font-medium">From:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg px-2 py-1 text-xs text-fg dark:text-fg-2 focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-fg-muted dark:text-fg-muted font-medium">To:</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-canvas dark:bg-canvas border border-border dark:border-border rounded-lg px-2 py-1 text-xs text-fg dark:text-fg-2 focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              {(accountFilter !== 'all' || sourceTypeFilter !== 'all' || dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setAccountFilter('all');
                    setSourceTypeFilter('all');
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="text-xs text-accent-text dark:text-primary-400 hover:underline font-medium"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-canvas dark:bg-canvas/50 text-fg-muted dark:text-fg-muted text-xs uppercase font-semibold border-b border-border dark:border-border">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Description / Reference</th>
                <th className="py-3 px-4 text-right">In (Credit)</th>
                <th className="py-3 px-4 text-right">Out (Debit)</th>
                <th className="py-3 px-4">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-fg-muted dark:text-fg-muted">
                    Loading ledger entries...
                  </td>
                </tr>
              ) : ledger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-fg-muted dark:text-fg-muted">
                    No ledger transactions found matching the selected filters.
                  </td>
                </tr>
              ) : (
                ledger.map((entry) => {
                  const isIn = entry.direction === 'in';
                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-canvas/80 dark:hover:bg-hover transition-colors"
                    >
                      <td className="py-3 px-4 text-fg-2 dark:text-fg-muted font-mono text-xs whitespace-nowrap">
                        {entry.date}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-fg dark:text-fg-2 uppercase text-xs">
                          {entry.account_code}
                        </span>
                      </td>
                      <td className="py-3 px-4">{getSourceTypeBadge(entry.source_type)}</td>
                      <td className="py-3 px-4 text-fg-2 dark:text-fg-muted max-w-xs truncate" title={entry.memo || ''}>
                        {entry.memo || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap font-mono text-xs">
                        {isIn ? `+ ${formatMinorMoney(entry.amount, 'PKR')}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap font-mono text-xs">
                        {!isIn ? `- ${formatMinorMoney(entry.amount, 'PKR')}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-fg-muted dark:text-fg-muted text-xs whitespace-nowrap">
                        {entry.created_by_name || 'System'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface dark:bg-surface rounded-2xl shadow-xl border border-border dark:border-border w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-border">
              <h3 className="text-base font-bold text-fg dark:text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-accent-text" />
                Transfer Cash to Bank
              </h3>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-fg-muted hover:text-fg-2 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="p-6 space-y-4">
              {transferError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{transferError}</span>
                </div>
              )}

              {/* Source & Destination */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    From (Source)
                  </label>
                  <input
                    type="text"
                    disabled
                    value="Cash in Hand"
                    className="w-full px-3 py-2 bg-subtle dark:bg-canvas border border-border dark:border-border rounded-lg text-xs text-fg-2 dark:text-fg-muted font-medium"
                  />
                  <p className="text-[11px] text-fg-muted mt-1">
                    Avail: {formatMinorMoney(cashAccount?.balance || 0, 'PKR')}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    To Bank Account *
                  </label>
                  <CustomSelect
                    value={transferToBank}
                    onChange={(value) => setTransferToBank(value as 'abl' | 'meezan')}
                    options={BANK_OPTIONS}
                  />
                </div>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    required
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring font-mono font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Transfer Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring font-medium"
                  />
                </div>
              </div>

              {/* Deposit Slip Ref */}
              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Deposit Slip Reference #
                </label>
                <input
                  type="text"
                  placeholder="e.g. ABL-DEP-99238"
                  value={transferRef}
                  onChange={(e) => setTransferRef(e.target.value)}
                  className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring font-mono"
                />
              </div>

              {/* Slip Image Upload */}
              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Deposit Slip Scan / Photo
                </label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border-strong dark:border-border-strong rounded-lg text-xs font-medium text-fg-2 dark:text-fg-muted hover:bg-canvas dark:hover:bg-hover transition w-full">
                    <Upload className="w-4 h-4 text-fg-muted" />
                    <span>{slipFile ? slipFile.name : 'Select slip image (PNG, JPG, PDF)'}</span>
                    <input
                      type="file"
                      className="hidden"
                      accept={FINANCE_PROOF_ACCEPT}
                      onChange={(e) => {
                        if (e.target.files?.[0]) setSlipFile(e.target.files[0]);
                      }}
                    />
                  </label>
                  {slipFile && (
                    <button
                      type="button"
                      onClick={() => setSlipFile(null)}
                      className="p-2 text-fg-muted hover:text-fg-2"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional memo..."
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-border dark:border-border">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 border border-border dark:border-border rounded-lg text-xs font-medium text-fg-2 dark:text-fg-muted hover:bg-canvas dark:hover:bg-hover transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferSubmitting || uploadingSlip}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
                >
                  {transferSubmitting ? 'Posting Transfer...' : 'Complete Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Opening Balance Modal */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface dark:bg-surface rounded-2xl shadow-xl border border-border dark:border-border w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-border">
              <h3 className="text-base font-bold text-fg dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" />
                Set Opening Balance
              </h3>
              <button
                onClick={() => setIsOpeningModalOpen(false)}
                className="text-fg-muted hover:text-fg-2 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpeningSubmit} className="p-6 space-y-4">
              {openingError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{openingError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Account *
                </label>
                <CustomSelect
                  value={openingAccount}
                  onChange={(value) => setOpeningAccount(value as 'cash' | 'abl' | 'meezan')}
                  options={ACCOUNT_OPTIONS}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    required
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring font-mono font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    As of Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Memo / Note
                </label>
                <input
                  type="text"
                  value={openingMemo}
                  onChange={(e) => setOpeningMemo(e.target.value)}
                  className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-border dark:border-border">
                <button
                  type="button"
                  onClick={() => setIsOpeningModalOpen(false)}
                  className="px-4 py-2 border border-border dark:border-border rounded-lg text-xs font-medium text-fg-2 dark:text-fg-muted hover:bg-canvas dark:hover:bg-hover transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={openingSubmitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
                >
                  {openingSubmitting ? 'Recording...' : 'Record Opening Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface dark:bg-surface rounded-2xl shadow-xl border border-border dark:border-border w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-border">
              <h3 className="text-base font-bold text-fg dark:text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-purple-600" />
                Record Ledger Adjustment
              </h3>
              <button
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="text-fg-muted hover:text-fg-2 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustmentSubmit} className="p-6 space-y-4">
              {adjError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{adjError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Account *
                  </label>
                  <CustomSelect
                    value={adjAccount}
                    onChange={(value) => setAdjAccount(value as 'cash' | 'abl' | 'meezan')}
                    options={ACCOUNT_OPTIONS}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Direction *
                  </label>
                  <CustomSelect
                    value={adjDirection}
                    onChange={(value) => setAdjDirection(value as 'in' | 'out')}
                    options={[
                      { value: 'in', label: 'Credit (inflow)' },
                      { value: 'out', label: 'Debit (outflow)' },
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    required
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring font-mono font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={adjDate}
                    onChange={(e) => setAdjDate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Memo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bank charges or manual reconciliation"
                  value={adjMemo}
                  onChange={(e) => setAdjMemo(e.target.value)}
                  className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                  Audit Reason *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Mandatory explanation for the audit trail..."
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full px-3 py-2 bg-surface dark:bg-canvas border border-border-strong dark:border-border-strong rounded-lg text-xs text-fg dark:text-fg focus:outline-none focus:ring-1 focus-visible:focus-ring"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-border dark:border-border">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="px-4 py-2 border border-border dark:border-border rounded-lg text-xs font-medium text-fg-2 dark:text-fg-muted hover:bg-canvas dark:hover:bg-hover transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjSubmitting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
                >
                  {adjSubmitting ? 'Recording...' : 'Record Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
