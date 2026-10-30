import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  CreditCard,
  Download,
  AlertCircle,
  ShieldCheck,
  Check,
  Paperclip,
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { workspaceService } from '../../services/workspaceService';
import { formatMinorMoney, majorToMinor, minorToMajor, parseMajorGrouped } from '../../utils/money';
import { formatInvoiceNumber } from '../../utils/formatInvoiceNumber';
import { AmountInput, CURRENCY_OPTIONS, FinanceProofSlot } from './financeUi';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { TableSkeletonRows } from '../ui/Skeletons';
import { CustomSelect } from '../ui/CustomSelect';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { useToast } from '../../context/ToastContext';
import { openFileAttachment } from '../../utils/fileUrl';
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
  const cachedReceipts = financeService.getCachedReceipts();
  const [receipts, setReceipts] = useState<Receipt[]>(() => cachedReceipts?.data.items || []);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(!cachedReceipts);
  const [uploadingKind, setUploadingKind] = useState<'proof' | 'wht' | null>(null);
  const [posting, setPosting] = useState(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadReqIdRef = useRef(0);
  useModuleLoadGate(loading);
  const [error, setError] = useState<string | null>(null);
  const [isCheque, setIsCheque] = useState(false);
  const { addToast } = useToast();
  const formErrorRef = useRef<HTMLParagraphElement | null>(null);

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
  const [proofFile, setProofFile] = useState<{ id: string; filename: string } | null>(null);
  const [whtCert, setWhtCert] = useState<{ id: string; filename: string } | null>(null);

  // Allocations mapping: invoiceId -> { selected: bool, amountMajor: number, whtMajor: number }
  interface AllocRowState {
    invoice: Invoice;
    selected: boolean;
    amountMajor: number;
    whtMajor: number;
  }
  const [allocRows, setAllocRows] = useState<AllocRowState[]>([]);

  const fetchReceipts = useCallback(async (opts?: { silent?: boolean }) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const reqId = ++loadReqIdRef.current;
    const cached = financeService.getCachedReceipts();
    const silent = Boolean(opts?.silent) || Boolean(cached);

    if (cached && !opts?.silent) {
      setReceipts(cached.data.items || []);
      setLoading(false);
    } else if (!silent) {
      setLoading(true);
    }

    try {
      const [res, ws] = await Promise.all([
        financeService.getReceipts({}, { signal: controller.signal }),
        workspaceService.getWorkspaces().catch(() => []),
      ]);
      if (reqId !== loadReqIdRef.current) return;
      setReceipts(res.items || []);
      setWorkspaces(ws || []);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== loadReqIdRef.current) return;
      console.error('Error fetching receipts:', err);
    } finally {
      if (reqId === loadReqIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchReceipts();
    return () => loadAbortRef.current?.abort();
  }, [fetchReceipts]);

  useEffect(() => {
    if (!initialInvoiceToPay) return;
    setClientName(initialInvoiceToPay.client_name || '');
    setSelectedWorkspaceId(initialInvoiceToPay.workspace_id || '');
    setCurrency(initialInvoiceToPay.currency || 'PKR');
    setAmountReceivedMajor(minorToMajor(initialInvoiceToPay.balance_due));
  }, [initialInvoiceToPay]);

  useCacheInvalidation(['finance'], () => {
    void fetchReceipts({ silent: true });
  });

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
  }, [clientName, initialInvoiceToPay]);

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

  useEffect(() => {
    const selected = allocRows.filter((r) => r.selected);
    if (selected.length === 0) return;
    setAmountReceivedMajor(selected.reduce((sum, r) => sum + r.amountMajor, 0));
    setWhtAmountMajor(selected.reduce((sum, r) => sum + r.whtMajor, 0));
  }, [allocRows]);

  // Live PKR amount calculation for Foreign Currency receipts
  const pkrCreditedMajor = useMemo(() => {
    if (currency === 'PKR') return amountReceivedMajor;
    return amountReceivedMajor * (exchangeRate || 1.0);
  }, [currency, amountReceivedMajor, exchangeRate]);

  // File Upload Handlers
  const uploadFinanceAttachment = async (
    file: File,
    kind: 'proof' | 'wht',
  ) => {
    setUploadingKind(kind);
    setError(null);
    try {
      const res = await financeService.uploadProofFile(file);
      if (kind === 'proof') {
        setProofFile({ id: res.file_id, filename: res.filename });
        addToast('Proof slip uploaded', res.filename, 'success');
      } else {
        setWhtCert({ id: res.file_id, filename: res.filename });
        addToast('WHT certificate uploaded', res.filename, 'success');
      }
    } catch (err: any) {
      const message = err?.message || (kind === 'proof' ? 'Proof slip upload failed' : 'WHT certificate upload failed');
      setError(message);
      addToast(kind === 'proof' ? 'Proof slip upload failed' : 'WHT certificate upload failed', message, 'error');
    } finally {
      setUploadingKind(null);
    }
  };

  const showFormError = (message: string) => {
    setError(message);
    addToast('Could not record receipt', message, 'error');
    requestAnimationFrame(() => {
      formErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handlePostReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clientName.trim()) {
      showFormError('Please select or enter a client name');
      return;
    }
    if (amountReceivedMinor + whtAmountMinor <= 0) {
      showFormError('Receipt amount received or WHT withheld must be greater than zero');
      return;
    }
    if (method === 'bank' && !referenceNumber.trim()) {
      showFormError('Bank payments require a Reference / Deposit Slip Number');
      return;
    }
    if (currency !== 'PKR' && (!exchangeRate || exchangeRate <= 0)) {
      showFormError(`Foreign currency (${currency}) requires a positive exchange rate`);
      return;
    }
    if (totalAllocatedAmountMinor > amountReceivedMinor) {
      showFormError('Allocated cash amount exceeds total amount received');
      return;
    }
    if (totalAllocatedWhtMinor > whtAmountMinor) {
      showFormError('Allocated WHT exceeds total WHT withheld');
      return;
    }
    const overAllocated = allocRows.find(
      (r) => r.selected && majorToMinor(r.amountMajor) + majorToMinor(r.whtMajor) > r.invoice.balance_due
    );
    if (overAllocated) {
      showFormError(
        `Allocation for ${formatInvoiceNumber(overAllocated.invoice.number)} exceeds remaining balance of ${formatMinorMoney(overAllocated.invoice.balance_due, currency)}`
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
        memo: memo.trim() || `${clientName.trim()} received from this bank`,
        allocations: allocationsPayload,
        proof_file_ids: proofFile ? [proofFile.id] : [],
        wht_certificate_file_id: whtCert?.id || null,
        is_cheque: isCheque,
      };

      const created = await financeService.postReceipt(payload);
      if (isCheque) {
        addToast(
          'Cheque receipt created',
          created.number ? `${created.number} is waiting for approval.` : 'Sent to pending requests.',
          'success',
        );
      } else {
        addToast(
          'Receipt recorded',
          created.number ? `${created.number} was posted to the ledger.` : 'Payment posted to the ledger.',
          'success',
        );
      }

      setAmountReceivedMajor(0);
      setWhtAmountMajor(0);
      setReferenceNumber('');
      setMemo('');
      setProofFile(null);
      setWhtCert(null);
      setIsCheque(false);
      fetchReceipts();
      onPaymentSuccess?.();
    } catch (err: any) {
      showFormError(err?.message || 'Failed to post receipt');
    } finally {
      setPosting(false);
    }
  };

  const handleApproveReceipt = async (id: string) => {
    try {
      await financeService.confirmReceipt(id);
      addToast('Receipt approved', 'The receipt is now posted.', 'success');
      fetchReceipts();
    } catch (err: any) {
      const message = err?.message || 'Failed to approve receipt';
      setError(message);
      addToast('Could not approve receipt', message, 'error');
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
              <CustomDatePicker
                value={paymentDate}
                onChange={setPaymentDate}
                clearable={false}
                offDayMode="none"
                aria-label="Payment date"
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
              <p className="block text-label font-medium text-fg mb-2">Payment Method</p>
              <RadioGroup
                value={method}
                onValueChange={(value) => setMethod(value as PaymentMethod)}
                className="flex flex-wrap items-center gap-4"
              >
                <label className="inline-flex items-center gap-2 cursor-pointer text-ui text-fg">
                  <RadioGroupItem value="bank" />
                  Bank Transfer / Cheque
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer text-ui text-fg">
                  <RadioGroupItem value="cash" />
                  Cash in Hand
                </label>
              </RadioGroup>
              <label className="mt-3 inline-flex items-center gap-2 cursor-pointer text-ui text-fg">
                <Checkbox
                  checked={isCheque}
                  onCheckedChange={(checked) => setIsCheque(checked === true)}
                />
                Cheque (send to pending requests)
              </label>
            </div>

            {method === 'bank' ? (
              <>
                <div>
                  <p className="block text-label font-medium text-fg mb-2">Deposit Bank</p>
                  <RadioGroup
                    value={bank}
                    onValueChange={(value) => setBank(value as BankId)}
                    className="flex flex-wrap items-center gap-4"
                  >
                    <label className="inline-flex items-center gap-2 cursor-pointer text-ui text-fg">
                      <RadioGroupItem value="meezan" />
                      Meezan Bank
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer text-ui text-fg">
                      <RadioGroupItem value="abl" />
                      Allied Bank (ABL)
                    </label>
                  </RadioGroup>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 mb-1">
                    Reference / Deposit Slip Number <span className="text-rose-500">*</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-1">
                Amount Received ({currency}) <span className="text-rose-500">*</span>
              </label>
              <AmountInput
                value={amountReceivedMajor || ''}
                onChange={(raw) => setAmountReceivedMajor(parseMajorGrouped(raw))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-2 mb-1">
                WHT Withheld ({currency})
              </label>
              <AmountInput
                value={whtAmountMajor || ''}
                onChange={(raw) => setWhtAmountMajor(parseMajorGrouped(raw))}
              />
            </div>

            {currency !== 'PKR' && (
              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Exchange Rate (PKR / {currency}) <span className="text-rose-500">*</span>
                </label>
                <AmountInput
                  value={exchangeRate || ''}
                  onChange={(raw) => setExchangeRate(parseMajorGrouped(raw))}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-subtle px-4 py-3">
            <div>
              <p className="text-caption text-fg-muted">Total settles invoices</p>
              {currency !== 'PKR' && (
                <p className="text-caption text-fg-muted mt-0.5">
                  Account credit ₨{pkrCreditedMajor.toLocaleString('en-US', { maximumFractionDigits: 0 })} PKR
                </p>
              )}
            </div>
            <p className="text-h3 font-semibold font-numeric text-fg">
              {formatMinorMoney(settlesTotalMinor, currency)}
            </p>
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
                    <th className="py-2.5 px-3 text-right w-36">Apply Amount</th>
                    <th className="py-2.5 px-3 text-right w-32">Apply WHT</th>
                    <th className="py-2.5 px-3 text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allocRows.map((row, idx) => (
                    <tr key={row.invoice.id} className={row.selected ? 'bg-accent-soft/30' : ''}>
                      <td className="py-2.5 px-3 align-middle">
                        <Checkbox
                          checked={row.selected}
                          onCheckedChange={(checked) => {
                            const sel = checked === true;
                            const next = [...allocRows];
                            next[idx].selected = sel;
                            if (sel && next[idx].amountMajor === 0) {
                              next[idx].amountMajor = minorToMajor(row.invoice.balance_due);
                            }
                            setAllocRows(next);
                          }}
                          aria-label={`Allocate ${formatInvoiceNumber(row.invoice.number)}`}
                        />
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-fg">{formatInvoiceNumber(row.invoice.number)}</td>
                      <td className="py-2.5 px-3 text-fg-muted">{row.invoice.due_date}</td>
                      <td className="py-2.5 px-3 text-right text-fg-2">
                        {formatMinorMoney(row.invoice.total, row.invoice.currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <AmountInput
                          disabled={!row.selected}
                          value={row.amountMajor}
                          onChange={(raw) => {
                            const next = [...allocRows];
                            next[idx].amountMajor = parseMajorGrouped(raw);
                            setAllocRows(next);
                          }}
                          className="h-8 px-2 py-1 text-right text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <AmountInput
                          disabled={!row.selected}
                          value={row.whtMajor}
                          onChange={(raw) => {
                            const next = [...allocRows];
                            next[idx].whtMajor = parseMajorGrouped(raw);
                            setAllocRows(next);
                          }}
                          className="h-8 px-2 py-1 text-right text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-fg">
                        {formatMinorMoney(row.invoice.balance_due, row.invoice.currency)}
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
                    placeholder={`${clientName || 'Client name'} received from this bank`}
                className="w-full text-xs rounded-lg border border-border-strong px-3 py-2"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="block text-xs font-semibold text-fg-2">Attachments</label>
              <div className="grid grid-cols-2 gap-2">
                <FinanceProofSlot
                  emptyLabel="Proof Slip"
                  filename={proofFile?.filename}
                  uploading={uploadingKind === 'proof'}
                  disabled={uploadingKind !== null}
                  onFile={(file) => void uploadFinanceAttachment(file, 'proof')}
                  onClear={() => setProofFile(null)}
                  onOpen={
                    proofFile
                      ? () => void openFileAttachment(financeService.getProofFileUrl(proofFile.id), proofFile.filename)
                      : undefined
                  }
                />
                <FinanceProofSlot
                  emptyLabel="WHT Cert"
                  filename={whtCert?.filename}
                  uploading={uploadingKind === 'wht'}
                  disabled={uploadingKind !== null}
                  icon={<ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
                  onFile={(file) => void uploadFinanceAttachment(file, 'wht')}
                  onClear={() => setWhtCert(null)}
                  onOpen={
                    whtCert
                      ? () => void openFileAttachment(financeService.getProofFileUrl(whtCert.id), whtCert.filename)
                      : undefined
                  }
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex flex-col items-end gap-2 pt-2">
            {error && (
              <p ref={formErrorRef} className="w-full text-xs text-rose-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </p>
            )}
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
                <TableSkeletonRows rows={8} columns={10} />
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
                    <td className="py-3 px-4 align-middle">
                      <div className="flex items-center justify-center">
                        {rcpt.status === 'posted' && (
                          <span className="inline-flex h-7 items-center px-2.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Approved
                          </span>
                        )}
                        {rcpt.status === 'pending' && (
                          <span className="inline-flex h-7 items-center px-2.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Pending
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-middle">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
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
                            className="inline-flex h-7 w-7 items-center justify-center text-fg-muted hover:text-accent-text rounded-md hover:bg-hover transition"
                            title={rcpt.proof_file_ids.length > 1 ? `Open proof slip ${idx + 1}` : 'Open proof slip'}
                          >
                            <Paperclip className="w-4 h-4" />
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
                            className="inline-flex h-7 w-7 items-center justify-center text-fg-muted hover:text-accent-text rounded-md hover:bg-hover transition"
                            title="Open WHT certificate"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        )}
                        <a
                          href={financeService.getReceiptPdfUrl(rcpt.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-7 w-7 items-center justify-center text-fg-muted hover:text-accent-text rounded-md hover:bg-hover transition"
                          title="Download Receipt PDF"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        {rcpt.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => void handleApproveReceipt(rcpt.id)}
                            className="inline-flex h-7 items-center px-2.5 text-xs font-semibold rounded-md bg-accent text-accent-fg hover:bg-accent-hover"
                            title="Approve receipt"
                          >
                            Approve
                          </button>
                        )}
                      </div>
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
