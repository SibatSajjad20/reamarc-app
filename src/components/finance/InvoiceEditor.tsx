import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  Send,
  Save,
  Eye,
  AlertCircle,
  Building,
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { workspaceService } from '../../services/workspaceService';
import { formatMinorMoney, majorToMinor, minorToMajor, amountInWords, parseMajorGrouped } from '../../utils/money';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { CustomSelect } from '../ui/CustomSelect';
import { AmountInput, CURRENCY_OPTIONS } from './financeUi';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import type {
  Invoice,
  InvoiceCreatePayload,
  InvoiceLineItem,
  FinanceService,
  FinanceSettings,
  Currency,
  BankAccountConfig,
} from '../../types/finance';
import type { Workspace } from '../../types';
import { InvoicePreview } from './InvoicePreview';
import { formatInvoiceNumber } from '../../utils/formatInvoiceNumber';

interface InvoiceEditorProps {
  invoiceId?: string | null;
  initialInvoice?: Invoice | null;
  onBack: () => void;
  onSaved: (invoice: Invoice) => void;
}

export const InvoiceEditor: React.FC<InvoiceEditorProps> = ({
  invoiceId,
  initialInvoice,
  onBack,
  onSaved,
}) => {
  const cachedServices = financeService.getCachedServices(true);
  const cachedSettings = financeService.getCachedSettings();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [services, setServices] = useState<FinanceService[]>(() => cachedServices?.data || []);
  const [settings, setSettings] = useState<FinanceSettings | null>(() => cachedSettings?.data || null);

  const [workspaceId, setWorkspaceId] = useState<string>(initialInvoice?.workspace_id || '');
  const [clientName, setClientName] = useState<string>(initialInvoice?.client_name || '');
  const [billingName, setBillingName] = useState<string>(initialInvoice?.client_billing?.name || '');
  const [billingEmail, setBillingEmail] = useState<string>(initialInvoice?.client_billing?.email || '');
  const [billingPhone, setBillingPhone] = useState<string>(initialInvoice?.client_billing?.phone || '');
  const [billingAddress, setBillingAddress] = useState<string>(initialInvoice?.client_billing?.address || '');
  const [taxId] = useState<string>(initialInvoice?.client_billing?.tax_id || '');

  const [currency, setCurrency] = useState<Currency>(initialInvoice?.currency || 'PKR');
  const [issueDate, setIssueDate] = useState<string>(
    initialInvoice?.issue_date || new Date().toISOString().split('T')[0]
  );
  const [termsPreset, setTermsPreset] = useState<string>(initialInvoice?.terms || 'Due on receipt');
  const [dueDate, setDueDate] = useState<string>(
    initialInvoice?.due_date || new Date().toISOString().split('T')[0]
  );
  const [reference] = useState<string>(initialInvoice?.reference || '');

  // Line items state (rate in major units for easy user input)
  interface FormLineItem {
    id: string;
    service_id?: string;
    description: string;
    quantity: number;
    rateMajor: number;
  }

  const [lines, setLines] = useState<FormLineItem[]>(() => {
    if (initialInvoice && initialInvoice.line_items?.length) {
      return initialInvoice.line_items.map((it, idx) => ({
        id: String(idx + 1),
        service_id: it.service_id || undefined,
        description: it.description,
        quantity: it.quantity || 1,
        rateMajor: minorToMajor(it.rate),
      }));
    }
    return [
      {
        id: '1',
        description: 'Social Media Management',
        quantity: 1,
        rateMajor: 120000,
      },
    ];
  });

  const [discountType, setDiscountType] = useState<'amount' | 'percent'>(
    initialInvoice?.discount_type || 'amount'
  );
  const [discountValueMajor, setDiscountValueMajor] = useState<number>(
    initialInvoice ? (initialInvoice.discount_type === 'percent' ? initialInvoice.discount_value : minorToMajor(initialInvoice.discount_value)) : 0
  );

  const [notes, setNotes] = useState<string>(initialInvoice?.notes || cachedSettings?.data.notes_template || '');
  const [termsText, setTermsText] = useState<string>(initialInvoice?.terms_text || cachedSettings?.data.terms_template || '');
  const [selectedBankId, setSelectedBankId] = useState<string>(initialInvoice?.pay_to_bank?.bank_id || 'meezan');

  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load supporting data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [wsData, srvData, settsData] = await Promise.all([
          workspaceService.getWorkspaces().catch(() => []),
          financeService.getServices(true).catch(() => []),
          financeService.getSettings().catch(() => null),
        ]);
        setWorkspaces(wsData || []);
        setServices(srvData || []);
        if (settsData) {
          setSettings(settsData);
          if (!notes && settsData.notes_template) setNotes(settsData.notes_template);
          if (!termsText && settsData.terms_template) setTermsText(settsData.terms_template);
        }
      } catch (err: any) {
        console.error('Error loading finance editor dependencies:', err);
      }
    };
    loadData();
  }, []);

  // When terms preset changes, automatically recalculate due date
  useEffect(() => {
    if (!issueDate) return;
    const base = new Date(issueDate);
    if (isNaN(base.getTime())) return;

    if (termsPreset === 'Due on receipt') {
      setDueDate(issueDate);
    } else if (termsPreset === 'Net 7') {
      base.setDate(base.getDate() + 7);
      setDueDate(base.toISOString().split('T')[0]);
    } else if (termsPreset === 'Net 15') {
      base.setDate(base.getDate() + 15);
      setDueDate(base.toISOString().split('T')[0]);
    } else if (termsPreset === 'Net 30') {
      base.setDate(base.getDate() + 30);
      setDueDate(base.toISOString().split('T')[0]);
    }
  }, [termsPreset, issueDate]);

  // When client workspace is selected, auto-fill contact & billing
  const handleSelectWorkspace = (wsId: string) => {
    setWorkspaceId(wsId);
    const ws = workspaces.find((w) => w.id === wsId);
    if (ws) {
      setClientName(ws.name);
      setBillingName(ws.billing_name || ws.poc_name || ws.name);
      setBillingEmail(ws.billing_email || ws.poc_email || '');
      setBillingPhone(ws.billing_phone || ws.poc_phone || '');
    }
  };

  // Calculations in minor units
  const subtotalMinor = useMemo(() => {
    return lines.reduce((acc, line) => {
      const lineMinor = majorToMinor(line.quantity * line.rateMajor);
      return acc + lineMinor;
    }, 0);
  }, [lines]);

  const discountAmountMinor = useMemo(() => {
    if (discountType === 'percent') {
      const pct = Math.max(0, Math.min(100, discountValueMajor));
      return Math.round(subtotalMinor * (pct / 100));
    }
    return Math.min(subtotalMinor, majorToMinor(discountValueMajor));
  }, [subtotalMinor, discountType, discountValueMajor]);

  const totalMinor = Math.max(0, subtotalMinor - discountAmountMinor);

  // Line actions
  const handleAddServiceLine = (srv?: FinanceService) => {
    const newLine: FormLineItem = {
      id: String(Date.now()),
      service_id: srv?.id,
      description: srv ? srv.name : '',
      quantity: 1,
      rateMajor: srv ? minorToMajor(srv.default_rate) : 0,
    };
    setLines([...lines, newLine]);
  };

  const handleUpdateLine = (id: string, updates: Partial<FormLineItem>) => {
    setLines(lines.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const handleRemoveLine = (id: string) => {
    if (lines.length <= 1) {
      setError('Invoice must have at least one line item');
      return;
    }
    setError(null);
    setLines(lines.filter((l) => l.id !== id));
  };

  // Selected bank object
  const payToBankObj = useMemo<BankAccountConfig | null>(() => {
    if (selectedBankId === 'cash') {
      return {
        bank_id: 'cash',
        bank_name: 'Cash',
        account_title: 'Cash in Hand',
        account_number: '—',
        iban: '—',
        swift_code: '',
      };
    }
    const list = settings?.bank_accounts || [];
    return list.find((b) => b.bank_id === selectedBankId) || list[0] || null;
  }, [settings, selectedBankId]);

  // Construct payload
  const buildPayload = (): InvoiceCreatePayload => {
    const lineItemsPayload: InvoiceLineItem[] = lines.map((l, idx) => ({
      serial: idx + 1,
      service_id: l.service_id,
      description: l.description.trim() || 'Service Line Item',
      quantity: l.quantity,
      rate: majorToMinor(l.rateMajor),
      amount: majorToMinor(l.quantity * l.rateMajor),
    }));

    return {
      workspace_id: workspaceId || null,
      client_name: clientName.trim() || 'Client',
      client_billing: {
        name: billingName.trim() || clientName.trim(),
        email: billingEmail.trim() || null,
        phone: billingPhone.trim() || null,
        address: billingAddress.trim() || null,
        tax_id: taxId.trim() || null,
      },
      issue_date: issueDate,
      due_date: dueDate,
      terms: termsPreset,
      reference: reference.trim() || null,
      currency,
      line_items: lineItemsPayload,
      discount_type: discountType,
      discount_value: discountType === 'percent' ? discountValueMajor : majorToMinor(discountValueMajor),
      notes: notes.trim() || null,
      terms_text: termsText.trim() || null,
      pay_to_bank: payToBankObj,
    };
  };

  const handleSave = async (andIssue = false) => {
    setError(null);
    if (!workspaceId && !clientName.trim()) {
      setError('Please select a client workspace');
      return;
    }
    if (lines.length === 0) {
      setError('At least one line item is required');
      return;
    }
    if (lines.some((line) => !line.description.trim())) {
      setError('Every line item needs a description');
      return;
    }
    if (lines.some((line) => line.quantity <= 0 || line.rateMajor < 0)) {
      setError('Line quantity must be greater than zero and rate cannot be negative');
      return;
    }
    if (andIssue && !workspaceId && !clientName.trim()) {
      setError('Select a client before issuing');
      return;
    }

    setLoading(true);
    try {
      const payload = buildPayload();
      let savedInv: Invoice;
      if (invoiceId) {
        savedInv = await financeService.updateInvoice(invoiceId, payload);
      } else {
        savedInv = await financeService.createInvoice(payload);
      }

      if (andIssue && savedInv.status === 'draft') {
        savedInv = await financeService.issueInvoice(savedInv.id);
      }

      onSaved(savedInv);
    } catch (err: any) {
      setError(err?.message || 'Failed to save invoice');
    } finally {
      setLoading(false);
    }
  };

  // Prepare preview object
  const previewData: Partial<Invoice> = {
    number: initialInvoice?.number || 'INV-26-DRAFT',
    client_name: clientName || 'Sample Client',
    client_billing: {
      name: billingName,
      address: billingAddress,
      email: billingEmail,
      phone: billingPhone,
      tax_id: taxId,
    },
    issue_date: issueDate,
    due_date: dueDate,
    terms: termsPreset,
    reference,
    currency,
    line_items: lines.map((l, idx) => ({
      serial: idx + 1,
      service_id: l.service_id,
      description: l.description || 'Service Description',
      quantity: l.quantity,
      rate: majorToMinor(l.rateMajor),
      amount: majorToMinor(l.quantity * l.rateMajor),
    })),
    subtotal: subtotalMinor,
    discount_amount: discountAmountMinor,
    total: totalMinor,
    amount_paid: initialInvoice?.amount_paid || 0,
    wht_settled: initialInvoice?.wht_settled || 0,
    balance_due: totalMinor - (initialInvoice?.amount_paid || 0) - (initialInvoice?.wht_settled || 0),
    status: initialInvoice?.status || 'draft',
    notes,
    terms_text: termsText,
    pay_to_bank: payToBankObj,
  };

  return (
    <div className="flex flex-col h-full bg-canvas min-h-0 font-sans">
      <header className="bg-surface border-b border-border px-0 py-3 flex flex-wrap justify-between items-center gap-4 sticky top-0 z-20">
        <div className="flex items-start gap-1 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Back to invoices"
            className="mt-0.5 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 pt-0.5">
            <h1 className="text-h2 font-semibold text-fg leading-7">
              {invoiceId ? `Edit ${formatInvoiceNumber(initialInvoice?.number) || 'draft'}` : 'New invoice'}
            </h1>
            <p className="text-caption text-fg-muted mt-0.5">
              Draft lines, preview, then save or issue
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" icon={Eye} onClick={() => setPreviewOpen(true)}>
            Preview
          </Button>
          {initialInvoice && initialInvoice.status && initialInvoice.status !== 'draft' ? (
            <Button type="button" variant="primary" size="sm" icon={Save} onClick={() => handleSave(false)} loading={loading}>
              Save changes
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" size="sm" icon={Save} onClick={() => handleSave(false)} loading={loading}>
                Save draft
              </Button>
              <Button type="button" variant="primary" size="sm" icon={Send} onClick={() => handleSave(true)} loading={loading}>
                Issue invoice
              </Button>
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 p-6 w-full max-w-5xl mx-auto space-y-6">
        <div className="space-y-6">
          {/* Section 1: Client Details */}
          <div className="bg-surface rounded-lg border border-border p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <Building className="w-4 h-4 text-accent-text" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-fg-2">Client Details</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Select Existing Client (Workspace)
                </label>
                <CustomSelect
                  value={workspaceId}
                  onChange={handleSelectWorkspace}
                  searchable
                  placeholder="Select a client or type a name below"
                  options={[
                    { value: '', label: 'Custom client (type name below)' },
                    ...workspaces.map((ws) => ({
                      value: ws.id,
                      label: ws.name,
                      description: ws.project_cycle || 'Client',
                    })),
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Client Name
                </label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Filled from the selected workspace"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Billing Contact Name
                </label>
                <input
                  type="text"
                  value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                  placeholder="e.g. Ali Raza"
                  className="w-full text-xs rounded-lg border border-border-strong px-3 py-2 focus:outline-none focus:ring-2 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Billing Email
                </label>
                <input
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  placeholder="ali@nova.pk"
                  className="w-full text-xs rounded-lg border border-border-strong px-3 py-2 focus:outline-none focus:ring-2 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Billing Phone
                </label>
                <input
                  type="tel"
                  value={billingPhone}
                  onChange={(e) => setBillingPhone(e.target.value)}
                  placeholder="+92 300 1234567"
                  className="w-full text-xs rounded-lg border border-border-strong px-3 py-2 focus:outline-none focus:ring-2 focus-visible:focus-ring"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Billing Address
                </label>
                <textarea
                  rows={2}
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  placeholder="Office 402, Business Bay, Sector F, DHA Phase 1..."
                  className="w-full text-xs rounded-lg border border-border-strong px-3 py-2 focus:outline-none focus:ring-2 focus-visible:focus-ring"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Invoice Terms & Currency */}
          <div className="bg-surface rounded-lg border border-border p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <FileText className="w-4 h-4 text-accent-text" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-fg-2">Invoice Settings</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">Currency</label>
                <CustomSelect
                  value={currency}
                  onChange={(value) => setCurrency(value as Currency)}
                  options={CURRENCY_OPTIONS}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">Issue Date</label>
                <CustomDatePicker
                  value={issueDate}
                  onChange={setIssueDate}
                  clearable={false}
                  offDayMode="none"
                  aria-label="Issue date"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">Due Date</label>
                <CustomDatePicker
                  value={dueDate}
                  onChange={(iso) => {
                    setDueDate(iso);
                    setTermsPreset('Custom');
                  }}
                  clearable={false}
                  offDayMode="none"
                  aria-label="Due date"
                />
              </div>

            </div>
          </div>

          {/* Section 3: Item Details / Services */}
          <div className="bg-surface rounded-lg border border-border p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
              <h2 className="text-sm font-bold uppercase tracking-wider text-fg-2">Services & Line Items</h2>
              <div className="flex items-center gap-2 shrink-0">
                <CustomSelect
                  className="w-56"
                  size="sm"
                  value=""
                  placeholder={`Pick from catalog (${services.length})`}
                  onChange={(serviceId) => {
                    const s = services.find((sv) => sv.id === serviceId);
                    if (s) handleAddServiceLine(s);
                  }}
                  options={services.map((srv) => ({
                    value: srv.id,
                    label: srv.name,
                    description: formatMinorMoney(srv.default_rate, (srv.currency as Currency) || currency),
                  }))}
                />
                <Button type="button" variant="secondary" size="md" icon={Plus} onClick={() => handleAddServiceLine()}>
                  Custom line
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs border-collapse min-w-[560px]">
                <thead>
                  <tr className="bg-subtle text-fg-muted border-b border-border text-micro uppercase tracking-wider">
                    <th className="py-2 px-2.5 w-10 font-medium">#</th>
                    <th className="py-2 px-2.5 font-medium">Service</th>
                    <th className="py-2 px-2.5 w-20 font-medium text-right">Qty</th>
                    <th className="py-2 px-2.5 w-36 font-medium text-right">Rate</th>
                    <th className="py-2 px-2.5 w-36 font-medium text-right">Amount</th>
                    <th className="py-2 px-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, idx) => {
                    const lineTotal = line.quantity * line.rateMajor;
                    return (
                      <tr key={line.id} className="bg-surface">
                        <td className="py-2 px-2.5 text-fg-muted font-numeric">{idx + 1}</td>
                        <td className="py-2 px-2.5">
                          <Input
                            inputSize="sm"
                            value={line.description}
                            onChange={(e) => handleUpdateLine(line.id, { description: e.target.value })}
                            placeholder="Service or description"
                          />
                        </td>
                        <td className="py-2 px-2.5">
                          <Input
                            inputSize="sm"
                            type="number"
                            min="0.1"
                            step="any"
                            value={line.quantity}
                            onChange={(e) => handleUpdateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })}
                            className="font-numeric text-right"
                          />
                        </td>
                        <td className="py-2 px-2.5">
                          <AmountInput
                            value={line.rateMajor}
                            onChange={(raw) => handleUpdateLine(line.id, { rateMajor: parseMajorGrouped(raw) })}
                            className="h-8 px-2.5 text-right text-sm"
                          />
                        </td>
                        <td className="py-2 px-2.5 text-right font-numeric font-semibold text-fg whitespace-nowrap">
                          {formatMinorMoney(majorToMinor(lineTotal), currency)}
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="p-1 text-fg-muted hover:text-danger-fg"
                            aria-label="Remove line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Discount, Pay To Bank & Notes */}
            <div className="pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">Discount</label>
                <div className="flex gap-2">
                  <CustomSelect
                    value={discountType}
                    onChange={(value) => setDiscountType(value as 'amount' | 'percent')}
                    options={[
                      { value: 'amount', label: `Fixed (${currency})` },
                      { value: 'percent', label: 'Percentage (%)' },
                    ]}
                  />
                  <AmountInput
                    value={discountValueMajor}
                    onChange={(raw) => setDiscountValueMajor(parseMajorGrouped(raw))}
                    className="h-8 px-2.5 text-right text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Deposit to
                </label>
                <CustomSelect
                  value={selectedBankId}
                  onChange={setSelectedBankId}
                  options={[
                    { value: 'cash', label: 'Cash', description: 'Cash in hand' },
                    ...(settings?.bank_accounts || []).map((b) => ({
                      value: b.bank_id,
                      label: b.bank_name,
                      description: b.account_number,
                    })),
                  ]}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Customer Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Thank you for your business!"
                  className="w-full text-xs rounded-lg border border-border-strong px-3 py-1.5"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-subtle p-4 flex flex-wrap justify-between items-end gap-4">
              <div>
                <p className="text-caption text-fg-muted">Total</p>
                <p className="text-h2 font-semibold font-numeric text-fg mt-0.5">
                  {formatMinorMoney(totalMinor, currency)}
                </p>
                <p className="text-caption text-fg-muted mt-1">
                  {amountInWords(totalMinor, currency)}
                </p>
              </div>
              <div className="text-right text-caption space-y-1">
                <p className="text-fg-muted">
                  Subtotal{' '}
                  <span className="font-numeric font-medium text-fg">{formatMinorMoney(subtotalMinor, currency)}</span>
                </p>
                {discountAmountMinor > 0 && (
                  <p className="text-fg-muted">
                    Discount{' '}
                    <span className="font-numeric font-medium text-fg">-{formatMinorMoney(discountAmountMinor, currency)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          maxWidth="2xl"
          className="bg-zinc-200 dark:bg-zinc-300 p-0 overflow-y-auto rounded-none border-0 shadow-2xl [transform:none]"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Invoice preview</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-8 sm:px-10">
            <InvoicePreview invoice={previewData} companySettings={settings || undefined} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
