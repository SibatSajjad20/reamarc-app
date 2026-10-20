import { useCallback, useMemo, useState } from 'react';
import type { Workspace } from '../types';
import { workspaceService, type WorkspaceCreatePayload, type WorkspaceUpdatePayload } from '../services/workspaceService';
import { dailyLogService } from '../services/dailyLogService';
import { clientInitials } from '../utils/clientInitials';
import { focusFirstError } from '../utils/formFocus';

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

export const BRAND_PRESETS = [
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

export const AVAILABLE_SERVICES = [
  'Branding', 'Website Dev', 'Web Maintenance', 'SEO', 'Performance Marketing',
  'Video Shoot', 'Software Dev', 'Mobile App Dev', 'UI/UX Designing', 'Social Media Management',
];

export const PROJECT_CYCLES = [
  { value: 'Retainer', label: 'Retainer' },
  { value: 'One-Time Project', label: 'One-Time Project' },
];
export const PRIORITIES = [
  { value: 'High', label: 'High Priority' },
  { value: 'Medium', label: 'Medium Priority' },
  { value: 'Low', label: 'Low Priority' },
];
export const HEALTH_OPTIONS = [
  { value: 'Excellent', label: 'Excellent' },
  { value: 'Good', label: 'Good' },
  { value: 'Moderate', label: 'Moderate' },
  { value: 'Emergency', label: 'Emergency' },
];

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.doc', '.txt', '.zip', '.xlsx', '.xls', '.csv'];

export function resolveColorHex(colorStr?: string): string {
  if (!colorStr) return '#4f46e5';
  if (colorStr.startsWith('#')) return colorStr;
  return TAILWIND_COLOR_MAP[colorStr] || '#4f46e5';
}

export interface ClientFormValues {
  name: string;
  initials: string;
  brandColor: string;
  status: 'active' | 'inactive';
  projectCycle: 'Retainer' | 'One-Time Project';
  priority: 'High' | 'Medium' | 'Low';
  health: 'Excellent' | 'Good' | 'Moderate' | 'Emergency';
  contractStartDate: string;
  contractEndDate: string;
  selectedServices: string[];
  proposalUrl: string;
  proposalName: string;
  proposalSize?: number;
  pocName: string;
  pocEmail: string;
  pocPhone: string;
  billingName: string;
  billingEmail: string;
  billingPhone: string;
}

function valuesFromWorkspace(ws?: Workspace | null, seed?: WorkspaceFormSeed | null): ClientFormValues {
  if (ws) {
    return {
      name: ws.name || '', initials: ws.initials || '', brandColor: resolveColorHex(ws.brandColor),
      status: ws.status === 'inactive' ? 'inactive' : 'active',
      projectCycle: ws.project_cycle || 'Retainer', priority: ws.priority || 'Medium', health: ws.health || 'Good',
      contractStartDate: ws.contract_start_date || '', contractEndDate: ws.contract_end_date || '',
      selectedServices: ws.services || [], proposalUrl: ws.proposal_url || '', proposalName: ws.proposal_name || '',
      proposalSize: ws.proposal_size, pocName: ws.poc_name || '', pocEmail: ws.poc_email || '', pocPhone: ws.poc_phone || '',
      billingName: ws.billing_name || '', billingEmail: ws.billing_email || '', billingPhone: ws.billing_phone || '',
    };
  }
  return {
    name: seed?.name || '', initials: seed?.name ? clientInitials(seed.name) : '', brandColor: '#4f46e5',
    status: 'active', projectCycle: 'Retainer', priority: 'Medium', health: 'Good',
    contractStartDate: '', contractEndDate: '', selectedServices: seed?.services || [],
    proposalUrl: '', proposalName: '', proposalSize: undefined,
    pocName: seed?.poc_name || '', pocEmail: seed?.poc_email || '', pocPhone: seed?.poc_phone || '',
    billingName: seed?.billing_name || '', billingEmail: seed?.billing_email || '', billingPhone: seed?.billing_phone || '',
  };
}

function snapshot(values: ClientFormValues): string {
  return JSON.stringify(values);
}

export function buildWorkspacePayload(values: ClientFormValues): WorkspaceCreatePayload {
  const computedInitials = values.initials.trim() ? values.initials.trim().toUpperCase() : clientInitials(values.name);
  return {
    name: values.name.trim(), initials: computedInitials, brandColor: values.brandColor.trim() || '#4f46e5',
    status: values.status,
    proposal_url: values.proposalUrl.trim() ? values.proposalUrl.trim() : null,
    proposal_name: values.proposalUrl.trim() ? values.proposalName.trim() || null : null,
    proposal_size: values.proposalUrl.trim() ? values.proposalSize ?? null : null,
    project_cycle: values.projectCycle, priority: values.priority, health: values.health,
    contract_start_date: values.contractStartDate.trim() || null, contract_end_date: values.contractEndDate.trim() || null,
    services: values.selectedServices,
    poc_name: values.pocName.trim() || null, poc_email: values.pocEmail.trim() || null, poc_phone: values.pocPhone.trim() || null,
    billing_name: values.billingName.trim() || null, billing_email: values.billingEmail.trim() || null, billing_phone: values.billingPhone.trim() || null,
  };
}

export function validateClientForm(values: ClientFormValues): Record<string, string | undefined> {
  const errors: Record<string, string | undefined> = {};
  if (!values.name.trim()) errors.name = 'Client / Brand name is required.';
  if (!values.contractStartDate.trim()) errors.contractStartDate = 'Contract start date is required.';
  if (!values.contractEndDate.trim()) errors.contractEndDate = 'Contract end date is required.';
  else if (values.contractEndDate.trim() < values.contractStartDate.trim()) {
    errors.contractEndDate = 'Contract end date cannot be earlier than contract start date.';
  }
  if (!values.selectedServices.length) errors.services = 'Please select at least one service.';
  return errors;
}

export function useClientForm(initial: Workspace | null, seed?: WorkspaceFormSeed | null) {
  const [values, setValues] = useState<ClientFormValues>(() => valuesFromWorkspace(initial, seed));
  const [baseline, setBaseline] = useState(() => snapshot(valuesFromWorkspace(initial, seed)));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingProposal, setIsUploadingProposal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoPreview, setPendingLogoPreview] = useState<string | null>(null);

  const patch = useCallback((partial: Partial<ClientFormValues>) => {
    setValues((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetFrom = useCallback((ws: Workspace | null, nextSeed?: WorkspaceFormSeed | null) => {
    const next = valuesFromWorkspace(ws, nextSeed);
    setValues(next);
    setBaseline(snapshot(next));
    setFieldErrors({});
    setHasAttemptedSubmit(false);
    setServerError(null);
    setPendingLogoFile(null);
    setPendingLogoPreview(null);
  }, []);

  const markClean = useCallback((nextValues?: ClientFormValues) => {
    setBaseline(snapshot(nextValues || values));
    setPendingLogoFile(null);
    setPendingLogoPreview(null);
  }, [values]);

  const isDirty = useMemo(() => snapshot(values) !== baseline || Boolean(pendingLogoFile), [values, baseline, pendingLogoFile]);
  const errorCount = useMemo(() => Object.values(fieldErrors).filter(Boolean).length, [fieldErrors]);

  const toggleService = (service: string) => {
    setValues((prev) => {
      const next = prev.selectedServices.includes(service)
        ? prev.selectedServices.filter((s) => s !== service)
        : [...prev.selectedServices, service];
      if (hasAttemptedSubmit && next.length > 0) {
        setFieldErrors((e) => { const copy = { ...e }; delete copy.services; return copy; });
      }
      return { ...prev, selectedServices: next };
    });
  };

  const handleProposalFileUpload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) { setUploadError('File exceeds maximum allowed size of 25MB.'); return; }
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    if (!ALLOWED_UPLOAD_EXTS.includes(ext)) { setUploadError('Unsupported file type. SVG is not allowed.'); return; }
    setUploadError(null);
    setIsUploadingProposal(true);
    try {
      const storeAs = values.proposalUrl?.startsWith('/uploads/') ? values.proposalUrl : undefined;
      let res;
      try { res = await workspaceService.uploadProposal(file, storeAs); }
      catch { res = await dailyLogService.uploadDeliverableFile(file, storeAs); }
      patch({ proposalUrl: res.file_url, proposalName: res.file_name || file.name, proposalSize: res.file_size || file.size });
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload proposal attachment.');
    } finally {
      setIsUploadingProposal(false);
    }
  };

  const runValidation = () => {
    const errors = validateClientForm(values);
    setFieldErrors(errors);
    setHasAttemptedSubmit(true);
    if (Object.keys(errors).length > 0) {
      setTimeout(() => {
        focusFirstError();
        document.querySelector('[aria-invalid="true"], [role="alert"]')?.scrollIntoView({ block: 'center' });
      }, 10);
      return false;
    }
    return true;
  };

  return {
    values, patch, resetFrom, markClean, isDirty, fieldErrors, setFieldErrors, hasAttemptedSubmit,
    serverError, setServerError, isSubmitting, setIsSubmitting, isUploadingProposal, uploadError,
    errorCount, pendingLogoFile, pendingLogoPreview,
    setPendingLogo: (file: File | null, preview: string | null) => { setPendingLogoFile(file); setPendingLogoPreview(preview); },
    toggleService, handleProposalFileUpload, runValidation,
    payload: () => buildWorkspacePayload(values) as WorkspaceCreatePayload | WorkspaceUpdatePayload,
  };
}
