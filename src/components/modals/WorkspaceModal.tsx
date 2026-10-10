import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Building2,
  Palette,
  CheckCircle2,
  Loader2,
  Paperclip,
  UploadCloud,
  FileText,
  Trash2,
  Calendar,
  Layers,
  HeartPulse,
  Flame,
  User,
  Mail,
  Phone,
  Clock,
  ExternalLink,
  Download,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import type { Workspace } from '../../types';
import type { WorkspaceCreatePayload, WorkspaceUpdatePayload } from '../../services/workspaceService';
import { dailyLogService } from '../../services/dailyLogService';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { Button } from '../ui/button';
import { focusFirstError } from '../../utils/formFocus';
import { FormErrorSummaryButton } from '../../hooks/useFormValidation';
import { downloadFileAttachment, openFileAttachment } from '../../utils/fileUrl';
import { cn } from '../../lib/utils';

export interface WorkspaceFormSeed {
  name?: string;
  poc_name?: string;
  poc_email?: string;
  poc_phone?: string;
  billing_name?: string;
  billing_email?: string;
  billing_phone?: string;
  services?: string[];
}

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: WorkspaceCreatePayload | WorkspaceUpdatePayload) => Promise<any>;
  workspaceToEdit?: Workspace | null;
  /** Prefill a new client from a lead. Does not include a deal proposal. */
  seed?: WorkspaceFormSeed | null;
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

const TAILWIND_COLOR_MAP: Record<string, string> = {
  'bg-indigo-600': '#4f46e5',
  'bg-indigo-500': '#6366f1',
  'bg-blue-600': '#2563eb',
  'bg-blue-500': '#3b82f6',
  'bg-amber-500': '#f59e0b',
  'bg-emerald-500': '#10b981',
  'bg-emerald-600': '#059669',
  'bg-purple-600': '#9333ea',
  'bg-purple-500': '#a855f7',
  'bg-rose-500': '#f43f5e',
  'bg-cyan-500': '#06b6d4',
  'bg-violet-600': '#7c3aed',
};

const resolveColorHex = (colorStr?: string): string => {
  if (!colorStr) return '#4f46e5';
  if (colorStr.startsWith('#')) return colorStr;
  if (TAILWIND_COLOR_MAP[colorStr]) return TAILWIND_COLOR_MAP[colorStr];
  return '#4f46e5';
};

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
];

const PROJECT_CYCLES = [
  { value: 'Retainer', label: 'Retainer' },
  { value: 'One-Time Project', label: 'One-Time Project' },
];

const PRIORITIES = [
  { value: 'High', label: 'High Priority' },
  { value: 'Medium', label: 'Medium Priority' },
  { value: 'Low', label: 'Low Priority' },
];

