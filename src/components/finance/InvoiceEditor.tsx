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
import { formatMinorMoney, majorToMinor, minorToMajor, amountInWords } from '../../utils/money';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { CustomSelect } from '../ui/CustomSelect';
import { CURRENCY_OPTIONS, TERMS_OPTIONS } from './financeUi';
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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [services, setServices] = useState<FinanceService[]>([]);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string>(initialInvoice?.workspace_id || '');
  const [clientName, setClientName] = useState<string>(initialInvoice?.client_name || '');
  const [billingName, setBillingName] = useState<string>(initialInvoice?.client_billing?.name || '');
  const [billingEmail, setBillingEmail] = useState<string>(initialInvoice?.client_billing?.email || '');
  const [billingPhone, setBillingPhone] = useState<string>(initialInvoice?.client_billing?.phone || '');
  const [billingAddress, setBillingAddress] = useState<string>(initialInvoice?.client_billing?.address || '');
  const [taxId, setTaxId] = useState<string>(initialInvoice?.client_billing?.tax_id || '');

  const [currency, setCurrency] = useState<Currency>(initialInvoice?.currency || 'PKR');
  const [issueDate, setIssueDate] = useState<string>(
    initialInvoice?.issue_date || new Date().toISOString().split('T')[0]
  );
  const [termsPreset, setTermsPreset] = useState<string>(initialInvoice?.terms || 'Due on receipt');
  const [dueDate, setDueDate] = useState<string>(
    initialInvoice?.due_date || new Date().toISOString().split('T')[0]
  );
  const [reference, setReference] = useState<string>(initialInvoice?.reference || '');

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

  const [notes, setNotes] = useState<string>(initialInvoice?.notes || '');
  const [termsText, setTermsText] = useState<string>(initialInvoice?.terms_text || '');
  const [selectedBankId, setSelectedBankId] = useState<string>(initialInvoice?.pay_to_bank?.bank_id || 'meezan');

  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');
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
    if (!clientName.trim()) {
      setError('Please select or enter a client name');
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
    number: initialInvoice?.number || 'INV-2026-DRAFT',
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
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to invoices">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-h2 font-semibold text-fg">
              {invoiceId ? `Edit ${initialInvoice?.number || 'draft'}` : 'New invoice'}
            </h1>
            <p className="text-caption text-fg-muted">
              Draft lines, preview, then save or issue
            </p>
          </div>
        </div>

        {/* Tab switch on smaller screens */}
        <div className="lg:hidden flex items-center bg-subtle p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              activeTab === 'form' ? 'bg-surface shadow text-fg' : 'text-fg-2'
            }`}
          >
            Edit Form
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition ${
              activeTab === 'preview' ? 'bg-surface shadow text-fg' : 'text-fg-2'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Live Preview
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" icon={Save} onClick={() => handleSave(false)} loading={loading}>
            Save draft
          </Button>
          <Button type="button" variant="primary" size="sm" icon={Send} onClick={() => handleSave(true)} loading={loading}>
            Issue invoice
          </Button>
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Container: Split screen on lg+ */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-[1700px] mx-auto w-full">
        {/* Left Form: Column span 7 on large */}
        <div className={`lg:col-span-6 space-y-6 ${activeTab === 'preview' ? 'hidden lg:block' : 'block'}`}>
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
                  Client Name <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Nova Luxury Living"
                  error={error && !clientName.trim() ? 'Required' : undefined}
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
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full text-xs rounded-lg border border-border-strong px-3 py-2 focus:outline-none focus:ring-2 focus-visible:focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">Payment Terms</label>
                <CustomSelect
                  value={termsPreset}
                  onChange={setTermsPreset}
                  options={TERMS_OPTIONS}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    setTermsPreset('Custom');
                  }}
                  className="w-full text-xs rounded-lg border border-border-strong px-3 py-2 focus:outline-none focus:ring-2 focus-visible:focus-ring font-medium"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Client PO / Reference Number
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="PO-2026-8812"
                  className="w-full text-xs rounded-lg border border-border-strong px-3 py-2 focus:outline-none focus:ring-2 focus-visible:focus-ring"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Item Details / Services */}
          <div className="bg-surface rounded-lg border border-border p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
              <h2 className="text-sm font-bold uppercase tracking-wider text-fg-2">Services & Line Items</h2>
              <div className="flex items-center gap-2">
                {/* Catalog Dropdown Picker */}
                <CustomSelect
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

                <button
                  type="button"
                  onClick={() => handleAddServiceLine()}
                  className="text-xs bg-subtle hover:bg-hover text-fg-2 font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Custom line
                </button>
              </div>
            </div>

            {/* Line items list */}
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const lineTotal = line.quantity * line.rateMajor;
                return (
                  <div
                    key={line.id}
                    className="p-3.5 rounded-lg border border-border bg-canvas/50 hover:bg-canvas transition grid grid-cols-12 gap-3 items-center"
                  >
                    <div className="col-span-1 text-center font-bold text-xs text-fg-muted">
                      {idx + 1}
                    </div>

                    <div className="col-span-5 sm:col-span-6">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => handleUpdateLine(line.id, { description: e.target.value })}
                        placeholder="Service name or description"
                        className="w-full text-xs font-medium rounded-lg border border-border-strong px-3 py-1.5 bg-surface focus:outline-none focus:ring-2 focus-visible:focus-ring"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-2">
                      <div className="flex items-center">
                        <span className="text-[10px] text-fg-muted mr-1 hidden sm:inline">Qty</span>
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          value={line.quantity}
                          onChange={(e) => handleUpdateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs text-center rounded-lg border border-border-strong px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus-visible:focus-ring"
                        />
                      </div>
                    </div>

                    <div className="col-span-3 sm:col-span-2">
                      <div className="flex items-center">
                        <span className="text-[10px] text-fg-muted mr-1 hidden sm:inline">Rate</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.rateMajor}
                          onChange={(e) => handleUpdateLine(line.id, { rateMajor: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs text-right rounded-lg border border-border-strong px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus-visible:focus-ring font-semibold"
                        />
                      </div>
                    </div>

                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(line.id)}
                        className="p-1 text-fg-muted hover:text-rose-600 transition"
                        title="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
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
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={discountValueMajor}
                    onChange={(e) => setDiscountValueMajor(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full text-xs rounded-lg border border-border-strong px-3 py-1.5 text-right font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">
                  Deposit / Pay-To Bank Account
                </label>
                <CustomSelect
                  value={selectedBankId}
                  onChange={setSelectedBankId}
                  options={(settings?.bank_accounts || []).map((b) => ({
                    value: b.bank_id,
                    label: b.bank_name,
                    description: b.account_number,
                  }))}
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

            {/* Calculations summary banner */}
            <div className="p-4 rounded-lg bg-slate-900 text-white flex flex-wrap justify-between items-center gap-4">
              <div>
                <p className="text-[10px] text-fg-muted uppercase tracking-wider font-semibold">Total Invoice Amount</p>
                <p className="text-xl font-bold tracking-tight text-white">
                  {formatMinorMoney(totalMinor, currency)}
                </p>
                <p className="text-xs text-accent-text italic mt-0.5">
                  {amountInWords(totalMinor, currency)}
                </p>
              </div>

              <div className="text-right text-xs space-y-1">
                <p className="text-fg-muted">
                  Subtotal: <span className="font-semibold">{formatMinorMoney(subtotalMinor, currency)}</span>
                </p>
                {discountAmountMinor > 0 && (
                  <p className="text-rose-400">
                    Discount: -{formatMinorMoney(discountAmountMinor, currency)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Live Preview: Column span 6 on large */}
        <div className={`lg:col-span-6 sticky top-24 ${activeTab === 'form' ? 'hidden lg:block' : 'block'}`}>
          <div className="mb-3 flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-accent-text" /> Live PDF Preview (Matches generated document)
            </h2>
            <span className="text-[10px] text-fg-muted font-medium">Updates in real time</span>
          </div>

          <div className="transform scale-[0.98] origin-top">
            <InvoicePreview invoice={previewData} companySettings={settings || undefined} />
          </div>
        </div>
      </div>
    </div>
  );
};
