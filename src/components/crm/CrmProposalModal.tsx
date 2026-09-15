import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
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
} from 'lucide-react';
import type { CrmDeal, CrmDealCreatePayload, CrmLead } from '../../types/crm';
import { dailyLogService } from '../../services/dailyLogService';
import { CustomSelect } from '../ui/CustomSelect';
import { openFileAttachment, downloadFileAttachment } from '../../utils/fileUrl';

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
  { value: 'partial', label: 'Partial' },
  { value: 'cleared', label: 'Cleared' },
];

const DEAL_STAGE_OPTIONS = [
  { value: 'opportunity_created', label: 'Opportunity Created' },
  { value: 'requirement_confirmed', label: 'Requirement Confirmed' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'verbal_approval', label: 'Verbal Approval' },
  { value: 'contract_sent', label: 'Contract / Agreement Sent' },
  { value: 'contract_signed', label: 'Contract Signed' },
  { value: 'payment_pending', label: 'Payment Pending' },
  { value: 'payment_done', label: 'Payment Done' },
];

const CURRENCY_OPTIONS = [
  { value: 'PKR', label: 'PKR (₨)' },
  { value: 'USD', label: 'USD ($)' },
];

function parseBudgetValue(budget: string | null | undefined): number {
  if (!budget) return 0;
  const match = String(budget).replace(/,/g, '').match(/[\d.]+/);
  if (!match) return 0;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function formatMoney(n: number, currency = 'PKR'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

/** Map proposal/deal form output → API create/update payload */
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
  const value = parseBudgetValue(config.budget);
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

function seedFromDeal(deal: CrmDeal): Partial<CrmDealFormConfig> {
  const services = [deal.service, ...(deal.additional_services || [])].filter(Boolean) as string[];
  return {
    workspace_name: deal.workspace_name || deal.title || '',
    brand_color: deal.brand_color || '#4f46e5',
    services: services.length ? services : ['Website Dev'],
    project_cycle: deal.billing_type === 'retainer' ? 'Retainer' : 'One-Time Project',
    priority: deal.priority || 'Medium',
    budget: deal.budget_display || (deal.value ? String(deal.value) : ''),
    contract_start_date: deal.contract_start_date || '',
    contract_end_date: deal.contract_end_date || '',
    poc_name: deal.poc_name || '',
    poc_email: deal.poc_email || '',
    poc_phone: deal.poc_phone || '',
    billing_name: deal.billing_name || '',
    billing_email: deal.billing_email || '',
    billing_phone: deal.billing_phone || '',
    proposal_url: deal.proposal_url || null,
    proposal_name: deal.proposal_name || null,
    proposal_size: deal.proposal_size ?? null,
    proposal_notes: deal.notes || '',
    deal_type: deal.deal_type || 'new_business',
    probability: deal.probability ?? 50,
    expected_revenue: deal.expected_revenue ?? null,
    expected_close_date: deal.expected_close_date || '',
    payment_status: deal.payment_status || 'pending',
    next_follow_up_at: deal.next_follow_up_at ? deal.next_follow_up_at.slice(0, 10) : '',
    currency: deal.currency || 'PKR',
    stage: deal.stage || 'opportunity_created',
  };
}

export const CrmProposalModal: React.FC<CrmProposalModalProps> = ({
  isOpen,
  lead,
  deal = null,
  onClose,
  onSave,
}) => {
  const isEdit = Boolean(deal?.id);
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
  const [billingName, setBillingName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingPhone, setBillingPhone] = useState('');

  const [proposalUrl, setProposalUrl] = useState<string | null>(null);
  const [proposalName, setProposalName] = useState<string | null>(null);
  const [proposalSize, setProposalSize] = useState<number | null>(null);
  const [proposalNotes, setProposalNotes] = useState('');

  const [dealType, setDealType] = useState('new_business');
  const [probability, setProbability] = useState(50);
  const [expectedRevenueManual, setExpectedRevenueManual] = useState(false);
  const [expectedRevenue, setExpectedRevenue] = useState(0);
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [dealStage, setDealStage] = useState('opportunity_created');

  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!lead || !isOpen) return;

    if (deal) {
      const seeded = seedFromDeal(deal);
      setWorkspaceName(seeded.workspace_name || '');
      setBrandColor(seeded.brand_color || '#4f46e5');
      setSelectedServices(seeded.services || ['Website Dev']);
      setProjectCycle(seeded.project_cycle || 'Retainer');
      setPriority(seeded.priority || 'Medium');
      setBudget(seeded.budget || '');
      setContractStartDate(seeded.contract_start_date || new Date().toISOString().slice(0, 10));
      setContractEndDate(seeded.contract_end_date || '');
      setPocName(seeded.poc_name || '');
      setPocEmail(seeded.poc_email || '');
      setPocPhone(seeded.poc_phone || '');
      setBillingName(seeded.billing_name || '');
      setBillingEmail(seeded.billing_email || '');
      setBillingPhone(seeded.billing_phone || '');
      setProposalUrl(seeded.proposal_url || null);
      setProposalName(seeded.proposal_name || null);
      setProposalSize(seeded.proposal_size ?? null);
      setProposalNotes(seeded.proposal_notes || '');
      setDealType(seeded.deal_type || 'new_business');
      setProbability(seeded.probability ?? 50);
      setExpectedRevenueManual(seeded.expected_revenue != null);
      setExpectedRevenue(seeded.expected_revenue ?? 0);
      setExpectedCloseDate(seeded.expected_close_date || '');
      setPaymentStatus(seeded.payment_status || 'pending');
      setNextFollowUp(seeded.next_follow_up_at || '');
      setCurrency(seeded.currency || 'PKR');
      setDealStage(seeded.stage || 'opportunity_created');
      return;
    }

    const existing = lead.proposal_config || {};
    setWorkspaceName(existing.workspace_name || lead.company || lead.name || '');
    setBrandColor(existing.brand_color || '#4f46e5');
    setSelectedServices(
      existing.services || (lead.service ? [lead.service] : ['Website Dev'])
    );
    setProjectCycle(existing.project_cycle || 'Retainer');
    setPriority(existing.priority || 'Medium');
    setBudget(existing.budget || lead.budget || '');
    setContractStartDate(existing.contract_start_date || new Date().toISOString().slice(0, 10));
    setContractEndDate(existing.contract_end_date || '');

    setPocName(existing.poc_name || lead.name || '');
    setPocEmail(existing.poc_email || lead.email || '');
    setPocPhone(existing.poc_phone || lead.phone_e164 || lead.phone_raw || '');

    setBillingName(existing.billing_name || existing.poc_name || lead.name || '');
    setBillingEmail(existing.billing_email || existing.poc_email || lead.email || '');
    setBillingPhone(
      existing.billing_phone || existing.poc_phone || lead.phone_e164 || lead.phone_raw || ''
    );

    setProposalUrl(existing.proposal_url || null);
    setProposalName(existing.proposal_name || null);
    setProposalSize(existing.proposal_size || null);
    setProposalNotes(existing.proposal_notes || '');
    setDealType('new_business');
    setProbability(60);
    setExpectedRevenueManual(false);
    const seedValue = parseBudgetValue(existing.budget || lead.budget || '');
    setExpectedRevenue(Math.round((seedValue * 60) / 100));
    setExpectedCloseDate('');
    setPaymentStatus('pending');
    setNextFollowUp('');
    setCurrency('PKR');
    setDealStage('opportunity_created');
  }, [lead, deal, isOpen]);

  // Auto-calc expected revenue unless manually overridden
  useEffect(() => {
    if (expectedRevenueManual) return;
    const value = parseBudgetValue(budget);
    setExpectedRevenue(Math.round((value * probability) / 100));
  }, [budget, probability, expectedRevenueManual]);

  if (!isOpen || !lead) return null;

  const handleToggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setError('File size must be under 25MB.');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const res = await dailyLogService.uploadDeliverableFile(file);
      setProposalUrl(res.file_url);
      setProposalName(res.file_name);
      setProposalSize(res.file_size);
    } catch (err: any) {
      setError(err.message || 'Failed to upload proposal file.');
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
    if (!workspaceName.trim()) {
      setError('Client / Workspace Name is required.');
      return;
    }
    if (selectedServices.length === 0) {
      setError('Select at least one service.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const config: CrmDealFormConfig = {
      workspace_name: workspaceName.trim(),
      brand_color: brandColor,
      services: selectedServices,
      project_cycle: projectCycle,
      priority,
      budget: budget.trim() || null,
      contract_start_date: contractStartDate || null,
      contract_end_date: contractEndDate || null,
      poc_name: pocName.trim() || null,
      poc_email: pocEmail.trim() || null,
      poc_phone: pocPhone.trim() || null,
      billing_name: billingName.trim() || null,
      billing_email: billingEmail.trim() || null,
      billing_phone: billingPhone.trim() || null,
      proposal_url: proposalUrl,
      proposal_name: proposalName,
      proposal_size: proposalSize,
      proposal_notes: proposalNotes.trim() || null,
      deal_type: dealType,
      probability,
      expected_revenue: expectedRevenue,
      expected_close_date: expectedCloseDate || null,
      payment_status: paymentStatus,
      next_follow_up_at: nextFollowUp || null,
      currency,
      stage: dealStage,
    };

    try {
      await onSave(config);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save deal.');
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        <header className="px-6 py-4.5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 border border-indigo-200/50 dark:border-indigo-800/50">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {isEdit ? 'Edit Deal' : 'Create Deal'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isEdit ? 'Update commercial details for' : 'Open a commercial opportunity for'}{' '}
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{lead.name}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Lead snapshot (read-only context) */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Company</p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                {lead.company || workspaceName || '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Contact</p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                {lead.name || '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Owner</p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                {lead.assigned_to_name || 'Unassigned'}
              </p>
            </div>
          </div>

          {/* Commercial deal fields */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
              Deal Commercials
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Deal Type
                </label>
                <CustomSelect value={dealType} onChange={setDealType} options={DEAL_TYPE_OPTIONS} />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Stage
                </label>
                <CustomSelect value={dealStage} onChange={setDealStage} options={DEAL_STAGE_OPTIONS} />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Currency
                </label>
                <CustomSelect value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Deal Value ({currency})
                </label>
                <input
                  type="text"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder={currency === 'USD' ? 'e.g. 25000 or $25,000' : 'e.g. 2000000 or ₨2,000,000'}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 font-numeric"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Probability (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={probability}
                  onChange={(e) => setProbability(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 font-numeric"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Expected Revenue
                  {!expectedRevenueManual && (
                    <span className="ml-1 text-[10px] text-zinc-400 font-normal">
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
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 font-numeric"
                />
                <p className="text-[10px] text-zinc-400 mt-1 font-numeric">
                  {formatMoney(expectedRevenue, currency)}
                  {expectedRevenueManual && (
                    <button
                      type="button"
                      onClick={() => setExpectedRevenueManual(false)}
                      className="ml-2 text-indigo-600 hover:underline cursor-pointer"
                    >
                      Reset auto
                    </button>
                  )}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Expected Close
                </label>
                <input
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => setExpectedCloseDate(e.target.value)}
                  className="w-full text-xs px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Payment Status
                </label>
                <CustomSelect
                  value={paymentStatus}
                  onChange={setPaymentStatus}
                  options={PAYMENT_STATUS_OPTIONS}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Next Follow-up
                </label>
                <input
                  type="date"
                  value={nextFollowUp}
                  onChange={(e) => setNextFollowUp(e.target.value)}
                  className="w-full text-xs px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
              Proposal Attachment
            </label>

            {proposalUrl ? (
              <div className="p-3 rounded-2xl border border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {proposalName || 'Proposal Document'}
                    </p>
                    <p className="text-[10px] text-zinc-400 font-numeric">
                      {formatFileSize(proposalSize)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openFileAttachment(proposalUrl, proposalName || 'Proposal Document')}
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-indigo-600 transition cursor-pointer"
                    title="View Document in Browser"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFileAttachment(proposalUrl, proposalName || 'Proposal Document')}
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-indigo-600 transition cursor-pointer"
                    title="Download Document"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveProposal}
                    className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-zinc-400 hover:text-rose-600 transition cursor-pointer"
                    title="Remove File"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
                  isUploading
                    ? 'border-indigo-500 bg-indigo-50/20'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-400 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30'
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
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mb-1" />
                    <span className="text-xs font-medium text-zinc-500">Uploading proposal...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-1">
                    <UploadCloud className="w-6 h-6 text-zinc-400 mb-1" />
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Upload Proposal PDF / Document
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      PDF, DOCX up to 25MB (persists to secure GridFS)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-500" />
              Deal &amp; Client Workspace Draft
            </h3>

            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                Client / Workspace Name *
              </label>
              <input
                type="text"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g. Apex Corporation"
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-2 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-indigo-500" />
                Brand Color
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                {BRAND_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setBrandColor(preset.value)}
                    style={{ backgroundColor: preset.value }}
                    className={`w-7 h-7 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                      brandColor === preset.value
                        ? 'ring-3 ring-indigo-500 ring-offset-2 dark:ring-offset-zinc-900 scale-110 shadow-xs'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                    title={preset.name}
                  >
                    {brandColor === preset.value && (
                      <CheckCircle2 className="w-4 h-4 text-white drop-shadow-xs" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
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
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
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
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Project Cycle
                </label>
                <CustomSelect
                  value={projectCycle}
                  onChange={(val) => setProjectCycle(val)}
                  options={PROJECT_CYCLES}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
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
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Contract Start Date
                </label>
                <input
                  type="date"
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                  className="w-full text-xs px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                  Estimated End Date (Optional)
                </label>
                <input
                  type="date"
                  value={contractEndDate}
                  onChange={(e) => setContractEndDate(e.target.value)}
                  className="w-full text-xs px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-500" />
              Contacts &amp; Billing Info
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">POC Name</label>
                <input
                  type="text"
                  value={pocName}
                  onChange={(e) => setPocName(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">POC Email</label>
                <input
                  type="email"
                  value={pocEmail}
                  onChange={(e) => setPocEmail(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">POC Phone</label>
                <input
                  type="text"
                  value={pocPhone}
                  onChange={(e) => setPocPhone(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
              Proposal Notes / Scope Highlights
            </label>
            <textarea
              rows={2}
              value={proposalNotes}
              onChange={(e) => setProposalNotes(e.target.value)}
              placeholder="e.g. Scope includes brand guidelines, 5-page Webflow site, and monthly maintenance."
              className="w-full text-xs p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 resize-none focus:ring-2 focus:ring-indigo-500 outline-hidden"
            />
          </div>
        </form>

        <footer className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-3 bg-zinc-50/50 dark:bg-zinc-900/30">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{isEdit ? 'Saving Deal...' : 'Creating Deal...'}</span>
              </>
            ) : (
              <span>{isEdit ? 'Save Deal' : 'Create Deal → Proposal'}</span>
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
};
