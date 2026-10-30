import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus,
  Search,
  Download,
  Share2,
  RefreshCw,
  Check,
  Eye,
  CreditCard,
  Ban,
  Clock,
  Paperclip,
  Pencil,
  X,
} from 'lucide-react';
import { openFileAttachment } from '../../utils/fileUrl';
import { financeService } from '../../services/financeService';
import { formatMinorMoney } from '../../utils/money';
import type { Invoice, FinanceSettings } from '../../types/finance';
import { InvoicePreview } from './InvoicePreview';
import { InvoiceStatusBadge, resolveInvoiceStatus } from './financeUi';
import { Button } from '../ui/button';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { KpiRowSkeleton, TableSkeletonRows, DrawerSkeleton } from '../ui/Skeletons';
import { formatInvoiceDate } from '../../utils/formatInvoiceDate';
import {
  copyTextToClipboard,
  invoiceEditBlockedMessage,
  publicInvoiceUrl,
  whatsAppShareUrl,
} from '../../utils/invoiceShare';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';

interface InvoicesViewProps {
  onCreateNew: () => void;
  onEditInvoice: (inv: Invoice) => void;
  onRecordPaymentForInvoice?: (inv: Invoice) => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  onCreateNew,
  onEditInvoice,
  onRecordPaymentForInvoice,
}) => {
  const { addToast } = useToast();
  const { isAdmin } = usePermissions();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const listParams = useMemo(() => ({ status: 'with_deleted', limit: 500 }), []);
  const cachedList = financeService.getCachedInvoices(listParams);
  const cachedSettings = financeService.getCachedSettings();

  const [invoices, setInvoices] = useState<Invoice[]>(() => cachedList?.data.items || []);
  const [settings, setSettings] = useState<FinanceSettings | null>(() => cachedSettings?.data || null);
  const [loading, setLoading] = useState(!cachedList);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [voidModalInv, setVoidModalInv] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [deleteModalInv, setDeleteModalInv] = useState<Invoice | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadReqIdRef = useRef(0);
  const hasLoadedOnceRef = useRef(Boolean(cachedList));
  useModuleLoadGate(loading);

  const fetchInvoices = useCallback(async (opts?: { silent?: boolean }) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const reqId = ++loadReqIdRef.current;
    const cached = financeService.getCachedInvoices(listParams);
    const silent = Boolean(opts?.silent) || hasLoadedOnceRef.current || Boolean(cached);

    if (cached && !opts?.silent) {
      setInvoices(cached.data.items || []);
      const setts = financeService.getCachedSettings();
      if (setts) setSettings(setts.data);
      setLoading(false);
    } else if (!silent) {
      setLoading(true);
    }

    try {
      const [res, setts] = await Promise.all([
        financeService.getInvoices(listParams, { signal: controller.signal }),
        financeService.getSettings({ signal: controller.signal }).catch(() => null),
      ]);
      if (reqId !== loadReqIdRef.current) return;
      setInvoices(res.items || []);
      if (setts) setSettings(setts);
      hasLoadedOnceRef.current = true;
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== loadReqIdRef.current) return;
      console.error('Error fetching invoices:', err);
    } finally {
      if (reqId === loadReqIdRef.current) {
        setLoading(false);
      }
    }
  }, [listParams]);

  useEffect(() => {
    void fetchInvoices();
    return () => loadAbortRef.current?.abort();
  }, [fetchInvoices]);

  useCacheInvalidation(['finance'], () => {
    void fetchInvoices({ silent: true });
  });

  const filteredInvoices = useMemo(() => {
    const q = search.toLowerCase().trim();
    return invoices.filter((inv) => {
      if (activeTab === 'deleted') {
        if (inv.status !== 'deleted') return false;
      } else if (inv.status === 'deleted') {
        return false;
      }
      if (activeTab === 'draft' && inv.status !== 'draft') return false;
      if (activeTab === 'partially_paid' && inv.status !== 'partially_paid') return false;
      if (activeTab === 'paid' && inv.status !== 'paid') return false;
      if (activeTab === 'void' && inv.status !== 'void') return false;
      if (activeTab === 'overdue' && resolveInvoiceStatus(inv) !== 'overdue') return false;
      if (!q) return true;
      return (
        inv.number?.toLowerCase().includes(q) ||
        inv.client_name?.toLowerCase().includes(q) ||
        inv.reference?.toLowerCase().includes(q)
      );
    });
  }, [invoices, search, activeTab]);

  const metrics = useMemo(() => {
    let totalInvoiced = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let onHoldAmount = 0;

    for (const inv of invoices) {
      if (inv.status === 'deleted') continue;
      if (inv.status === 'void') {
        onHoldAmount += inv.total;
        continue;
      }
      totalInvoiced += inv.total;
      if (resolveInvoiceStatus(inv) === 'overdue') {
        overdueCount += 1;
        overdueAmount += inv.balance_due;
      }
    }
    return { totalInvoiced, overdueCount, overdueAmount, onHoldAmount };
  }, [invoices]);

  const handleOpenDetail = async (inv: Invoice) => {
    const cached = financeService.getCachedInvoice(inv.id);
    setSelectedInvoice(cached?.data || inv);
    setIsDrawerOpen(true);
    setDrawerLoading(!cached);
    try {
      const full = await financeService.getInvoice(inv.id);
      setSelectedInvoice(full);
    } catch {
      setSelectedInvoice(inv);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleConfirmVoid = async () => {
    if (!voidModalInv || !voidReason.trim()) return;
    try {
      await financeService.voidInvoice(voidModalInv.id, voidReason);
      setVoidModalInv(null);
      setVoidReason('');
      if (selectedInvoice?.id === voidModalInv.id) {
        setIsDrawerOpen(false);
      }
      fetchInvoices();
    } catch (err: any) {
      setActionError(err?.message || 'Could not place invoice on hold');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalInv || !deleteReason.trim()) return;
    try {
      await financeService.deleteInvoice(deleteModalInv.id, deleteReason);
      setDeleteModalInv(null);
      setDeleteReason('');
      if (selectedInvoice?.id === deleteModalInv.id) {
        setIsDrawerOpen(false);
      }
      fetchInvoices();
    } catch (err: any) {
      setActionError(err?.message || 'Could not delete invoice');
    }
  };

  const handleEditInvoice = (inv: Invoice) => {
    const blocked = invoiceEditBlockedMessage(inv.status, isAdmin);
    if (blocked) {
      addToast('Cannot edit invoice', blocked, 'error');
      return;
    }
    setIsDrawerOpen(false);
    onEditInvoice(inv);
  };

  const handleCopyLink = async (inv: Invoice) => {
    const token = inv.share_token;
    if (!token) {
      addToast('Link unavailable', 'This invoice does not have a public link yet. Open it and try again.', 'error');
      return;
    }
    if (inv.status === 'draft' || inv.status === 'deleted') {
      addToast('Link unavailable', 'Issue the invoice before sharing a public link.', 'error');
      return;
    }
    const url = publicInvoiceUrl(token);
    try {
      await copyTextToClipboard(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2500);
      addToast('Link copied', url, 'success');
    } catch {
      addToast('Could not copy link', url, 'error');
    }
  };

  const handleRegenerateLink = async (inv: Invoice) => {
    if (!window.confirm(`Create a new public link for ${inv.number || 'this invoice'}? The old link will stop working.`)) return;
    try {
      const res = await financeService.regenerateInvoiceShareLink(inv.id);
      await handleCopyLink({ ...inv, share_token: res.share_token });
      fetchInvoices();
    } catch (err: any) {
      setActionError(err?.message || 'Could not regenerate the link');
    }
  };

  const handleShareWhatsApp = (inv: Invoice) => {
    const token = inv.share_token;
    if (!token || inv.status === 'draft' || inv.status === 'deleted') {
      addToast('Link unavailable', 'Issue the invoice before sharing a public link.', 'error');
      return;
    }
    const url = publicInvoiceUrl(token);
    const message =
      `Hello ${inv.client_name},\nHere is your invoice ${inv.number} for ${formatMinorMoney(
        inv.total,
        inv.currency,
      )}.\nBalance Due: ${formatMinorMoney(inv.balance_due, inv.currency)}.\nView invoice online: ${url}`;
    // Open synchronously inside the click handler so popup blockers do not kill it.
    window.open(whatsAppShareUrl(message, inv.client_billing?.phone), '_blank');
  };

  const getStatusBadge = (inv: Invoice) => <InvoiceStatusBadge invoice={inv} />;

  return (
    <div className="p-6 w-full space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-fg">Invoices</h1>
          <p className="text-xs text-fg-muted mt-1">
            Manage agency billings, issue invoices, track partial payments, and view PDF snapshots
          </p>
        </div>

        <Button type="button" size="sm" icon={Plus} onClick={onCreateNew}>
          New invoice
        </Button>
      </div>

      {actionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <KpiRowSkeleton count={3} />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-caption text-fg-muted">Invoiced</p>
          <p className="text-h2 font-semibold font-numeric text-fg mt-1">
            {formatMinorMoney(metrics.totalInvoiced, 'PKR')}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-caption text-fg-muted">Overdue</p>
          <p className="text-h2 font-semibold font-numeric text-rose-700 dark:text-rose-300 mt-1">
            {formatMinorMoney(metrics.overdueAmount, 'PKR')}
          </p>
          <p className="text-[11px] text-fg-muted mt-1">
            {metrics.overdueCount} invoice{metrics.overdueCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-caption text-fg-muted">On hold</p>
          <p className="text-h2 font-semibold font-numeric text-amber-700 dark:text-amber-300 mt-1">
            {formatMinorMoney(metrics.onHoldAmount, 'PKR')}
          </p>
        </div>
      </div>
      )}

      {/* Status Tabs & Search Bar */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-center gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {[
              { id: 'all', label: 'All' },
              { id: 'draft', label: 'Draft' },
              { id: 'partially_paid', label: 'Partially Paid' },
              { id: 'overdue', label: 'Overdue' },
              { id: 'paid', label: 'Paid' },
              { id: 'void', label: 'On hold' },
              { id: 'deleted', label: 'Deleted' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  activeTab === tab.id
                    ? 'bg-subtle text-fg border border-border'
                    : 'text-fg-muted hover:bg-hover border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-fg-muted absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice # or client..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border-strong focus:outline-none focus:ring-2 focus-visible:focus-ring"
            />
          </div>
        </div>

        {/* Invoices Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas/80 text-fg-2 border-b border-border">
                <th className="py-3 px-4 font-semibold">Number</th>
                <th className="py-3 px-4 font-semibold">Client</th>
                <th className="py-3 px-4 font-semibold">Issued</th>
                <th className="py-3 px-4 font-semibold">Due</th>
                <th className="py-3 px-4 font-semibold text-right font-numeric">Total</th>
                <th className="py-3 px-4 font-semibold text-right font-numeric">Balance Due</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <TableSkeletonRows rows={8} columns={8} />
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-fg-muted">
                    {activeTab === 'deleted'
                      ? 'No deleted invoices stored yet.'
                      : 'No invoices found. Click "New Invoice" to create one.'}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => handleOpenDetail(inv)}
                    className="hover:bg-canvas/80 cursor-pointer transition"
                  >
                    <td className="py-3 px-4 font-numeric font-bold text-fg align-middle">
                      {inv.number}
                    </td>
                    <td className="py-3 px-4 font-medium text-fg align-middle">{inv.client_name}</td>
                    <td className="py-3 px-4 text-fg-muted align-middle font-numeric">{formatInvoiceDate(inv.issue_date)}</td>
                    <td className="py-3 px-4 text-fg-muted align-middle font-numeric">{formatInvoiceDate(inv.due_date)}</td>
                    <td className="py-3 px-4 text-right font-semibold text-fg align-middle font-numeric">
                      {formatMinorMoney(inv.total, inv.currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-accent-text align-middle font-numeric">
                      {formatMinorMoney(inv.balance_due, inv.currency)}
                    </td>
                    <td className="py-3 px-4 text-center align-middle">{getStatusBadge(inv)}</td>
                    <td
                      className="py-3 px-4 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(inv)}
                          className="inline-flex h-8 w-8 items-center justify-center text-fg-muted hover:text-accent-text rounded-md hover:bg-hover transition"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEditInvoice(inv)}
                          disabled={inv.status === 'deleted'}
                          className="inline-flex h-8 w-8 items-center justify-center text-fg-muted hover:text-accent-text rounded-md hover:bg-hover transition disabled:invisible"
                          title="Edit invoice"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onRecordPaymentForInvoice?.(inv)}
                          disabled={!(inv.balance_due > 0 && inv.status !== 'draft' && inv.status !== 'void' && inv.status !== 'deleted' && onRecordPaymentForInvoice)}
                          className="inline-flex h-8 w-8 items-center justify-center text-fg-muted hover:text-emerald-600 rounded-md hover:bg-hover transition disabled:invisible"
                          title="Record payment"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>

                        <a
                          href={financeService.getInvoicePdfUrl(inv.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 w-8 items-center justify-center text-fg-muted hover:text-accent-text rounded-md hover:bg-hover transition"
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </a>

                        <button
                          type="button"
                          onClick={() => void handleCopyLink(inv)}
                          disabled={!inv.share_token || inv.status === 'deleted' || inv.status === 'draft'}
                          className="inline-flex h-8 w-8 items-center justify-center text-fg-muted hover:text-accent-text rounded-md hover:bg-hover transition disabled:invisible"
                          title="Copy public link"
                        >
                          {copiedToken === inv.share_token ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Share2 className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRegenerateLink(inv)}
                          disabled={inv.status === 'deleted' || inv.status === 'draft'}
                          className="inline-flex h-8 w-8 items-center justify-center text-fg-muted hover:text-accent-text rounded-md hover:bg-hover transition disabled:invisible"
                          title="Regenerate public link (old link stops working)"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Detail Drawer */}
      {isDrawerOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-slate-900/40 backdrop-blur-xs transition">
          <div className="bg-surface w-full max-w-4xl h-full shadow-2xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="sticky top-0 z-10 border-b border-border bg-surface">
              <div className="flex items-start gap-3 px-5 pt-4 pb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold tracking-tight text-fg truncate">
                      {selectedInvoice.number}
                    </h2>
                    {getStatusBadge(selectedInvoice)}
                  </div>
                  <p className="mt-0.5 text-xs text-fg-muted truncate">{selectedInvoice.client_name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="shrink-0 p-1.5 text-fg-muted hover:text-fg-2 rounded-lg hover:bg-hover transition"
                  aria-label="Close invoice"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
                {selectedInvoice.status !== 'deleted' && (
                  <button
                    type="button"
                    onClick={() => handleEditInvoice(selectedInvoice)}
                    className="px-3 py-1.5 bg-accent-soft text-accent-text font-semibold text-xs rounded-lg transition inline-flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleCopyLink(selectedInvoice)}
                  disabled={!selectedInvoice.share_token || selectedInvoice.status === 'draft'}
                  className="px-3 py-1.5 border border-border-strong hover:bg-canvas text-fg-2 font-semibold text-xs rounded-lg transition inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                  {copiedToken === selectedInvoice.share_token ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
                  Copy public link
                </button>

                {selectedInvoice.balance_due > 0 && selectedInvoice.status !== 'draft' && selectedInvoice.status !== 'void' && selectedInvoice.status !== 'deleted' && onRecordPaymentForInvoice && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDrawerOpen(false);
                      onRecordPaymentForInvoice(selectedInvoice);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition inline-flex items-center gap-1.5"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Record Payment
                  </button>
                )}

                {selectedInvoice.status !== 'deleted' && (
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(selectedInvoice)}
                  className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-xs rounded-lg transition inline-flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
                )}

                <a
                  href={financeService.getInvoicePdfUrl(selectedInvoice.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 border border-border-strong hover:bg-canvas text-fg-2 font-semibold text-xs rounded-lg transition inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </a>

                {selectedInvoice.status !== 'void' && selectedInvoice.status !== 'deleted' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setVoidModalInv(selectedInvoice)}
                      className="px-3 py-1.5 text-amber-700 hover:bg-amber-50 font-semibold text-xs rounded-lg transition"
                    >
                      On hold
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteModalInv(selectedInvoice)}
                      className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 font-semibold text-xs rounded-lg transition"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Drawer Body: Preview + Payment Timeline */}
            <div className="p-6 space-y-6">
              {drawerLoading ? (
                <DrawerSkeleton />
              ) : (
              <>
              {selectedInvoice.status === 'deleted' && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 px-4 py-3 text-xs text-rose-800 dark:text-rose-300">
                  <p className="font-semibold">Stored deleted invoice</p>
                  {selectedInvoice.deleted_reason && (
                    <p className="mt-1">Reason: {selectedInvoice.deleted_reason}</p>
                  )}
                  {selectedInvoice.deleted_at && (
                    <p className="mt-1 text-rose-700/80 dark:text-rose-400">
                      Deleted {formatInvoiceDate(selectedInvoice.deleted_at)}
                    </p>
                  )}
                </div>
              )}
              {/* Payment Timeline if receipts exist */}
              {selectedInvoice.receipts && selectedInvoice.receipts.length > 0 && (
                <div className="bg-canvas p-4 rounded-lg border border-border">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-fg-2 mb-3 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" /> Payment History & Receipts
                  </h3>
                  <div className="space-y-2">
                    {selectedInvoice.receipts.map((rcpt) => (
                      <div
                        key={rcpt.id}
                        className="p-3 bg-surface rounded-lg border border-border flex justify-between items-center text-xs"
                      >
                        <div>
                          <p className="font-bold text-fg">
                            {rcpt.number} · {rcpt.date}
                          </p>
                          <p className="text-fg-muted">
                            Via {rcpt.method.toUpperCase()}
                            {rcpt.bank ? ` (${rcpt.bank.toUpperCase()})` : ''}
                            {rcpt.reference_number ? ` · Ref: ${rcpt.reference_number}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-emerald-600">
                            +{formatMinorMoney(rcpt.amount_received, rcpt.currency)}
                          </p>
                          {rcpt.wht_amount > 0 && (
                            <p className="text-[10px] text-fg-muted">
                              WHT: {formatMinorMoney(rcpt.wht_amount, rcpt.currency)}
                            </p>
                          )}
                          {(rcpt.proof_file_ids?.length || rcpt.wht_certificate_file_id) ? (
                            <div className="mt-1 flex justify-end gap-1">
                              {rcpt.proof_file_ids?.map((fileId, idx) => (
                                <button
                                  key={fileId}
                                  type="button"
                                  onClick={() =>
                                    void openFileAttachment(
                                      financeService.getProofFileUrl(fileId),
                                      `proof-${idx + 1}`,
                                    )
                                  }
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-text hover:underline"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  Slip {rcpt.proof_file_ids.length > 1 ? idx + 1 : ''}
                                </button>
                              ))}
                              {rcpt.wht_certificate_file_id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void openFileAttachment(
                                      financeService.getProofFileUrl(rcpt.wht_certificate_file_id!),
                                      'wht-certificate',
                                    )
                                  }
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-text hover:underline"
                                >
                                  WHT cert
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-zinc-200 -mx-6 px-6 py-8">
                <InvoicePreview invoice={selectedInvoice} companySettings={settings || undefined} />
              </div>
              </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {voidModalInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-fg flex items-center gap-2 text-amber-700">
              <Ban className="w-5 h-5" /> Place {voidModalInv.number} on hold
            </h3>
            <p className="text-xs text-fg-2">
              On hold keeps the invoice on record. Its amount will not transfer to receivables
              until it is no longer on hold. Invoices with pending or approved receipts cannot be held.
            </p>

            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-1">
                Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Client requested revised scope / cancelled contract..."
                className="w-full text-xs rounded-lg border border-border-strong p-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setVoidModalInv(null);
                  setVoidReason('');
                }}
                className="px-4 py-2 border border-border-strong text-fg-2 hover:bg-canvas text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={!voidReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                Confirm on hold
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-fg flex items-center gap-2 text-rose-600">
              Delete invoice {deleteModalInv.number}
            </h3>
            <p className="text-xs text-fg-2">
              The invoice is removed from live lists but kept as an audit record.
            </p>
            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-1">
                Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Duplicate / entered in error..."
                className="w-full text-xs rounded-lg border border-border-strong p-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalInv(null);
                  setDeleteReason('');
                }}
                className="px-4 py-2 border border-border-strong text-fg-2 hover:bg-canvas text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={!deleteReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                Delete with record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
