import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Palette,
  CheckCircle2,
  Loader2,
  Briefcase,
  UploadCloud,
  Paperclip,
  Trash2,
  Layers,
  User,
  ExternalLink,
  Download,
  FileText,
  AlertCircle,
} from 'lucide-react';
import type { CrmDeal, CrmDealCreatePayload, CrmLead } from '../../types/crm';
import { dailyLogService } from '../../services/dailyLogService';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { openFileAttachment, downloadFileAttachment } from '../../utils/fileUrl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { focusFirstError } from '../../utils/formFocus';
import { FormErrorSummaryButton } from '../../hooks/useFormValidation';

export interface CrmDealFormConfig {
  workspace_name: string;
  brand_color: string;
  services: string[];
  project_cycle: string;
  priority: string;
  budget: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  poc_name: string | null;
  poc_email: string | null;
  poc_phone: string | null;
  billing_name: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  proposal_url: string | null;
  proposal_name: string | null;
  proposal_size: number | null;
  proposal_notes: string | null;
  deal_type: string;
  probability: number;
  expected_revenue: number | null;
  expected_close_date: string | null;
  payment_status: string;
  next_follow_up_at: string | null;
  currency: string;
  stage: string;
}

interface CrmProposalModalProps {
  isOpen: boolean;
  lead: CrmLead | null;
  /** When set, modal edits this deal instead of creating a new one */
  deal?: CrmDeal | null;
  onClose: () => void;
  onSave: (config: CrmDealFormConfig) => Promise<void>;
}

const BRAND_PRESETS = [
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Purple', value: '#9333ea' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Slate', value: '#475569' },
];

const AVAILABLE_SERVICES = [
  'Branding',
  'Website Dev',
  'Web Maintenance',
  'SEO',
  'Performance Marketing',
  'Video Shoot',
  'Software Dev',
  'Mobile App Dev',
  'UI/UX Designing',
  'Social Media Management',
  'Project Branding',
];

const PROJECT_CYCLES = [
  { value: 'Retainer', label: 'Retainer' },
  { value: 'One-Time Project', label: 'One-Time Project' },
];

const DEAL_TYPE_OPTIONS = [
  { value: 'new_business', label: 'New Business' },
  { value: 'upsell', label: 'Upsell' },
  { value: 'renewal', label: 'Renewal' },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
];

const DEAL_STAGE_OPTIONS = [
  { value: 'opportunity_created', label: 'Opportunity Created' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'contract_sent', label: 'Contract Sent' },
  { value: 'payment_pending', label: 'Payment Pending' },
];

const CURRENCY_OPTIONS = [
  { value: 'PKR', label: 'PKR (₨)' },
  { value: 'USD', label: 'USD ($)' },
];

const DEFAULT_PROBABILITY: Record<string, number> = {
  opportunity_created: 20,
  proposal_sent: 40,
  negotiation: 60,
  contract_sent: 80,
  payment_pending: 90,
};

function parseNumericBudget(raw?: string | null): number {
  if (!raw) return 0;
  const digits = raw.replace(/[^\d.]/g, '');
  const parsed = parseFloat(digits);
  return isNaN(parsed) ? 0 : parsed;
}

export function dealFormConfigToPayload(config: CrmDealFormConfig, lead?: CrmLead | null): CrmDealCreatePayload {
  const services = config.services?.length
    ? config.services
    : lead?.service
      ? [lead.service]
      : ['Website Dev'];
  const primary = services[0];
  const extras = services.slice(1);
  const wsName = config.workspace_name.trim() || lead?.company || lead?.name || 'Deal';
  const title = primary && !wsName.includes(primary) ? `${wsName} — ${primary}` : wsName;
  const billing =
    (config.project_cycle || '').toLowerCase().includes('retain') ? 'retainer' : 'one_time';
  const value = parseNumericBudget(config.budget);
  const probability = Math.min(100, Math.max(0, Number(config.probability) || 0));
  const expected =
    config.expected_revenue != null && config.expected_revenue >= 0
      ? config.expected_revenue
      : Math.round((value * probability) / 100);

  return {
    title: title.slice(0, 160),
    service: primary.slice(0, 80),
    additional_services: extras,
    value,
    currency: config.currency || 'PKR',
    billing_type: billing,
    stage: config.stage || 'opportunity_created',
    status: 'open',
    deal_type: config.deal_type || 'new_business',
    probability,
    expected_revenue: expected,
    expected_close_date: config.expected_close_date,
    payment_status: config.payment_status || 'pending',
    proposal_url: config.proposal_url,
    proposal_name: config.proposal_name,
    proposal_size: config.proposal_size ?? undefined,
    notes: config.proposal_notes,
    workspace_name: wsName,
    brand_color: config.brand_color || '#4f46e5',
    priority: config.priority || 'Medium',
    contract_start_date: config.contract_start_date,
    contract_end_date: config.contract_end_date,
    poc_name: config.poc_name,
    poc_email: config.poc_email,
    poc_phone: config.poc_phone,
    billing_name: config.billing_name,
    billing_email: config.billing_email,
    billing_phone: config.billing_phone,
    budget_display: config.budget,
    next_follow_up_at: config.next_follow_up_at,
  };
}

