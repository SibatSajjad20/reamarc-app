import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Download,
  Ban,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { workspaceService } from '../../services/workspaceService';
import { formatMinorMoney, majorToMinor, minorToMajor } from '../../utils/money';
import { FINANCE_PROOF_ACCEPT } from '../../utils/financeProof';
import { CustomSelect } from '../ui/CustomSelect';
import { Input } from '../ui/input';
import { CURRENCY_OPTIONS } from './financeUi';
import type {
  Receipt,
  ReceiptCreatePayload,
  Invoice,
  Currency,
  PaymentMethod,
  BankId,
} from '../../types/finance';
import type { Workspace } from '../../types';

interface ReceiptsViewProps {
  initialInvoiceToPay?: Invoice | null;
  onPaymentSuccess?: () => void;
}

export const ReceiptsView: React.FC<ReceiptsViewProps> = ({
  initialInvoiceToPay,
  onPaymentSuccess,
}) => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [voidModalRcpt, setVoidModalRcpt] = useState<Receipt | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Payment Form State
  const [clientName, setClientName] = useState<string>(initialInvoiceToPay?.client_name || '');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(initialInvoiceToPay?.workspace_id || '');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState<Currency>(initialInvoiceToPay?.currency || 'PKR');
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [bank, setBank] = useState<BankId>('meezan');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [amountReceivedMajor, setAmountReceivedMajor] = useState<number>(
    initialInvoiceToPay ? minorToMajor(initialInvoiceToPay.balance_due) : 0
  );
  const [whtAmountMajor, setWhtAmountMajor] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(currency === 'PKR' ? 1.0 : 278.50);
  const [memo, setMemo] = useState<string>('');
  const [proofFileIds, setProofFileIds] = useState<string[]>([]);
  const [whtCertFileId, setWhtCertFileId] = useState<string | null>(null);

  // Allocations mapping: invoiceId -> { selected: bool, amountMajor: number, whtMajor: number }
  interface AllocRowState {
    invoice: Invoice;
    selected: boolean;
    amountMajor: number;
    whtMajor: number;
  }
  const [allocRows, setAllocRows] = useState<AllocRowState[]>([]);

  // Load receipts & workspaces
  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const [res, ws] = await Promise.all([
        financeService.getReceipts(),
        workspaceService.getWorkspaces().catch(() => []),
      ]);
      setReceipts(res.items || []);
      setWorkspaces(ws || []);
    } catch (err: any) {
      console.error('Error fetching receipts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, []);

  // When client changes, load that client's open invoices
  useEffect(() => {
    if (!clientName.trim()) {
      setOpenInvoices([]);
      setAllocRows([]);
      return;
    }

    const loadOpenInvoices = async () => {
      try {
        const res = await financeService.getInvoices({
          status: 'unpaid',
          search: clientName.trim(),
        });
        const clientMatches = (res.items || []).filter(
          (inv) =>
            inv.client_name.toLowerCase().trim() === clientName.toLowerCase().trim() &&
            inv.balance_due > 0 &&
            inv.status !== 'draft' &&
            inv.status !== 'void'
        );
        setOpenInvoices(clientMatches);

        // Pre-fill allocation rows
        const initialRows: AllocRowState[] = clientMatches.map((inv) => ({
          invoice: inv,
          selected: initialInvoiceToPay ? inv.id === initialInvoiceToPay.id : true,
          amountMajor: initialInvoiceToPay
            ? inv.id === initialInvoiceToPay.id
              ? minorToMajor(inv.balance_due)
              : 0
            : minorToMajor(inv.balance_due),
          whtMajor: 0,
        }));
        setAllocRows(initialRows);
      } catch (err) {
        console.error('Error loading open invoices for client:', err);
      }
    };
    loadOpenInvoices();
  }, [clientName]);

  // Handle client selection from dropdown
  const handleSelectWorkspace = (wsId: string) => {
    setSelectedWorkspaceId(wsId);
    const ws = workspaces.find((w) => w.id === wsId);
    if (ws) {
      setClientName(ws.name);
    }
  };

  // Calculations
  const amountReceivedMinor = majorToMinor(amountReceivedMajor);
  const whtAmountMinor = majorToMinor(whtAmountMajor);
  const settlesTotalMinor = amountReceivedMinor + whtAmountMinor;

  const totalAllocatedAmountMinor = useMemo(() => {
    return allocRows
      .filter((r) => r.selected)
      .reduce((sum, r) => sum + majorToMinor(r.amountMajor), 0);
  }, [allocRows]);

  const totalAllocatedWhtMinor = useMemo(() => {
    return allocRows
      .filter((r) => r.selected)
      .reduce((sum, r) => sum + majorToMinor(r.whtMajor), 0);
  }, [allocRows]);

  const totalAllocatedSettlementMinor = totalAllocatedAmountMinor + totalAllocatedWhtMinor;
  const unappliedCreditMinor = Math.max(0, settlesTotalMinor - totalAllocatedSettlementMinor);

  // Live PKR amount calculation for Foreign Currency receipts
  const pkrCreditedMajor = useMemo(() => {
    if (currency === 'PKR') return amountReceivedMajor;
    return amountReceivedMajor * (exchangeRate || 1.0);
  }, [currency, amountReceivedMajor, exchangeRate]);

  // File Upload Handlers
  const handleUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await financeService.uploadProofFile(file);
      setProofFileIds((prev) => [...prev, res.file_id]);
      setSuccessMsg(`Proof uploaded: ${res.filename}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    }
  };

  const handleUploadWhtCert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await financeService.uploadProofFile(file);
      setWhtCertFileId(res.file_id);
      setSuccessMsg(`WHT Certificate uploaded: ${res.filename}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    }
  };

  const handlePostReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clientName.trim()) {
      setError('Please select or enter a client name');
      return;
    }
    if (amountReceivedMinor + whtAmountMinor <= 0) {
      setError('Receipt amount received or WHT withheld must be greater than zero');
      return;
    }
    if (method === 'bank' && !referenceNumber.trim()) {
      setError('Bank payments require a Reference / Cheque number');
      return;
    }
    if (currency !== 'PKR' && (!exchangeRate || exchangeRate <= 0)) {
      setError(`Foreign currency (${currency}) requires a positive exchange rate`);
      return;
    }
    if (totalAllocatedAmountMinor > amountReceivedMinor) {
      setError(`Allocated cash amount exceeds total amount received`);
      return;
    }
    if (totalAllocatedWhtMinor > whtAmountMinor) {
      setError(`Allocated WHT exceeds total WHT withheld`);
      return;
    }
    const overAllocated = allocRows.find(
      (r) => r.selected && majorToMinor(r.amountMajor) + majorToMinor(r.whtMajor) > r.invoice.balance_due
    );
    if (overAllocated) {
      setError(
        `Allocation for ${overAllocated.invoice.number} exceeds remaining balance of ${formatMinorMoney(overAllocated.invoice.balance_due, currency)}`
      );
      return;
    }

    setPosting(true);
    try {
      const allocationsPayload = allocRows
        .filter((r) => r.selected && (r.amountMajor > 0 || r.whtMajor > 0))
        .map((r) => ({
          invoice_id: r.invoice.id,
          amount: majorToMinor(r.amountMajor),
          wht: majorToMinor(r.whtMajor),
        }));

      const payload: ReceiptCreatePayload = {
        workspace_id: selectedWorkspaceId || null,
        client_name: clientName.trim(),
        date: paymentDate,
        currency,
        amount_received: amountReceivedMinor,
        wht_amount: whtAmountMinor,
        method,
        bank: method === 'bank' ? bank : null,
        reference_number: method === 'bank' ? referenceNumber.trim() : null,
        exchange_rate: currency === 'PKR' ? null : exchangeRate,
        memo: memo.trim() || null,
        allocations: allocationsPayload,
        proof_file_ids: proofFileIds,
        wht_certificate_file_id: whtCertFileId,
      };

      await financeService.postReceipt(payload);
      setSuccessMsg('Receipt recorded and ledger posted successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);

      // Reset form
      setAmountReceivedMajor(0);
      setWhtAmountMajor(0);
      setReferenceNumber('');
      setMemo('');
      setProofFileIds([]);
      setWhtCertFileId(null);
      fetchReceipts();
      onPaymentSuccess?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to post receipt');
    } finally {
      setPosting(false);
    }
  };

  const handleVoidReceipt = async () => {
    if (!voidModalRcpt || !voidReason.trim()) return;
    try {
      await financeService.voidReceipt(voidModalRcpt.id, voidReason);
      setVoidModalRcpt(null);
      setVoidReason('');
      fetchReceipts();
    } catch (err: any) {
      setError(err?.message || 'Failed to void receipt');
    }
  };

  return (
    <div className="p-6 w-full space-y-8">
      {/* Top Banner */}
      <div>
        <h1 className="text-h1 font-semibold tracking-tight text-fg">Record Payments & Receipts</h1>
        <p className="text-xs text-fg-muted mt-1">
          Allocate client payments to open invoices, record WHT tax deductions, post money movements to Cash/Bank ledger, and issue receipts
        </p>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Record Payment Section */}
      <div className="bg-surface rounded-lg border border-border p-6 space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <CreditCard className="w-5 h-5 text-accent-text" />
          <h2 className="text-base font-bold text-fg">Record New Payment</h2>
        </div>

        <form onSubmit={handlePostReceipt} className="space-y-6">
          {/* Row 1: Client & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-fg-2 mb-1">
                Client (Workspace) <span className="text-rose-500">*</span>
              </label>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <CustomSelect
                    value={selectedWorkspaceId}
                    onChange={handleSelectWorkspace}
                    searchable
                    placeholder="Select client"
                    options={[
                      { value: '', label: 'Type a client name' },
                      ...workspaces.map((ws) => ({ value: ws.id, label: ws.name })),
                    ]}
                  />
                </div>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Or type client name..."
                  className="w-1/2"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-1">Payment Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full text-xs rounded-lg border border-border-strong px-3 py-2 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-1">Currency</label>
              <CustomSelect
                value={currency}
                onChange={(value) => setCurrency(value as Currency)}
                options={CURRENCY_OPTIONS}
              />
            </div>
          </div>

          {/* Row 2: Method & Bank */}
          <div className="p-4 rounded-lg bg-canvas border border-border grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-2">Payment Method</label>
              <div className="flex items-center gap-4 text-xs font-medium text-fg-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="method"
                    value="bank"
                    checked={method === 'bank'}
                    onChange={() => setMethod('bank')}
                    className="text-accent-text focus-visible:focus-ring"
                  />
                  <span>Bank Transfer / Cheque</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="method"
                    value="cash"
                    checked={method === 'cash'}
                    onChange={() => setMethod('cash')}
                    className="text-accent-text focus-visible:focus-ring"
                  />
                  <span>Cash in Hand</span>
                </label>
              </div>
            </div>

            {method === 'bank' ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-fg-2 mb-2">Deposit Bank</label>
                  <div className="flex items-center gap-4 text-xs font-medium text-fg-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="bank"
                        value="meezan"
                        checked={bank === 'meezan'}
                        onChange={() => setBank('meezan')}
                      />
                      <span>Meezan Bank</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="bank"
                        value="abl"
                        checked={bank === 'abl'}
                        onChange={() => setBank('abl')}
                      />
                      <span>Allied Bank (ABL)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 mb-1">
                    Reference / Cheque # <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="FT-9912048 or Cheque 0881..."
                    className="w-full text-xs rounded-lg border border-border-strong px-3 py-1.5 bg-surface font-medium"
                  />
                </div>
              </>
            ) : (
              <div className="sm:col-span-2 text-xs text-fg-muted italic">
                Cash received goes into the Cash in Hand clearing account. Can later be deposited into Meezan or ABL via Cash Transfer.
              </div>
            )}
          </div>

          {/* Row 3: Amounts, WHT, and Foreign Exchange */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-1">
                Amount Received ({currency}) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={amountReceivedMajor || ''}
                onChange={(e) => setAmountReceivedMajor(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full text-sm rounded-lg border border-border-strong px-3 py-2 font-bold text-fg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-1">
                WHT Withheld ({currency})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={whtAmountMajor || ''}
                onChange={(e) => setWhtAmountMajor(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full text-sm rounded-lg border border-border-strong px-3 py-2 font-medium text-fg-2"
              />
            </div>

            {currency !== 'PKR' && (
              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Exchange Rate (PKR / {currency}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={exchangeRate || ''}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                  className="w-full text-sm rounded-lg border border-border-strong px-3 py-2 font-semibold"
                />
              </div>
            )}

            <div className="p-3 bg-accent-soft/70 rounded-lg border border-indigo-100 text-xs">
              <span className="text-fg-muted block">Total Settles Invoice:</span>
              <span className="text-sm font-bold text-accent-text">
                {formatMinorMoney(settlesTotalMinor, currency)}
              </span>
              {currency !== 'PKR' && (
                <span className="block text-[11px] text-fg-muted mt-0.5">
                  Account Credit: ₨ {pkrCreditedMajor.toLocaleString(undefined, { maximumFractionDigits: 0 })} PKR
                </span>
              )}
            </div>
          </div>

          {/* Row 4: Open Invoices Allocation Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-subtle/70 px-4 py-2.5 border-b border-border flex justify-between items-center">
              <h3 className="text-xs font-bold text-fg uppercase tracking-wider">
                Allocate to Invoices ({openInvoices.length} open for {clientName || 'selected client'})
              </h3>
              <span className="text-xs text-fg-muted">
                Unapplied (Client Credit): <b className="text-accent-text">{formatMinorMoney(unappliedCreditMinor, currency)}</b>
              </span>
            </div>

            {openInvoices.length === 0 ? (
              <div className="p-6 text-center text-xs text-fg-muted italic">
                {clientName
                  ? 'No open invoices found for this client. The payment will be held as on-account client credit.'
                  : 'Select a client above to view and allocate to open invoices.'}
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-canvas text-fg-2 border-b border-border">
                    <th className="py-2.5 px-3 w-10">Apply</th>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-3 text-right">Invoice Total</th>
                    <th className="py-2.5 px-3 text-right">Balance Due</th>
                    <th className="py-2.5 px-3 text-right w-36">Apply Amount</th>
                    <th className="py-2.5 px-3 text-right w-32">Apply WHT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allocRows.map((row, idx) => (
                    <tr key={row.invoice.id} className={row.selected ? 'bg-accent-soft/30' : ''}>
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => {
                            const sel = e.target.checked;
                            const next = [...allocRows];
                            next[idx].selected = sel;
                            if (sel && next[idx].amountMajor === 0) {
                              next[idx].amountMajor = minorToMajor(row.invoice.balance_due);
                            }
                            setAllocRows(next);
                          }}
                          className="rounded text-accent-text focus-visible:focus-ring"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-fg">{row.invoice.number}</td>
                      <td className="py-2.5 px-3 text-fg-muted">{row.invoice.due_date}</td>
                      <td className="py-2.5 px-3 text-right text-fg-2">
                        {formatMinorMoney(row.invoice.total, row.invoice.currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-fg">
                        {formatMinorMoney(row.invoice.balance_due, row.invoice.currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          disabled={!row.selected}
                          value={row.amountMajor}
                          onChange={(e) => {
                            const next = [...allocRows];
                            next[idx].amountMajor = parseFloat(e.target.value) || 0;
                            setAllocRows(next);
                          }}
                          className="w-full text-right text-xs rounded border border-border-strong px-2 py-1 bg-surface font-medium disabled:opacity-50"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          disabled={!row.selected}
                          value={row.whtMajor}
                          onChange={(e) => {
                            const next = [...allocRows];
                            next[idx].whtMajor = parseFloat(e.target.value) || 0;
                            setAllocRows(next);
                          }}
                          className="w-full text-right text-xs rounded border border-border-strong px-2 py-1 bg-surface font-medium disabled:opacity-50"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Row 5: Attachments & Memo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-fg-2 mb-1">
                Receipt Memo / Notes
              </label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. Online Amount Received (Jahanzaib Raj) via Meezan Bank..."
                className="w-full text-xs rounded-lg border border-border-strong px-3 py-2"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="block text-xs font-semibold text-fg-2">Attachments</label>
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer text-center text-xs border border-dashed border-border-strong rounded-lg p-2 hover:bg-canvas transition text-fg-2 flex items-center justify-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{proofFileIds.length ? `${proofFileIds.length} Proof(s)` : 'Proof Slip'}</span>
                  <input type="file" onChange={handleUploadProof} className="hidden" accept={FINANCE_PROOF_ACCEPT} />
                </label>

                <label className="flex-1 cursor-pointer text-center text-xs border border-dashed border-border-strong rounded-lg p-2 hover:bg-canvas transition text-fg-2 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{whtCertFileId ? 'WHT Added' : 'WHT Cert'}</span>
                  <input type="file" onChange={handleUploadWhtCert} className="hidden" accept={FINANCE_PROOF_ACCEPT} />
                </label>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={posting}
              className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white font-bold text-xs rounded-lg shadow transition flex items-center gap-2 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {posting ? 'Posting Receipt & Ledger…' : 'Post Receipt'}
            </button>
          </div>
        </form>
      </div>

      {/* Receipts History Table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="text-sm font-bold text-fg">Receipts History</h2>
          <span className="text-xs text-fg-muted">{receipts.length} total receipts recorded</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas text-fg-2 border-b border-border">
                <th className="py-3 px-4 font-semibold">Receipt #</th>
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Client</th>
                <th className="py-3 px-4 font-semibold">Method / Bank</th>
                <th className="py-3 px-4 font-semibold">Reference</th>
                <th className="py-3 px-4 font-semibold text-right">Amount Received</th>
                <th className="py-3 px-4 font-semibold text-right">WHT</th>
                <th className="py-3 px-4 font-semibold text-right">Total Settled</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-fg-muted">
                    Loading receipts…
                  </td>
                </tr>
              ) : receipts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-fg-muted">
                    No receipts recorded yet.
                  </td>
                </tr>
              ) : (
                receipts.map((rcpt) => (
                  <tr key={rcpt.id} className="hover:bg-canvas/60 transition">
                    <td className="py-3 px-4 font-bold text-fg">{rcpt.number}</td>
                    <td className="py-3 px-4 text-fg-2">{rcpt.date}</td>
                    <td className="py-3 px-4 font-medium text-fg">{rcpt.client_name}</td>
                    <td className="py-3 px-4 text-fg-2">
                      <span className="capitalize">{rcpt.method}</span>
                      {rcpt.bank && <span className="font-semibold text-fg"> ({rcpt.bank.toUpperCase()})</span>}
                    </td>
                    <td className="py-3 px-4 text-fg-2">{rcpt.reference_number || '—'}</td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                      {formatMinorMoney(rcpt.amount_received, rcpt.currency)}
                    </td>
                    <td className="py-3 px-4 text-right text-fg-2">
                      {formatMinorMoney(rcpt.wht_amount, rcpt.currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-fg">
                      {formatMinorMoney(rcpt.settles_total, rcpt.currency)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {rcpt.status === 'posted' ? (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Posted
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-200 text-fg-2 line-through">
                          Void
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <a
                        href={financeService.getReceiptPdfUrl(rcpt.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-fg-muted hover:text-accent-text rounded hover:bg-hover transition inline-block"
                        title="Download Receipt PDF"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      {rcpt.status === 'posted' && (
                        <button
                          onClick={() => setVoidModalRcpt(rcpt)}
                          className="p-1.5 text-fg-muted hover:text-rose-600 rounded hover:bg-hover transition inline-block"
                          title="Void receipt (reverses ledger and reopens invoice)"
                        >
                          <Ban className="w-4 h-4" />
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

      {/* Void Receipt Confirmation Modal */}
      {voidModalRcpt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-rose-600 flex items-center gap-2">
              <Ban className="w-5 h-5" /> Void Receipt {voidModalRcpt.number}
            </h3>
            <p className="text-xs text-fg-2">
              Voiding a receipt immediately appends compensating reversal entries to the Cash/Bank ledger
              and re-opens the allocated invoices' balances.
            </p>

            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-1">
                Reason for voiding <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Bounced cheque / payment disputed..."
                className="w-full text-xs rounded-lg border border-border-strong p-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setVoidModalRcpt(null);
                  setVoidReason('');
                }}
                className="px-4 py-2 border border-border-strong text-fg-2 hover:bg-canvas text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVoidReceipt}
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