const HEALTH_OPTIONS = [
  { value: 'Excellent', label: 'Excellent' },
  { value: 'Good', label: 'Good' },
  { value: 'Moderate', label: 'Moderate' },
  { value: 'Emergency', label: 'Emergency' },
];

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_UPLOAD_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.doc', '.txt', '.zip', '.xlsx', '.xls', '.csv'];

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  workspaceToEdit,
  seed = null,
}) => {
  // Brand Basics
  const [name, setName] = useState('');
  const [initials, setInitials] = useState('');
  const [brandColor, setBrandColor] = useState('#4f46e5');

  // Proposal Attachment
  const [proposalUrl, setProposalUrl] = useState('');
  const [proposalName, setProposalName] = useState('');
  const [proposalSize, setProposalSize] = useState<number | undefined>(undefined);
  const [isUploadingProposal, setIsUploadingProposal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Engagement & Contract
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [projectCycle, setProjectCycle] = useState<'Retainer' | 'One-Time Project'>('Retainer');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [health, setHealth] = useState<'Excellent' | 'Good' | 'Moderate' | 'Emergency'>('Good');
  const [contractStartDate, setContractStartDate] = useState('');
  const [contractEndDate, setContractEndDate] = useState('');

  // Services Multi-Select
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  // Point of Contact (POC) Details
  const [pocName, setPocName] = useState('');
  const [pocEmail, setPocEmail] = useState('');
  const [pocPhone, setPocPhone] = useState('');

  // Billing Contact Details
  const [billingName, setBillingName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingPhone, setBillingPhone] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errorCount = useMemo(() => {
    return Object.values(fieldErrors).filter(Boolean).length;
  }, [fieldErrors]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load existing or reset
  useEffect(() => {
    if (isOpen) {
      setServerError(null);
      setUploadError(null);
      if (workspaceToEdit) {
        setName(workspaceToEdit.name || '');
        setInitials(workspaceToEdit.initials || '');
        setBrandColor(resolveColorHex(workspaceToEdit.brandColor));
        setProposalUrl(workspaceToEdit.proposal_url || '');
        setProposalName(workspaceToEdit.proposal_name || '');
        setProposalSize(workspaceToEdit.proposal_size);
        setProjectCycle(workspaceToEdit.project_cycle || 'Retainer');
        setPriority(workspaceToEdit.priority || 'Medium');
        setHealth(workspaceToEdit.health || 'Good');
        setStatus(workspaceToEdit.status === 'inactive' ? 'inactive' : 'active');
        setContractStartDate(workspaceToEdit.contract_start_date || '');
        setContractEndDate(workspaceToEdit.contract_end_date || '');
        setSelectedServices(workspaceToEdit.services || []);
        setPocName(workspaceToEdit.poc_name || '');
        setPocEmail(workspaceToEdit.poc_email || '');
        setPocPhone(workspaceToEdit.poc_phone || '');
        setBillingName(workspaceToEdit.billing_name || '');
        setBillingEmail(workspaceToEdit.billing_email || '');
        setBillingPhone(workspaceToEdit.billing_phone || '');
      } else {
        setName('');
        setInitials('');
        setBrandColor('#4f46e5');
        setStatus('active');
        setProposalUrl('');
        setProposalName('');
        setProposalSize(undefined);
        setProjectCycle('Retainer');
        setPriority('Medium');
        setHealth('Good');
        setContractStartDate('');
        setContractEndDate('');
        setSelectedServices([]);
        setPocName('');
        setPocEmail('');
        setPocPhone('');
        setBillingName(seed?.billing_name || '');
        setBillingEmail(seed?.billing_email || '');
        setBillingPhone(seed?.billing_phone || '');
        setName(seed?.name || '');
        setPocName(seed?.poc_name || '');
        setPocEmail(seed?.poc_email || '');
        setPocPhone(seed?.poc_phone || '');
        setSelectedServices(seed?.services || []);
      }
    }
  }, [workspaceToEdit, isOpen, seed]);

  if (!isOpen) return null;

  // Toggle service tag
  const toggleService = (service: string) => {
    setSelectedServices((prev) => {
      const next = prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service];
      if (hasAttemptedSubmit && next.length > 0) {
        setFieldErrors((e) => {
          const copy = { ...e };
          delete copy.services;
          return copy;
        });
      }
      return next;
    });
  };

  // Handle Proposal File Upload
  const handleProposalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('File exceeds maximum allowed size of 25MB.');
      return;
    }
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    if (!ALLOWED_UPLOAD_EXTS.includes(ext)) {
      setUploadError('Unsupported file type. SVG is not allowed.');
      return;
    }

    setUploadError(null);
    setIsUploadingProposal(true);

    try {
      // When restoring an existing proposal path, overwrite the same key so the
      // workspace URL stays valid (ops does not need to remove + re-link).
      const res = await dailyLogService.uploadDeliverableFile(
        file,
        proposalUrl?.startsWith('/uploads/') ? proposalUrl : undefined
      );
      setProposalUrl(res.file_url);
      setProposalName(res.file_name || file.name);
      setProposalSize(res.file_size || file.size);
    } catch (err: any) {
      console.error('Proposal upload error:', err);
      setUploadError(err.message || 'Failed to upload proposal attachment.');
    } finally {
      setIsUploadingProposal(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveProposal = () => {
    setProposalUrl('');
    setProposalName('');
    setProposalSize(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string | undefined> = {};
    if (!name.trim()) {
      errors.name = 'Client / Brand name is required.';
    }
    if (!contractStartDate.trim()) {
      errors.contractStartDate = 'Contract start date is required.';
    }
    if (!contractEndDate.trim()) {
      errors.contractEndDate = 'Contract end date is required.';
    } else if (contractEndDate.trim() < contractStartDate.trim()) {
      errors.contractEndDate = 'Contract end date cannot be earlier than contract start date.';
    }
    if (!selectedServices || selectedServices.length === 0) {
      errors.services = 'Please select at least one service.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setHasAttemptedSubmit(true);
      setTimeout(() => focusFirstError(), 10);
      return;
    }

    if (isUploadingProposal) {
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setServerError(null);
    try {
      const computedInitials = initials.trim()
        ? initials.trim().toUpperCase()
        : name.trim().slice(0, 2).toUpperCase();

      const payload: WorkspaceCreatePayload = {
        name: name.trim(),
        initials: computedInitials,
        brandColor: brandColor.trim() || '#4f46e5',
        status,
        proposal_url: proposalUrl.trim() ? proposalUrl.trim() : null,
        proposal_name: proposalUrl.trim() ? (proposalName.trim() || null) : null,
        proposal_size: proposalUrl.trim() ? (proposalSize ?? null) : null,
        project_cycle: projectCycle,
        priority,
        health,
        contract_start_date: contractStartDate.trim() ? contractStartDate.trim() : null,
        contract_end_date: contractEndDate.trim() ? contractEndDate.trim() : null,
        services: selectedServices,
        poc_name: pocName.trim() ? pocName.trim() : null,
        poc_email: pocEmail.trim() ? pocEmail.trim() : null,
        poc_phone: pocPhone.trim() ? pocPhone.trim() : null,
        billing_name: billingName.trim() ? billingName.trim() : null,
        billing_email: billingEmail.trim() ? billingEmail.trim() : null,
        billing_phone: billingPhone.trim() ? billingPhone.trim() : null,
      };

      await onSave(payload);
      onClose();
    } catch (error: any) {
      console.error('Failed to save workspace:', error);
      const msg = error.message || 'Failed to save workspace.';
      setServerError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentDisplayInitials = initials.trim() || name.trim().slice(0, 2).toUpperCase() || 'WS';

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-overlay,50)] flex items-center justify-center w-screen h-screen bg-overlay animate-fadeIn p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative z-[var(--z-dialog,51)] w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar bg-surface border border-border rounded-xl p-6 sm:p-7 shadow-xl space-y-6 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm shrink-0 transition-colors"
              style={{ backgroundColor: brandColor }}
            >
              {currentDisplayInitials}
            </div>
            <div>
              <h2 className="text-base font-semibold text-fg">
                {workspaceToEdit ? 'Edit Client Workspace' : 'Add Client Workspace'}
              </h2>
              <p className="text-xs text-fg-muted">
                Configure client proposal, contract lifecycle, services, health, POC & billing details
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-fg-muted hover:text-fg rounded-lg hover:bg-hover transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* SECTION 1: Client & Brand Basics */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Building2 className="w-4 h-4 text-accent-text" />
              <span className="text-xs font-semibold text-fg">
                1. Client & Brand Identity
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="workspace-name" className="block text-xs font-medium text-fg mb-1.5">
                  Client Name / Brand Name <span className="text-danger-fg">*</span>
                </label>
                <input
                  id="workspace-name"
                  type="text"
                  placeholder="e.g. Apex Transfers, ED&C, Sukoon Vista"
                  value={name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setName(val);
                    if (hasAttemptedSubmit && val.trim()) {
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.name;
                        return copy;
                      });
                    }
                    if (!workspaceToEdit && val.length >= 2) {
                      setInitials(val.slice(0, 2).toUpperCase());
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'workspace-name-error' : undefined}
                  className={cn(
                    'w-full bg-subtle border rounded-lg px-3.5 py-2.5 text-xs font-semibold text-fg placeholder:text-fg-muted focus:outline-hidden transition-colors',
                    fieldErrors.name ? 'border-danger-dot focus:border-danger-fg' : 'border-border focus:border-accent'
                  )}
                  autoComplete="off"
                />
                {fieldErrors.name && (
                  <p id="workspace-name-error" role="alert" className="text-small text-danger-fg flex items-center gap-1.5 mt-1">
                    <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.name}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1.5">
                  Badge Initials
                </label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="e.g. AT"
                  value={initials}
                  onChange={(e) => setInitials(e.target.value.toUpperCase())}
                  className="w-full bg-subtle border border-border focus:border-accent rounded-lg px-3 py-2.5 text-xs font-semibold text-fg placeholder:text-fg-muted focus:outline-hidden transition-colors uppercase font-mono text-center"
                />
              </div>
            </div>

            {/* Brand Color Picker Section with Presets & Custom Eyedropper */}
            <div>
              <label className="block text-xs font-medium text-fg mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-accent-text" />
                  <span>Brand Avatar Color</span>
                </div>
                <span className="font-mono text-xs text-fg-muted font-semibold uppercase">
                  {brandColor}
                </span>
              </label>

              <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl bg-subtle border border-border">
                {/* Preset Swatches */}
                <div className="flex items-center gap-2 flex-wrap">
                  {BRAND_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setBrandColor(c.value)}
                      style={{ backgroundColor: c.value }}
                      className={`w-7 h-7 rounded-lg border-2 transition-all cursor-pointer ${
                        brandColor.toLowerCase() === c.value.toLowerCase()
                          ? 'border-white scale-110 shadow-sm ring-2 ring-accent'
                          : 'border-transparent opacity-75 hover:opacity-100 hover:scale-105'
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>

                <div className="h-6 w-px bg-border hidden sm:block" />

                {/* Custom Color Eyedropper & Hex Input */}
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center">
                    <input
                      type="color"
                      value={brandColor.startsWith('#') && brandColor.length === 7 ? brandColor : '#4f46e5'}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="w-8 h-8 rounded-lg border border-border cursor-pointer p-0.5 bg-subtle overflow-hidden"
                      title="Pick custom brand color"
                    />
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      maxLength={7}
                      placeholder="#4F46E5"
                      value={brandColor}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBrandColor(val);
                      }}
                      className="w-24 px-2.5 py-1.5 text-xs font-mono font-semibold bg-surface border border-border rounded-lg text-fg uppercase focus:outline-hidden focus:border-accent"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Engagement Lifecycle, Health & Priority */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Clock className="w-4 h-4 text-accent-text" />
              <span className="text-xs font-semibold text-fg">
                2. Status, Cycle, Health & Contract Timeline
              </span>
            </div>

            {/* Workspace Active / Inactive Toggle */}
            <div>
              <label className="block text-xs font-medium text-fg mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent-text" />
                  <span>Workspace Status</span>
                </span>
                <span className="text-caption text-fg-muted">Controls visibility for team members</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('active')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition flex items-center justify-center gap-2 cursor-pointer select-none ${
                    status === 'active'
                      ? 'bg-success-subtle border-success-border text-success-fg ring-2 ring-success-border/20'
                      : 'bg-subtle border-border text-fg-muted hover:border-border-strong'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-success-fg" />
                  <span>Active (Visible to Team)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('inactive')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition flex items-center justify-center gap-2 cursor-pointer select-none ${
                    status === 'inactive'
                      ? 'bg-hover border-border-strong text-fg ring-2 ring-border-strong/20'
                      : 'bg-subtle border-border text-fg-muted hover:border-border-strong'
                  }`}
                >
                  <X className="w-3.5 h-3.5 text-fg-muted" />
                  <span>Inactive (Operations Only)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-accent-text" />
                  <span>Project Cycle</span>
                </label>
                <CustomSelect
                  value={projectCycle}
                  onChange={(val) => setProjectCycle(val as any)}
                  options={PROJECT_CYCLES}
                  placeholder="Cycle"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-warning-fg" />
                  <span>Priority Level</span>
                </label>
                <CustomSelect
                  value={priority}
                  onChange={(val) => setPriority(val as any)}
                  options={PRIORITIES}
                  placeholder="Priority"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1">
                  <HeartPulse className="w-3.5 h-3.5 text-danger-fg" />
                  <span>Account Health</span>
                </label>
                <CustomSelect
                  value={health}
                  onChange={(val) => setHealth(val as any)}
                  options={HEALTH_OPTIONS}
                  placeholder="Health"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-accent-text" />
                  <span>Contract Start Date</span>
                  <span className="text-danger-fg font-semibold">*</span>
                </label>
                <CustomDatePicker
                  value={contractStartDate}
                  onChange={(val) => {
                    setContractStartDate(val);
                    if (hasAttemptedSubmit && val.trim()) {
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.contractStartDate;
                        return copy;
                      });
                    }
                  }}
                  error={fieldErrors.contractStartDate}
                  placeholder="Select start date..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-accent-text" />
                  <span>Contract End Date</span>
                  <span className="text-danger-fg font-semibold">*</span>
                </label>
                <CustomDatePicker
                  value={contractEndDate}
                  onChange={(val) => {
                    setContractEndDate(val);
                    if (hasAttemptedSubmit && val.trim()) {
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.contractEndDate;
                        return copy;
                      });
                    }
                  }}
                  error={fieldErrors.contractEndDate}
                  minDate={contractStartDate}
                  placeholder="Select end date..."
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Services Provided (Multi-Select Tags) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-border">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent-text" />
                <span className="text-xs font-semibold text-fg">
                  3. Services Provided
                </span>
                <span className="text-danger-fg font-semibold">*</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedServices.length === 0 && (
                  <span className="text-caption font-semibold text-danger-fg bg-danger-subtle px-2 py-0.5 rounded-full border border-danger-border">
                    At least 1 required
                  </span>
                )}
                <span className="text-xs font-semibold text-accent-text bg-subtle px-2 py-0.5 rounded-full border border-border">
                  {selectedServices.length} selected
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {AVAILABLE_SERVICES.map((s) => {
                const isSelected = selectedServices.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleService(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-accent text-accent-fg ring-2 ring-accent/20'
                        : 'bg-subtle text-fg-muted hover:text-fg hover:bg-hover border border-border'
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>{s}</span>
                  </button>
                );
              })}
            </div>
            {fieldErrors.services && (
              <p role="alert" className="text-small text-danger-fg flex items-center gap-1.5 mt-1.5">
                <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                <span>{fieldErrors.services}</span>
              </p>
            )}
          </div>

          {/* SECTION 4: Proposal Document Upload */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Paperclip className="w-4 h-4 text-accent-text" />
              <span className="text-xs font-semibold text-fg">
                4. Client Proposal / Agreement (Attachment)
              </span>
            </div>

            {uploadError && (
              <div className="p-2.5 rounded-lg bg-danger-subtle border border-danger-border text-danger-fg text-xs flex items-center gap-2">
                <X className="w-3.5 h-3.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {proposalUrl ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-subtle border border-border text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-surface text-accent-text border border-border flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-fg truncate">
                      {proposalName || 'Client Proposal Document'}
                    </p>
                    {proposalSize && (
                      <p className="text-caption text-fg-muted font-mono mt-0.5">
                        {formatFileSize(proposalSize)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openFileAttachment(proposalUrl, proposalName || `${name}_Proposal`)}
                    className="p-1.5 text-accent-text hover:underline rounded-md transition cursor-pointer"
                    title="View Proposal in Browser"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFileAttachment(proposalUrl, proposalName || `${name}_Proposal`)}
                    className="p-1.5 text-accent-text hover:underline rounded-md transition cursor-pointer"
                    title="Download Proposal Document"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveProposal}
                    className="p-1.5 text-fg-muted hover:text-danger-fg rounded-md transition cursor-pointer"
                    title="Remove Proposal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleProposalFileUpload}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xlsx,.xls,.zip,.png,.jpg,.jpeg"
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => !isUploadingProposal && fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !isUploadingProposal) {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`w-full py-4 px-4 border border-dashed border-border hover:border-accent rounded-xl flex flex-col items-center justify-center gap-1.5 text-xs text-fg-muted hover:text-fg transition cursor-pointer bg-subtle ${
                    isUploadingProposal ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  {isUploadingProposal ? (
                    <div className="flex items-center gap-2 font-semibold text-accent-text">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading Proposal Document...</span>
                    </div>
                  ) : (
                    <>
                      <UploadCloud className="w-5 h-5 text-accent-text" />
                      <span className="font-semibold text-fg">
                        Click to upload Client Proposal (PDF, Word, Excel, Zip)
                      </span>
                      <span className="text-caption text-fg-muted">Up to 25MB supported</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5: Point of Contact (POC) Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <User className="w-4 h-4 text-accent-text" />
              <span className="text-xs font-semibold text-fg">
                5. Point of Contact (POC) Details
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-accent-text" />
                  <span>POC Full Name</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Jenkins"
                  value={pocName}
                  onChange={(e) => setPocName(e.target.value)}
                  className="w-full bg-subtle border border-border focus:border-accent rounded-lg px-3.5 py-2 text-xs text-fg placeholder:text-fg-muted focus:outline-hidden transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-accent-text" />
                  <span>POC Email</span>
                </label>
                <input
                  type="email"
                  placeholder="sarah@client.com"
                  value={pocEmail}
                  onChange={(e) => setPocEmail(e.target.value)}
                  className="w-full bg-subtle border border-border focus:border-accent rounded-lg px-3.5 py-2 text-xs text-fg placeholder:text-fg-muted focus:outline-hidden transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-accent-text" />
                  <span>POC Phone Number</span>
                </label>
                <input
                  type="tel"
                  placeholder="+1 (555) 019-2834"
                  value={pocPhone}
                  onChange={(e) => setPocPhone(e.target.value)}
                  className="w-full bg-subtle border border-border focus:border-accent rounded-lg px-3.5 py-2 text-xs text-fg placeholder:text-fg-muted focus:outline-hidden transition-colors"
                />
              </div>
            </div>
          </div>

          {/* SECTION 6: Billing Contact Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <CreditCard className="w-4 h-4 text-accent-text" />
              <span className="text-xs font-semibold text-fg">
                6. Billing Contact Details
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-accent-text" />
                  <span>Billing Contact Name</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Accounts Department"
                  value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                  className="w-full bg-subtle border border-border focus:border-accent rounded-lg px-3.5 py-2 text-xs text-fg placeholder:text-fg-muted focus:outline-hidden transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-accent-text" />
                  <span>Billing Email</span>
                </label>
                <input
                  type="email"
                  placeholder="billing@client.com"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  className="w-full bg-subtle border border-border focus:border-accent rounded-lg px-3.5 py-2 text-xs text-fg placeholder:text-fg-muted focus:outline-hidden transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-accent-text" />
                  <span>Billing Phone Number</span>
                </label>
                <input
                  type="tel"
                  placeholder="+1 (555) 839-2019"
                  value={billingPhone}
                  onChange={(e) => setBillingPhone(e.target.value)}
                  className="w-full bg-subtle border border-border focus:border-accent rounded-lg px-3.5 py-2 text-xs text-fg placeholder:text-fg-muted focus:outline-hidden transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="sticky bottom-0 bg-surface/95 backdrop-blur-xs pt-4 pb-2 border-t border-border flex items-center justify-between gap-2.5 flex-wrap z-10">
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
              <FormErrorSummaryButton
                errorCount={errorCount}
                onClick={() => focusFirstError()}
              />
              {serverError && (
                <div role="alert" className="text-small text-danger-fg flex items-center gap-1.5 font-medium">
                  <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                  <span>{serverError}</span>
                </div>
              )}
              {isUploadingProposal && (
                <span className="text-small text-fg-muted" aria-live="polite">
                  Wait for upload to finish
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-fg bg-subtle hover:bg-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting}
                loadingText="Saving Workspace…"
                disabled={isSubmitting || isUploadingProposal}
                icon={CheckCircle2}
              >
                {workspaceToEdit ? 'Save Changes' : 'Create Workspace'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