function formatMoney(amount: number, currency: string): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return `₨${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export const CrmProposalModal: React.FC<CrmProposalModalProps> = ({
  isOpen,
  lead,
  deal,
  onClose,
  onSave,
}) => {
  const isEdit = Boolean(deal);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [workspaceName, setWorkspaceName] = useState('');
  const [brandColor, setBrandColor] = useState('#4f46e5');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [projectCycle, setProjectCycle] = useState('Retainer');
  const [priority, setPriority] = useState('Medium');
  const [budget, setBudget] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');
  const [contractEndDate, setContractEndDate] = useState('');
  const [pocName, setPocName] = useState('');
  const [pocEmail, setPocEmail] = useState('');
  const [pocPhone, setPocPhone] = useState('');
  const [proposalNotes, setProposalNotes] = useState('');

  // Deal-specific fields
  const [dealType, setDealType] = useState('new_business');
  const [dealStage, setDealStage] = useState('opportunity_created');
  const [currency, setCurrency] = useState('PKR');
  const [probability, setProbability] = useState(20);
  const [expectedRevenue, setExpectedRevenue] = useState(0);
  const [expectedRevenueManual, setExpectedRevenueManual] = useState(false);
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [nextFollowUp, setNextFollowUp] = useState('');

  // Proposal attachment state
  const [proposalUrl, setProposalUrl] = useState<string | null>(null);
  const [proposalName, setProposalName] = useState<string | null>(null);
  const [proposalSize, setProposalSize] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Auto-calculate expected revenue when budget, currency, or probability changes
  useEffect(() => {
    if (!expectedRevenueManual) {
      const numericBudget = parseNumericBudget(budget);
      const computed = Math.round((numericBudget * probability) / 100);
      setExpectedRevenue(computed);
    }
  }, [budget, probability, expectedRevenueManual]);

  // Adjust default probability when stage changes (if not manual)
  useEffect(() => {
    if (!deal) {
      const defaultProb = DEFAULT_PROBABILITY[dealStage];
      if (defaultProb !== undefined) {
        setProbability(defaultProb);
      }
    }
  }, [dealStage, deal]);

  // Hydrate form on open
  useEffect(() => {
    if (!isOpen || !lead) return;

    if (deal) {
      setWorkspaceName(deal.title || lead.company || lead.name || '');
      setBrandColor('#4f46e5');
      setSelectedServices(deal.service ? [deal.service] : []);
      setProjectCycle(deal.billing_type === 'retainer' ? 'Retainer' : 'One-Time Project');
      setPriority('Medium');
      setBudget(deal.value ? String(deal.value) : '');
      setContractStartDate('');
      setContractEndDate('');
      setPocName(lead.name || '');
      setPocEmail(lead.email || '');
      setPocPhone(lead.phone_e164 ? `+${lead.phone_e164}` : lead.phone_raw || '');
      setProposalNotes(deal.notes || '');

      setDealType(deal.deal_type || 'new_business');
      setDealStage(deal.stage || 'opportunity_created');
      setCurrency(deal.currency || 'PKR');
      setProbability(deal.probability ?? 20);
      setExpectedRevenue(deal.expected_revenue ?? 0);
      setExpectedRevenueManual(Boolean(deal.expected_revenue));
      setExpectedCloseDate(deal.expected_close_date || '');
      setPaymentStatus(deal.payment_status || 'pending');
      setNextFollowUp(deal.next_follow_up_at ? deal.next_follow_up_at.split('T')[0] : '');

      setProposalUrl(deal.proposal_url || null);
      setProposalName(deal.proposal_name || null);
      setProposalSize(deal.proposal_size || null);
    } else {
      setWorkspaceName(lead.company || lead.name || '');
      setBrandColor('#4f46e5');
      setSelectedServices(lead.service ? [lead.service] : []);
      setProjectCycle('Retainer');
      setPriority('Medium');
      setBudget(lead.budget || '');
      setContractStartDate('');
      setContractEndDate('');
      setPocName(lead.name || '');
      setPocEmail(lead.email || '');
      setPocPhone(lead.phone_e164 ? `+${lead.phone_e164}` : lead.phone_raw || '');
      setProposalNotes('');

      setDealType('new_business');
      setDealStage('opportunity_created');
      setCurrency('PKR');
      setProbability(20);
      setExpectedRevenue(0);
      setExpectedRevenueManual(false);
      setExpectedCloseDate('');
      setPaymentStatus('pending');
      setNextFollowUp('');

      setProposalUrl(null);
      setProposalName(null);
      setProposalSize(null);
    }

    setFieldErrors({});
    setServerError(null);
    setHasSubmitted(false);
  }, [isOpen, lead, deal]);

  if (!isOpen || !lead) return null;

  const createBlocked = !isEdit && lead.outcome !== 'won';

  const handleToggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setServerError('File exceeds the 25MB limit.');
      return;
    }

    setIsUploading(true);
    setServerError(null);
    try {
      const res = await dailyLogService.uploadDeliverableFile(file);
      setProposalUrl(res.file_url);
      setProposalName(file.name);
      setProposalSize(file.size);
    } catch (err: any) {
      setServerError(err.message || 'File upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveProposal = () => {
    setProposalUrl(null);
    setProposalName(null);
    setProposalSize(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    setServerError(null);

    const errs: Record<string, string> = {};
    if (!workspaceName.trim()) {
      errs.workspaceName = 'Client / workspace name is required.';
    }
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        if (formRef.current) focusFirstError(formRef.current);
      }, 50);
      return;
    }

    setIsSubmitting(true);

    try {
      const config: CrmDealFormConfig = {
        workspace_name: workspaceName.trim(),
        brand_color: brandColor,
        services: selectedServices,
        project_cycle: projectCycle,
        priority: priority,
        budget: budget.trim() || null,
        contract_start_date: contractStartDate || null,
        contract_end_date: contractEndDate || null,
        poc_name: pocName.trim() || null,
        poc_email: pocEmail.trim() || null,
        poc_phone: pocPhone.trim() || null,
        billing_name: pocName.trim() || null,
        billing_email: pocEmail.trim() || null,
        billing_phone: pocPhone.trim() || null,
        proposal_url: proposalUrl,
        proposal_name: proposalName,
        proposal_size: proposalSize,
        proposal_notes: proposalNotes.trim() || null,
        deal_type: dealType,
        probability,
        expected_revenue: expectedRevenue > 0 ? expectedRevenue : null,
        expected_close_date: expectedCloseDate || null,
        payment_status: paymentStatus,
        next_follow_up_at: nextFollowUp ? `${nextFollowUp}T12:00:00Z` : null,
        currency,
        stage: dealStage,
      };

      await onSave(config);
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save deal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent maxWidth="lg" className="p-0 overflow-hidden">
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col max-h-[calc(100vh-64px)]">
          <DialogHeader className="p-5 pb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center text-accent shrink-0">
                <Briefcase className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-h2 font-semibold text-fg">
                  {isEdit ? 'Edit Deal' : 'Create Deal'}
                </DialogTitle>
                <DialogDescription className="text-body text-fg-muted">
                  {isEdit ? 'Update commercial details for' : 'Open a commercial opportunity for'}{' '}
                  <span className="font-medium text-fg">{lead.name}</span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {createBlocked && (
              <div className="p-3 rounded-md bg-warning-bg border border-warning-bd text-xs text-warning-fg">
                This lead is not won yet. Mark it as won before a deal can be created.
              </div>
            )}

            {/* Lead context */}
            <div className="rounded-md border border-border bg-subtle/50 p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-micro text-fg-muted block">Company</span>
                <span className="font-medium text-fg truncate block">
                  {lead.company || workspaceName || '—'}
                </span>
              </div>
              <div>
                <span className="text-micro text-fg-muted block">Contact</span>
                <span className="font-medium text-fg truncate block">
                  {lead.name || '—'}
                </span>
              </div>
              <div>
                <span className="text-micro text-fg-muted block">Owner</span>
                <span className="font-medium text-fg truncate block">
                  {lead.assigned_to_name || 'Unassigned'}
                </span>
              </div>
            </div>

            {/* Deal Commercials */}
            <div className="space-y-3">
              <h3 className="text-[13px] font-semibold text-fg flex items-center gap-1.5 border-b border-border pb-1">
                <Briefcase className="w-3.5 h-3.5 text-accent" />
                Deal Commercials
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Deal Type
                  </label>
                  <CustomSelect value={dealType} onChange={setDealType} options={DEAL_TYPE_OPTIONS} size="sm" />
                </div>
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Stage
                  </label>
                  <CustomSelect value={dealStage} onChange={setDealStage} options={DEAL_STAGE_OPTIONS} size="sm" />
                </div>
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Currency
                  </label>
                  <CustomSelect value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} size="sm" />
                </div>
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Deal Value ({currency})
                  </label>
                  <input
                    type="text"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder={currency === 'USD' ? 'e.g. 25000 or $25,000' : 'e.g. 2000000 or ₨2,000,000'}
                    className="w-full text-xs h-8 px-2.5 rounded-md border border-border bg-surface font-numeric text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Probability (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={probability}
                    onChange={(e) => setProbability(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-full text-xs h-8 px-2.5 rounded-md border border-border bg-surface font-numeric text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Expected Revenue
                    {!expectedRevenueManual && (
                      <span className="ml-1 text-micro text-fg-muted font-normal">
                        (auto: value × probability)
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={expectedRevenue}
                    onChange={(e) => {
                      setExpectedRevenueManual(true);
                      setExpectedRevenue(Math.max(0, Number(e.target.value) || 0));
                    }}
                    className="w-full text-xs h-8 px-2.5 rounded-md border border-border bg-surface font-numeric text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <p className="text-micro text-fg-muted mt-1 font-numeric">
                    {formatMoney(expectedRevenue, currency)}
                    {expectedRevenueManual && (
                      <button
                        type="button"
                        onClick={() => setExpectedRevenueManual(false)}
                        className="ml-2 text-accent hover:underline cursor-pointer"
                      >
                        Reset auto
                      </button>
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Expected Close
                  </label>
                  <CustomDatePicker
                    value={expectedCloseDate}
                    onChange={setExpectedCloseDate}
                  />
                </div>
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Payment Status
                  </label>
                  <CustomSelect
                    value={paymentStatus}
                    onChange={setPaymentStatus}
                    options={PAYMENT_STATUS_OPTIONS}
                    size="sm"
                  />
                </div>
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Next Follow-up
                  </label>
                  <CustomDatePicker
                    value={nextFollowUp}
                    onChange={setNextFollowUp}
                  />
                </div>
              </div>
            </div>

            {/* Proposal Attachment */}
            <div className="space-y-2">
              <label className="text-small font-semibold text-fg flex items-center gap-1.5 border-b border-border pb-1">
                <Paperclip className="w-3.5 h-3.5 text-accent" />
                Proposal Attachment
              </label>

              {proposalUrl ? (
                <div className="p-3 rounded-md border border-border bg-subtle/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-fg truncate">
                        {proposalName || 'Proposal Document'}
                      </p>
                      <p className="text-micro text-fg-muted font-numeric">
                        {formatFileSize(proposalSize)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openFileAttachment(proposalUrl, proposalName || 'Proposal Document')}
                      className="p-1.5 rounded hover:bg-hover text-fg-muted hover:text-fg transition cursor-pointer"
                      title="View Document in Browser"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadFileAttachment(proposalUrl, proposalName || 'Proposal Document')}
                      className="p-1.5 rounded hover:bg-hover text-fg-muted hover:text-fg transition cursor-pointer"
                      title="Download Document"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveProposal}
                      className="p-1.5 rounded hover:bg-danger-bg text-fg-muted hover:text-danger-fg transition cursor-pointer"
                      title="Remove File"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
                    isUploading
                      ? 'border-accent bg-accent-soft'
                      : 'border-border-strong hover:border-accent hover:bg-hover'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  {isUploading ? (
                    <div className="flex flex-col items-center py-2">
                      <Loader2 className="w-5 h-5 text-accent animate-spin mb-1" />
                      <span className="text-xs font-medium text-fg-muted">Uploading proposal…</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-1">
                      <UploadCloud className="w-5 h-5 text-fg-muted mb-1" />
                      <p className="text-xs font-medium text-fg">
                        Upload Proposal PDF / Document
                      </p>
                      <p className="text-micro text-fg-muted mt-0.5">
                        PDF, DOCX up to 25MB
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Deal & Client Workspace Draft */}
            <div className="space-y-3 pt-2 border-t border-border">
              <h3 className="text-[13px] font-semibold text-fg flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-accent" />
                Deal &amp; Client Workspace Draft
              </h3>

              <div>
                <label className="text-small font-medium text-fg block mb-1">
                  Client / Workspace Name *
                </label>
                <input
                  type="text"
                  name="workspaceName"
                  required
                  value={workspaceName}
                  onChange={(e) => {
                    setWorkspaceName(e.target.value);
                    if (hasSubmitted && e.target.value.trim()) {
                      setFieldErrors((prev) => { const n = { ...prev }; delete n.workspaceName; return n; });
                    }
                  }}
                  aria-invalid={!!fieldErrors.workspaceName}
                  placeholder="e.g. Apex Corporation"
                  className={`w-full text-xs h-8 px-2.5 rounded-md border bg-surface text-fg focus:outline-none ${
                    fieldErrors.workspaceName ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border focus:ring-1 focus:ring-accent'
                  }`}
                />
                {fieldErrors.workspaceName && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.workspaceName}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-small font-medium text-fg block mb-2 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-accent" />
                  Brand Color
                </label>
                <div className="flex flex-wrap gap-2 items-center">
                  {BRAND_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setBrandColor(preset.value)}
                      style={{ backgroundColor: preset.value }}
                      className={`w-6 h-6 rounded-md transition-transform flex items-center justify-center cursor-pointer ${
                        brandColor === preset.value
                          ? 'ring-2 ring-accent ring-offset-2 scale-110'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      title={preset.name}
                    >
                      {brandColor === preset.value && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-small font-medium text-fg block mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-accent" />
                  Services Included
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_SERVICES.map((s) => {
                    const isSelected = selectedServices.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleToggleService(s)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-accent text-accent-contrast'
                            : 'bg-subtle text-fg-muted hover:text-fg hover:bg-hover'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Project Cycle
                  </label>
                  <CustomSelect
                    value={projectCycle}
                    onChange={(val) => setProjectCycle(val)}
                    options={PROJECT_CYCLES}
                    size="sm"
                  />
                </div>

                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Priority
                  </label>
                  <CustomSelect
                    value={priority}
                    onChange={setPriority}
                    options={[
                      { value: 'Low', label: 'Low' },
                      { value: 'Medium', label: 'Medium' },
                      { value: 'High', label: 'High' },
                    ]}
                    size="sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Contract Start Date
                  </label>
                  <CustomDatePicker
                    value={contractStartDate}
                    onChange={setContractStartDate}
                  />
                </div>
                <div>
                  <label className="text-small font-medium text-fg block mb-1">
                    Estimated End Date (Optional)
                  </label>
                  <CustomDatePicker
                    value={contractEndDate}
                    onChange={setContractEndDate}
                    clearable
                  />
                </div>
              </div>
            </div>

            {/* Contacts & Billing */}
            <div className="space-y-3 pt-2 border-t border-border">
              <h3 className="text-[13px] font-semibold text-fg flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-accent" />
                Contacts &amp; Billing Info
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-micro text-fg-muted block mb-1">POC Name</label>
                  <input
                    type="text"
                    value={pocName}
                    onChange={(e) => setPocName(e.target.value)}
                    className="w-full text-xs h-8 px-2.5 rounded-md border border-border bg-surface text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="text-micro text-fg-muted block mb-1">POC Email</label>
                  <input
                    type="email"
                    value={pocEmail}
                    onChange={(e) => setPocEmail(e.target.value)}
                    className="w-full text-xs h-8 px-2.5 rounded-md border border-border bg-surface text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="text-micro text-fg-muted block mb-1">POC Phone</label>
                  <input
                    type="text"
                    value={pocPhone}
                    onChange={(e) => setPocPhone(e.target.value)}
                    className="w-full text-xs h-8 px-2.5 rounded-md border border-border bg-surface text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-small font-medium text-fg block mb-1">
                Proposal Notes / Scope Highlights
              </label>
              <textarea
                rows={2}
                value={proposalNotes}
                onChange={(e) => setProposalNotes(e.target.value)}
                placeholder="e.g. Scope includes brand guidelines, 5-page Webflow site, and monthly maintenance."
                className="w-full text-xs p-2.5 rounded-md border border-border bg-subtle/50 text-fg placeholder:text-fg-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FormErrorSummaryButton
                count={Object.keys(fieldErrors).length}
                onClick={() => {
                  if (formRef.current) focusFirstError(formRef.current);
                }}
              />
              {serverError && (
                <div className="flex items-center gap-1.5 text-xs text-status-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}
              {isUploading && (
                <span className="text-small text-fg-muted" aria-live="polite">
                  Wait for upload to finish
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting}
                loadingText={isEdit ? 'Saving deal…' : 'Creating deal…'}
                disabled={createBlocked || isUploading}
              >
                {isEdit ? 'Save deal' : 'Create deal → proposal'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
