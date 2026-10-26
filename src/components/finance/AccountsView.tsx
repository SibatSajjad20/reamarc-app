import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ArrowRightLeft,
  Plus,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  X,
  RefreshCw,
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { formatMinorMoney, majorToMinor, parseMajorGrouped } from '../../utils/money';
import type { FinanceAccount, FinanceLedgerEntry } from '../../types/finance';
import { CustomSelect } from '../ui/CustomSelect';
import { Button } from '../ui/button';
import { ACCOUNT_OPTIONS, AmountInput, BANK_OPTIONS, FinanceProofSlot } from './financeUi';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { validateFinanceProofFile } from '../../utils/financeProof';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { KpiRowSkeleton, TableSkeletonRows } from '../ui/Skeletons';
import { NEUTRAL_METADATA_BADGE_CLASS } from '../../utils/badgeStyles';
import { openFileAttachment } from '../../utils/fileUrl';

export const AccountsView: React.FC = () => {
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const ledgerParams = useMemo(
    () => ({
      account: accountFilter !== 'all' ? accountFilter : undefined,
      source_type: sourceTypeFilter !== 'all' ? sourceTypeFilter : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      limit: 100,
    }),
    [accountFilter, sourceTypeFilter, dateFrom, dateTo],
  );

  const cachedAccounts = financeService.getCachedAccounts();
  const cachedLedger = financeService.getCachedLedger(ledgerParams);
  const hasCache = Boolean(cachedAccounts);

  const [accounts, setAccounts] = useState<FinanceAccount[]>(() => cachedAccounts?.data || []);
  const [ledger, setLedger] = useState<FinanceLedgerEntry[]>(() => cachedLedger?.data.items || []);
  const [totalEntries, setTotalEntries] = useState(() => cachedLedger?.data.total || 0);
  const [loading, setLoading] = useState(!hasCache);
  const [refreshing, setRefreshing] = useState(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadReqIdRef = useRef(0);
  useModuleLoadGate(loading);

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

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const reqId = ++loadReqIdRef.current;
    const cachedAccs = financeService.getCachedAccounts();
    const cachedLedg = financeService.getCachedLedger(ledgerParams);
    const silent = Boolean(opts?.silent) || Boolean(cachedAccs || cachedLedg);

    if ((cachedAccs || cachedLedg) && !opts?.silent) {
      if (cachedAccs) setAccounts(cachedAccs.data);
      if (cachedLedg) {
        setLedger(cachedLedg.data.items || []);
        setTotalEntries(cachedLedg.data.total || 0);
      }
      setLoading(false);
    } else if (!silent) {
      setLoading(true);
    }

    try {
      setRefreshing(true);
      const [accs, ledg] = await Promise.all([
        financeService.getAccounts({ signal: controller.signal }),
        financeService.getLedger(ledgerParams, { signal: controller.signal }),
      ]);
      if (reqId !== loadReqIdRef.current) return;
      setAccounts(accs);
      setLedger(ledg.items || []);
      setTotalEntries(ledg.total || 0);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== loadReqIdRef.current) return;
      console.error('Failed to load accounts/ledger:', err);
      showNotification('error', err.message || 'Failed to load accounts data');
    } finally {
      if (reqId === loadReqIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [ledgerParams]);

  useEffect(() => {
    void fetchData();
    return () => loadAbortRef.current?.abort();
  }, [fetchData]);

  useCacheInvalidation(['finance'], () => {
    void fetchData({ silent: true });
  });

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

    const numAmount = parseMajorGrouped(transferAmount);
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

    const numAmount = parseMajorGrouped(openingAmount);
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

    const numAmount = parseMajorGrouped(adjAmount);
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
          <h2 className="text-h2 font-semibold text-fg">Accounts</h2>
          <p className="text-caption text-fg-muted mt-0.5">
            Cash, ABL, and Meezan balances from the ledger
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => void fetchData()} disabled={refreshing} aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button type="button" size="sm" icon={ArrowRightLeft} onClick={() => setIsTransferModalOpen(true)}>
            Transfer cash to bank
          </Button>
          <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={() => setIsOpeningModalOpen(true)}>
            Opening balance
          </Button>
          <Button type="button" variant="secondary" size="sm" icon={Sliders} onClick={() => setIsAdjustmentModalOpen(true)}>
            Adjustment
          </Button>
        </div>
      </div>

      {loading ? (
        <KpiRowSkeleton count={3} className="md:grid-cols-3 lg:grid-cols-3" />
      ) : (
      <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          {
            title: 'Cash in Hand',
            badge: 'Cash',
            detail: 'Office clearing account',
            extra: (
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(true)}
                className="text-caption text-accent-text hover:underline"
              >
                Transfer to bank
              </button>
            ),
            balance: cashAccount?.balance || 0,
          },
          {
            title: 'Allied Bank (ABL)',
            badge: 'ABL',
            detail: `Acc ${ablAccount?.account_number || '—'}`,
            extra: <span className="font-numeric text-caption text-fg-muted truncate">{ablAccount?.iban || '—'}</span>,
            balance: ablAccount?.balance || 0,
          },
          {
            title: 'Meezan Bank',
            badge: 'Meezan',
            detail: `Acc ${meezanAccount?.account_number || '—'}`,
            extra: <span className="font-numeric text-caption text-fg-muted truncate">{meezanAccount?.iban || '—'}</span>,
            balance: meezanAccount?.balance || 0,
          },
        ].map((card) => (
          <div key={card.title} className="bg-surface border border-border rounded-lg p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-ui font-semibold text-fg">{card.title}</h3>
              <span className={NEUTRAL_METADATA_BADGE_CLASS}>{card.badge}</span>
            </div>
            <p className="text-caption text-fg-muted mt-1">{card.detail}</p>
            <p className="text-h2 font-semibold font-numeric text-fg mt-3">
              {formatMinorMoney(card.balance, 'PKR')}
            </p>
            <div className="mt-3 pt-3 border-t border-border">{card.extra}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-caption text-fg-muted">Total liquid</p>
          <p className="text-h2 font-semibold font-numeric text-fg mt-1">
            {formatMinorMoney(totalLiquidCash, 'PKR')}
          </p>
          <p className="text-caption text-fg-muted mt-1">Cash + ABL + Meezan</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-caption text-fg-muted">Total in banks</p>
          <p className="text-h2 font-semibold font-numeric text-fg mt-1">
            {formatMinorMoney(totalBankBalance, 'PKR')}
          </p>
          <p className="text-caption text-fg-muted mt-1">ABL + Meezan</p>
        </div>
      </div>
      </>
      )}

      {/* Ledger Section */}
      <div className="bg-surface dark:bg-surface rounded-2xl border border-border dark:border-border overflow-hidden">
        {/* Ledger Header & Filters */}
        <div className="p-5 border-b border-border dark:border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-h3 font-semibold text-fg">Ledger</h3>
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
              <div className="flex items-center gap-1.5 text-xs min-w-[160px]">
                <span className="text-fg-muted dark:text-fg-muted font-medium shrink-0">From:</span>
                <CustomDatePicker
                  value={dateFrom}
                  onChange={setDateFrom}
                  offDayMode="none"
                  aria-label="Ledger from date"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs min-w-[160px]">
                <span className="text-fg-muted dark:text-fg-muted font-medium shrink-0">To:</span>
                <CustomDatePicker
                  value={dateTo}
                  onChange={setDateTo}
                  offDayMode="none"
                  aria-label="Ledger to date"
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
                <th className="py-3 px-4 text-right">Slip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border">
              {loading ? (
                <TableSkeletonRows rows={8} columns={8} />
              ) : ledger.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-fg-muted dark:text-fg-muted">
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
                      <td className="py-3 px-4 text-fg-2 dark:text-fg-muted font-numeric text-xs whitespace-nowrap">
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
                      <td className="py-3 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap font-numeric text-xs">
                        {isIn ? `+ ${formatMinorMoney(entry.amount, 'PKR')}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap font-numeric text-xs">
                        {!isIn ? `- ${formatMinorMoney(entry.amount, 'PKR')}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-fg-muted dark:text-fg-muted text-xs whitespace-nowrap">
                        {entry.created_by_name || 'System'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {entry.slip_file_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              void openFileAttachment(
                                financeService.getProofFileUrl(entry.slip_file_id!),
                                'deposit-slip',
                              )
                            }
                            className="inline-flex h-7 w-7 items-center justify-center text-fg-muted hover:text-accent-text rounded-md hover:bg-hover transition"
                            title="Open deposit slip"
                          >
                            <Paperclip className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-fg-faint">—</span>
                        )}
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
                  <AmountInput
                    required
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={setTransferAmount}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Transfer Date *
                  </label>
                  <CustomDatePicker
                    value={transferDate}
                    onChange={setTransferDate}
                    clearable={false}
                    offDayMode="none"
                    aria-label="Transfer date"
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
                <FinanceProofSlot
                  emptyLabel="Select slip image (PNG, JPG, PDF)"
                  filename={slipFile?.name}
                  uploading={uploadingSlip}
                  onFile={(file) => {
                    const proofError = validateFinanceProofFile(file);
                    if (proofError) {
                      setTransferError(proofError);
                      setSlipFile(null);
                      return;
                    }
                    setTransferError(null);
                    setSlipFile(file);
                  }}
                  onClear={() => setSlipFile(null)}
                />
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
                  className="px-4 py-2 bg-accent text-accent-fg hover:bg-accent-hover rounded-lg text-xs font-semibold transition disabled:opacity-50"
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
                  <AmountInput
                    required
                    placeholder="0.00"
                    value={openingAmount}
                    onChange={setOpeningAmount}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    As of Date *
                  </label>
                  <CustomDatePicker
                    value={openingDate}
                    onChange={setOpeningDate}
                    clearable={false}
                    offDayMode="none"
                    aria-label="Opening balance date"
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
                  <AmountInput
                    required
                    placeholder="0.00"
                    value={adjAmount}
                    onChange={setAdjAmount}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 dark:text-fg-muted mb-1">
                    Date *
                  </label>
                  <CustomDatePicker
                    value={adjDate}
                    onChange={setAdjDate}
                    clearable={false}
                    offDayMode="none"
                    aria-label="Adjustment date"
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
