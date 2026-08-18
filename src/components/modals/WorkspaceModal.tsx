import React, { useState, useEffect, useRef } from 'react';
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
  CreditCard,
} from 'lucide-react';
import type { Workspace } from '../../types';
import type { WorkspaceCreatePayload, WorkspaceUpdatePayload } from '../../services/workspaceService';
import { dailyLogService } from '../../services/dailyLogService';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { downloadFileAttachment } from '../../utils/fileUrl';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: WorkspaceCreatePayload | WorkspaceUpdatePayload) => Promise<any>;
  workspaceToEdit?: Workspace | null;
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

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  workspaceToEdit,
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setErrorMessage(null);
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
        setSelectedServices(['Website Dev', 'Performance Marketing']);
        setPocName('');
        setPocEmail('');
        setPocPhone('');
        setBillingName('');
        setBillingEmail('');
        setBillingPhone('');
      }
    }
  }, [workspaceToEdit, isOpen]);

  if (!isOpen) return null;

  // Toggle service tag
  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  // Handle Proposal File Upload
  const handleProposalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('File exceeds maximum allowed size of 25MB.');
      return;
    }

    setUploadError(null);
    setIsUploadingProposal(true);

    try {
      const res = await dailyLogService.uploadDeliverableFile(file);
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
    if (!name.trim()) {
      setErrorMessage('Client / Brand name is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const computedInitials = initials.trim()
        ? initials.trim().toUpperCase()
        : name.trim().slice(0, 2).toUpperCase();

      const payload: WorkspaceCreatePayload = {
        name: name.trim(),
        initials: computedInitials,
        brandColor: brandColor.trim() || '#4f46e5',
        status,
        proposal_url: proposalUrl.trim() || undefined,
        proposal_name: proposalName.trim() || undefined,
        proposal_size: proposalSize,
        project_cycle: projectCycle,
        priority,
        health,
        contract_start_date: contractStartDate.trim() || undefined,
        contract_end_date: contractEndDate.trim() || undefined,
        services: selectedServices,
        poc_name: pocName.trim() || undefined,
        poc_email: pocEmail.trim() || undefined,
        poc_phone: pocPhone.trim() || undefined,
        billing_name: billingName.trim() || undefined,
        billing_email: billingEmail.trim() || undefined,
        billing_phone: billingPhone.trim() || undefined,
      };

      await onSave(payload);
      onClose();
    } catch (error: any) {
      console.error('Failed to save workspace:', error);
      setErrorMessage(error.message || 'Failed to save workspace.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentDisplayInitials = initials.trim() || name.trim().slice(0, 2).toUpperCase() || 'WS';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center w-screen h-screen bg-black/60 backdrop-blur-xs animate-fadeIn p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm shrink-0 transition-colors"
              style={{ backgroundColor: brandColor }}
            >
              {currentDisplayInitials}
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {workspaceToEdit ? 'Edit Client Workspace' : 'Add Client Workspace'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Configure client proposal, contract lifecycle, services, health, POC & billing details
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <X className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* SECTION 1: Client & Brand Basics */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-zinc-100 dark:border-zinc-800/80">
              <Building2 className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                1. Client & Brand Identity
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Client Name / Brand Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Transfers, ED&C, Sukoon Vista"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!workspaceToEdit && e.target.value.length >= 2) {
                      setInitials(e.target.value.slice(0, 2).toUpperCase());
                    }
                  }}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                  required
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Badge Initials
                </label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="e.g. AT"
                  value={initials}
                  onChange={(e) => setInitials(e.target.value.toUpperCase())}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors uppercase font-mono text-center"
                />
              </div>
            </div>

            {/* Brand Color Picker Section with Presets & Custom Eyedropper */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Brand Avatar Color</span>
                </div>
                <span className="font-mono text-[11px] text-zinc-400 font-bold uppercase">
                  {brandColor}
                </span>
              </label>

              <div className="flex items-center gap-3 flex-wrap p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80">
                {/* Preset Swatches */}
                <div className="flex items-center gap-2 flex-wrap">
                  {BRAND_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setBrandColor(c.value)}
                      style={{ backgroundColor: c.value }}
                      className={`w-7 h-7 rounded-xl border-2 transition-all cursor-pointer ${
                        brandColor.toLowerCase() === c.value.toLowerCase()
                          ? 'border-white dark:border-zinc-900 scale-115 shadow-md ring-2 ring-indigo-500'
                          : 'border-transparent opacity-70 hover:opacity-100 hover:scale-105'
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>

                <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />

                {/* Custom Color Eyedropper & Hex Input */}
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center">
                    <input
                      type="color"
                      value={brandColor.startsWith('#') && brandColor.length === 7 ? brandColor : '#4f46e5'}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="w-8 h-8 rounded-xl border border-zinc-200 dark:border-zinc-700 cursor-pointer p-0.5 bg-white dark:bg-zinc-800 overflow-hidden shadow-2xs"
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
                      className="w-24 px-2.5 py-1.5 text-xs font-mono font-bold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 uppercase focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Engagement Lifecycle, Health & Priority */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-zinc-100 dark:border-zinc-800/80">
              <Clock className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                2. Status, Cycle, Health & Contract Timeline
              </span>
            </div>

            {/* Workspace Active / Inactive Toggle */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Workspace Status</span>
                </span>
                <span className="text-[10px] text-zinc-400">Controls visibility for team members</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('active')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-2 cursor-pointer select-none ${
                    status === 'active'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Active (Visible to Team)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('inactive')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-2 cursor-pointer select-none ${
                    status === 'inactive'
                      ? 'bg-zinc-200 dark:bg-zinc-800 border-zinc-500 text-zinc-800 dark:text-zinc-200 ring-2 ring-zinc-500/20'
                      : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                  }`}
                >
                  <X className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Inactive (Operations Only)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
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
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
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
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
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
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Contract Start Date</span>
                </label>
                <CustomDatePicker
                  value={contractStartDate}
                  onChange={setContractStartDate}
                  placeholder="Select start date..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Contract End Date</span>
                </label>
                <CustomDatePicker
                  value={contractEndDate}
                  onChange={setContractEndDate}
                  minDate={contractStartDate}
                  placeholder="Select end date..."
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Services Provided (Multi-Select Tags) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-zinc-100 dark:border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  3. Services Provided
                </span>
              </div>
              <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                {selectedServices.length} selected
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {AVAILABLE_SERVICES.map((s) => {
                const isSelected = selectedServices.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleService(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs scale-102 ring-2 ring-indigo-500/20'
                        : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200/60 dark:border-zinc-700/60'
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>{s}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 4: Proposal Document Upload */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-zinc-100 dark:border-zinc-800/80">
              <Paperclip className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                4. Client Proposal / Agreement (Attachment)
              </span>
            </div>

            {uploadError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <X className="w-3.5 h-3.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {proposalUrl ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/80 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {proposalName || 'Client Proposal Document'}
                    </p>
                    {proposalSize && (
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                        {formatFileSize(proposalSize)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadFileAttachment(proposalUrl, proposalName || `${name}_Proposal`)}
                    className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition cursor-pointer"
                    title="Download / View Proposal"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveProposal}
                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
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
                  accept=".pdf,.doc,.docx,.xlsx,.xls,.zip,.png,.jpg,.jpeg,.svg"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingProposal}
                  className="w-full py-4 px-4 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer bg-zinc-50/50 dark:bg-zinc-900/30 disabled:opacity-50"
                >
                  {isUploadingProposal ? (
                    <div className="flex items-center gap-2 font-bold text-indigo-600 dark:text-indigo-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading Proposal Document...</span>
                    </div>
                  ) : (
                    <>
                      <UploadCloud className="w-5 h-5 text-indigo-500" />
                      <span className="font-bold text-zinc-700 dark:text-zinc-300">
                        Click to upload Client Proposal (PDF, Word, Excel, Zip)
                      </span>
                      <span className="text-[10px] text-zinc-400">Up to 25MB supported</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* SECTION 5: Point of Contact (POC) Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-zinc-100 dark:border-zinc-800/80">
              <User className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                5. Point of Contact (POC) Details
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-indigo-500" />
                  <span>POC Full Name</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Jenkins"
                  value={pocName}
                  onChange={(e) => setPocName(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-indigo-500" />
                  <span>POC Email</span>
                </label>
                <input
                  type="email"
                  placeholder="sarah@client.com"
                  value={pocEmail}
                  onChange={(e) => setPocEmail(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-indigo-500" />
                  <span>POC Phone Number</span>
                </label>
                <input
                  type="tel"
                  placeholder="+1 (555) 019-2834"
                  value={pocPhone}
                  onChange={(e) => setPocPhone(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* SECTION 6: Billing Contact Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-zinc-100 dark:border-zinc-800/80">
              <CreditCard className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                6. Billing Contact Details
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Billing Contact Name</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Accounts Department"
                  value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Billing Email</span>
                </label>
                <input
                  type="email"
                  placeholder="billing@client.com"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Billing Phone Number</span>
                </label>
                <input
                  type="tel"
                  placeholder="+1 (555) 839-2019"
                  value={billingPhone}
                  onChange={(e) => setBillingPhone(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 select-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Workspace...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{workspaceToEdit ? 'Save Changes' : 'Create Workspace'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
