import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Filter,
  Download,
  Share2,
  Copy,
  Check,
  Eye,
  CreditCard,
  Ban,
  FileCheck2,
  AlertTriangle,
  Clock,
  MoreVertical,
  ExternalLink,
  ChevronRight,
  X,
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { formatMinorMoney, getCurrencySymbol } from '../../utils/money';
import type { Invoice, FinanceSettings } from '../../types/finance';
import { InvoicePreview } from './InvoicePreview';
import { InvoiceStatusBadge } from './financeUi';
import { Button } from '../ui/button';

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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [voidModalInv, setVoidModalInv] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const [res, setts] = await Promise.all([
        financeService.getInvoices({ status: activeTab }),
        financeService.getSettings().catch(() => null),
      ]);
      setInvoices(res.items || []);
      if (setts) setSettings(setts);
    } catch (err: any) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [activeTab]);

  // Filtered by search
  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.toLowerCase().trim();
    return invoices.filter(
      (inv) =>
        inv.number?.toLowerCase().includes(q) ||
        inv.client_name?.toLowerCase().includes(q) ||
        inv.reference?.toLowerCase().includes(q)
    );
  }, [invoices, search]);

  // Metrics KPI calculations
  const metrics = useMemo(() => {
    let totalInvoiced = 0;
    let totalReceivables = 0;
    let totalPaid = 0;
    let overdueCount = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const inv of invoices) {
      if (inv.status !== 'void') {
        totalInvoiced += inv.total;
        totalReceivables += inv.balance_due;
        totalPaid += inv.amount_paid + inv.wht_settled;
        if (inv.balance_due > 0 && inv.due_date < today) {
          overdueCount++;
        }
      }
    }
    return { totalInvoiced, totalReceivables, totalPaid, overdueCount };
  }, [invoices]);

  const handleOpenDetail = async (inv: Invoice) => {
    try {
      const full = await financeService.getInvoice(inv.id);
      setSelectedInvoice(full);
      setIsDrawerOpen(true);
    } catch (err) {
      setSelectedInvoice(inv);
      setIsDrawerOpen(true);
    }
  };

  const handleDuplicate = async (inv: Invoice) => {
    try {
      const dup = await financeService.duplicateInvoice(inv.id);
      onEditInvoice(dup);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to duplicate invoice');
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
      setActionError(err?.message || 'Could not void invoice');
    }
  };

  const handleCopyLink = (token?: string | null) => {
    if (!token) return;
    const url = `${window.location.origin}/api/v1/finance/public/invoice/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleShareWhatsApp = (inv: Invoice) => {
    const text = encodeURIComponent(
      `Hello ${inv.client_name},\nHere is your invoice ${inv.number} for ${formatMinorMoney(
        inv.total,
        inv.currency
      )}.\nBalance Due: ${formatMinorMoney(inv.balance_due, inv.currency)}.\nView invoice online: ${
        window.location.origin
      }/api/v1/finance/public/invoice/${inv.share_token}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-surface p-5 rounded-lg border border-border">
          <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Total Invoiced</p>
          <p className="text-xl font-bold text-fg mt-1">
            {formatMinorMoney(metrics.totalInvoiced, 'PKR')}
          </p>
          <p className="text-[11px] text-fg-muted mt-0.5">Active invoices</p>
        </div>

        <div className="bg-surface p-5 rounded-lg border border-border">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Total Receivables</p>
          <p className="text-xl font-bold text-amber-700 mt-1">
            {formatMinorMoney(metrics.totalReceivables, 'PKR')}
          </p>
          <p className="text-[11px] text-amber-600/80 mt-0.5">Pending collection</p>
        </div>

        <div className="bg-surface p-5 rounded-lg border border-border">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Total Paid</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            {formatMinorMoney(metrics.totalPaid, 'PKR')}
          </p>
          <p className="text-[11px] text-emerald-600/80 mt-0.5">Cash/Bank + WHT Settled</p>
        </div>

        <div className="bg-surface p-5 rounded-lg border border-border">
          <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Overdue Invoices</p>
          <p className="text-xl font-bold text-rose-700 mt-1">{metrics.overdueCount}</p>
          <p className="text-[11px] text-rose-500 mt-0.5">Past due date</p>
        </div>
      </div>

      {/* Status Tabs & Search Bar */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-center gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {[
              { id: 'all', label: 'All' },
              { id: 'draft', label: 'Draft' },
              { id: 'unpaid', label: 'Unpaid' },
              { id: 'partially_paid', label: 'Partially Paid' },
              { id: 'overdue', label: 'Overdue' },
              { id: 'paid', label: 'Paid' },
              { id: 'void', label: 'Void' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'text-fg-2 hover:bg-hover'
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
                <tr>
                  <td colSpan={8} className="py-12 text-center text-fg-muted">
                    Loading invoices…
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-fg-muted">
                    No invoices found. Click "New Invoice" to create one.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => handleOpenDetail(inv)}
                    className="hover:bg-canvas/80 cursor-pointer transition"
                  >
                    <td className="py-3 px-4 font-bold text-fg flex items-center gap-1.5">
                      {inv.number}
                    </td>
                    <td className="py-3 px-4 font-medium text-fg">{inv.client_name}</td>
                    <td className="py-3 px-4 text-fg-muted">{inv.issue_date}</td>
                    <td className="py-3 px-4 text-fg-muted">{inv.due_date}</td>
                    <td className="py-3 px-4 text-right font-semibold text-fg">
                      {formatMinorMoney(inv.total, inv.currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-accent-text">
                      {formatMinorMoney(inv.balance_due, inv.currency)}
                    </td>
                    <td className="py-3 px-4 text-center">{getStatusBadge(inv)}</td>
                    <td
                      className="py-3 px-4 text-right space-x-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleOpenDetail(inv)}
                        className="p-1.5 text-fg-muted hover:text-accent-text rounded hover:bg-hover transition"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {inv.balance_due > 0 && inv.status !== 'draft' && inv.status !== 'void' && onRecordPaymentForInvoice && (
                        <button
                          onClick={() => onRecordPaymentForInvoice(inv)}
                          className="p-1.5 text-fg-muted hover:text-emerald-600 rounded hover:bg-hover transition"
                          title="Record payment"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                      )}

                      <a
                        href={financeService.getInvoicePdfUrl(inv.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-fg-muted hover:text-accent-text rounded hover:bg-hover transition inline-block"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </a>

                      {inv.share_token && (
                        <button
                          onClick={() => handleCopyLink(inv.share_token)}
                          className="p-1.5 text-fg-muted hover:text-accent-text rounded hover:bg-hover transition"
                          title="Copy public link"
                        >
                          {copiedToken === inv.share_token ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Share2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
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
            <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-surface z-10">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-fg">
                  {selectedInvoice.number} · {selectedInvoice.client_name}
                </h2>
                {getStatusBadge(selectedInvoice)}
              </div>

              <div className="flex items-center gap-2">
                {selectedInvoice.status === 'draft' && (
                  <button
                    onClick={() => {
                      setIsDrawerOpen(false);
                      onEditInvoice(selectedInvoice);
                    }}
                    className="px-3 py-1.5 bg-accent-soft text-accent-text hover:bg-accent-soft font-semibold text-xs rounded-lg transition"
                  >
                    Edit Draft
                  </button>
                )}

                {selectedInvoice.balance_due > 0 && selectedInvoice.status !== 'draft' && selectedInvoice.status !== 'void' && onRecordPaymentForInvoice && (
                  <button
                    onClick={() => {
                      setIsDrawerOpen(false);
                      onRecordPaymentForInvoice(selectedInvoice);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition flex items-center gap-1.5"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Record Payment
                  </button>
                )}

                <button
                  onClick={() => handleShareWhatsApp(selectedInvoice)}
                  className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-xs rounded-lg transition flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  WhatsApp
                </button>

                <a
                  href={financeService.getInvoicePdfUrl(selectedInvoice.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 border border-border-strong hover:bg-canvas text-fg-2 font-semibold text-xs rounded-lg transition flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </a>

                {selectedInvoice.status !== 'void' && (
                  <button
                    onClick={() => setVoidModalInv(selectedInvoice)}
                    className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 font-semibold text-xs rounded-lg transition"
                  >
                    Void
                  </button>
                )}

                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 text-fg-muted hover:text-fg-2 rounded-lg hover:bg-hover transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body: Preview + Payment Timeline */}
            <div className="p-6 space-y-6">
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
                        <div className="text-right">
                          <p className="font-bold text-emerald-600">
                            +{formatMinorMoney(rcpt.amount_received, rcpt.currency)}
                          </p>
                          {rcpt.wht_amount > 0 && (
                            <p className="text-[10px] text-fg-muted">
                              WHT: {formatMinorMoney(rcpt.wht_amount, rcpt.currency)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Render Invoice PDF preview */}
              <InvoicePreview invoice={selectedInvoice} companySettings={settings || undefined} />
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {voidModalInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-fg flex items-center gap-2 text-rose-600">
              <Ban className="w-5 h-5" /> Void Invoice {voidModalInv.number}
            </h3>
            <p className="text-xs text-fg-2">
              Voiding an invoice preserves it on record for auditing but cancels the balance due.
              Invoices with active receipts cannot be voided until those receipts are voided.
            </p>

            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-1">
                Reason for voiding <span className="text-rose-500">*</span>
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
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
