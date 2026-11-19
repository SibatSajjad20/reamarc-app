import React, { useState, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  Shield,
} from 'lucide-react';
import { FormDialog, FormDialogBody } from '../ui/FormDialogLayout';
import { FormFooter } from '../ui/FormFooter';
import { Button, IconButton } from '../ui/button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { CustomSelect } from '../ui/CustomSelect';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import type { UserRole } from '../../types/auth';
import type { AdminMember, CreateMemberPayload, EmploymentType, UpdateMemberPayload } from '../../types/admin';
import type { Workspace } from '../../types';
import { workspaceService } from '../../services/workspaceService';
import { useAuth } from '../../context/AuthContext';
import { looksLikeEmail, normalizePhoneForSave } from '../../utils/phone';
import { focusFirstError } from '../../utils/formFocus';
import { cn } from '../../lib/utils';
import { CANONICAL_DEPARTMENTS, sameDept } from '../../utils/departments';
import { assignableDirectoryRoles } from '../../utils/directoryRoles';
import { defaultProbationEnd } from '../../utils/probationDates';

export const DEPARTMENTS = CANONICAL_DEPARTMENTS;

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (payload: CreateMemberPayload) => Promise<any>;
  defaultRole?: UserRole;
  /**
   * Edit an existing CLIENT account with the same client form used to add one.
   * When set (together with onUpdate) the modal pre-fills the client's values
   * and saves through PATCH /admin/members/{id}.
   */
  member?: AdminMember | null;
  onUpdate?: (userId: string, payload: UpdateMemberPayload) => Promise<void>;
}

/** Build the PATCH payload for the client edit form: only fields that changed. */
export function buildClientUpdatePayload(
  member: AdminMember,
  values: {
    fullName: string;
    email: string;
    workspaceId: string;
    password: string;
    isActive: boolean;
    canEditIdentity: boolean;
    loginManagedElsewhere: boolean;
  },
): UpdateMemberPayload {
  const payload: UpdateMemberPayload = {};
  const oldWorkspaces = (member.workspace_ids || []).filter(Boolean);
  if (values.workspaceId && values.workspaceId !== oldWorkspaces[0]) {
    // Keep any extra workspaces this login already had; replace the primary one.
    payload.workspace_ids = [
      values.workspaceId,
      ...oldWorkspaces.slice(1).filter((id) => id !== values.workspaceId),
    ];
  }
  if (values.canEditIdentity) {
    const name = values.fullName.trim();
    if (name && name !== (member.full_name || '')) payload.full_name = name;
    const normalizedEmail = values.email.trim().toLowerCase();
    if (normalizedEmail && normalizedEmail !== (member.email || '').toLowerCase()) {
      payload.email = normalizedEmail;
    }
    if (values.password.trim()) payload.password = values.password.trim();
  }
  if (!values.loginManagedElsewhere && values.isActive !== (member.is_active !== false)) {
    payload.is_active = values.isActive;
  }
  return payload;
}

const generateRandomPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part3 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part1}-${part2}-${part3}`;
};

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  defaultRole = 'team_member',
  member = null,
  onUpdate,
}) => {
  const { user } = useAuth();
  const isEdit = Boolean(member && onUpdate);
  const loginManagedElsewhere = Boolean(member?.login_managed_elsewhere);
  const canEditIdentity = isEdit
    ? (member?.can_edit_identity != null ? Boolean(member.can_edit_identity) : !loginManagedElsewhere)
    : true;
  const [isActive, setIsActive] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [primaryDepartment, setPrimaryDepartment] = useState<string>('Website');
  const [secondaryDepartments, setSecondaryDepartments] = useState<string[]>([]);
  const selectedDepartments = [
    primaryDepartment,
    ...secondaryDepartments.filter((d) => !sameDept(d, primaryDepartment)),
  ];
  const [joiningDate, setJoiningDate] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('contract');
  const [probationEndDate, setProbationEndDate] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [activeClients, setActiveClients] = useState<Workspace[]>([]);

  const isClientForm = isEdit || role === 'client' || defaultRole === 'client';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reusedEmailConflict, setReusedEmailConflict] = useState<{
    previous_name: string;
    previous_user_id: string;
    email: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen && isEdit && member) {
      setFullName(member.full_name || '');
      setEmail(member.email || '');
      setPhone('');
      setRole('client');
      setSelectedWorkspaceId((member.workspace_ids || []).filter(Boolean)[0] || '');
      setTemporaryPassword('');
      setIsActive(member.is_active !== false);
      setShowPassword(false);
      setCopied(false);
      setFieldErrors({});
      setServerError(null);
      setReusedEmailConflict(null);
      setHasSubmitted(false);
      return;
    }
    if (isOpen) {
      setIsActive(true);
      setFullName('');
      setEmail('');
      setPhone('');
      const initialRole = defaultRole === 'client' ? 'client' : (defaultRole === 'member' ? 'team_member' : defaultRole);
      setRole(initialRole);
      setPrimaryDepartment('Website');
      setSecondaryDepartments([]);
      const today = new Date().toISOString().slice(0, 10);
      setJoiningDate(today);
      setEmploymentType('contract');
      setProbationEndDate(defaultProbationEnd(today));
      setTemporaryPassword(generateRandomPassword());
      setShowPassword(false);
      setSelectedWorkspaceId('');
      setCopied(false);
      setFieldErrors({});
      setServerError(null);
      setReusedEmailConflict(null);
      setHasSubmitted(false);
    }
  }, [isOpen, defaultRole, isEdit, member]);

  useEffect(() => {
    if (!isOpen || !isClientForm) return;
    let cancelled = false;
    workspaceService
      .getWorkspaces()
      .then((workspaces) => {
        if (cancelled) return;
        const available = (workspaces || []).filter((w) => w.status !== 'inactive');
        setActiveClients(available);
      })
      .catch(() => {
        if (!cancelled) setActiveClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, role, isClientForm]);

  const handleCopyPassword = () => {
    if (!temporaryPassword) return;
    navigator.clipboard.writeText(temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) {
      errs.fullName = 'Full name is required';
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !looksLikeEmail(normalizedEmail)) {
      errs.email = 'A valid work email is required';
    }
    const normalizedPhone = phone.trim() ? normalizePhoneForSave(phone) : undefined;
    if (!isClientForm && phone.trim() && !normalizedPhone) {
      errs.phone = 'Invalid phone number format';
    }
    if (isClientForm) {
      if (!selectedWorkspaceId) {
        errs.workspaceId = 'Please select a client workspace';
      }
    } else {
      if (role !== 'admin' && role !== 'operations' && role !== 'hr') {
        if (selectedDepartments.length === 0) {
          errs.departments = 'Please select at least one department';
        }
      }
      if (employmentType === 'probation' && !probationEndDate.trim()) {
        errs.probationEnd = 'Probation end date is required';
      }
    }
    return errs;
  };

  const buildPayload = (action?: 'archive_and_create' | 'reactivate'): CreateMemberPayload => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim() ? normalizePhoneForSave(phone) : undefined;

    let deptValue: string | undefined = undefined;
    let deptsList: string[] = [];

    if (isClientForm) {
      deptValue = undefined;
      deptsList = [];
    } else if (role === 'hr') {
      deptValue = 'HR';
      deptsList = ['HR'];
    } else if (role === 'operations' || role === 'admin') {
      deptValue = 'All';
      deptsList = ['All'];
    } else {
      deptValue = selectedDepartments[0] || 'Website';
      deptsList = selectedDepartments;
    }

    return {
      full_name: fullName.trim(),
      email: normalizedEmail,
      // Client logins don't collect a phone number.
      phone: isClientForm ? undefined : normalizedPhone,
      role: isClientForm ? 'client' : role,
      department: deptValue,
      departments: deptsList,
      primary_department: isClientForm ? undefined : (role === 'operations' || role === 'admin' ? 'All' : (role === 'hr' ? 'HR' : primaryDepartment)),
      joining_date: isClientForm ? null : joiningDate.trim() || null,
      employment_type: isClientForm ? 'contract' : employmentType,
      probation_start_date:
        !isClientForm && employmentType === 'probation' ? joiningDate.trim() || null : null,
      probation_end_date:
        !isClientForm && employmentType === 'probation' ? probationEndDate.trim() || null : null,
      temporary_password: temporaryPassword,
      send_invite_email: true,
      is_active: true,
      workspace_ids: isClientForm ? (selectedWorkspaceId ? [selectedWorkspaceId] : []) : [],
      reused_email_action: action,
    };
  };

  const handleConfirmChoice = async (action: 'archive_and_create' | 'reactivate') => {
    try {
      setIsSubmitting(true);
      setServerError(null);
      if (!onSubmit) return;
      await onSubmit(buildPayload(action));
      setReusedEmailConflict(null);
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to process member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    setServerError(null);

    const errs = validate();
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        if (formRef.current) focusFirstError(formRef.current);
      }, 50);
      return;
    }

    if (isEdit && member && onUpdate) {
      try {
        setIsSubmitting(true);
        const payload = buildClientUpdatePayload(member, {
          fullName,
          email,
          workspaceId: selectedWorkspaceId,
          password: temporaryPassword,
          isActive,
          canEditIdentity,
          loginManagedElsewhere,
        });
        await onUpdate(member.id, payload);
        onClose();
      } catch (err: any) {
        setServerError(err.message || 'Failed to update client account');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    try {
      setIsSubmitting(true);
      if (!onSubmit) return;
      await onSubmit(buildPayload());
      setReusedEmailConflict(null);
      onClose();
    } catch (err: any) {
      const detail = err.details?.detail || err.details || {};
      const isDeactivatedReused =
        detail.code === 'DEACTIVATED_MEMBER_EMAIL_REUSED' ||
        (err.status === 409 && detail.code === 'DEACTIVATED_MEMBER_EMAIL_REUSED');

      if (isDeactivatedReused) {
        setReusedEmailConflict({
          previous_name: detail.previous_name || 'Previous Member',
          previous_user_id: detail.previous_user_id || '',
          email: detail.email || email.trim(),
        });
        setServerError(null);
      } else {
        setServerError(err.message || 'Failed to create team member');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={isSubmitting ? undefined : onClose}
      maxWidth="lg"
      title={isEdit ? 'Edit client account' : isClientForm ? 'Add client account' : 'Add member'}
      subtitle={
        isEdit
          ? "Update this client's portal login and the client workspace it can review."
          : isClientForm
          ? "Create a client portal login for this workspace. They'll receive an invitation by email."
          : "They'll get a sign-in link by email. You can change their role later."
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
        <FormDialogBody className="space-y-4">
          {/* Reused Email Conflict Banner */}
          {reusedEmailConflict && (
            <div
              data-testid="reused-email-conflict-banner"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-fg">
                    Email Previously Used by Deactivated Member
                  </h4>
                  <p className="text-xs text-muted-fg mt-1">
                    <strong className="text-fg">{reusedEmailConflict.email}</strong> belonged to{' '}
                    <strong className="text-fg">{reusedEmailConflict.previous_name}</strong>, who is currently deactivated.
                    Each person must have their own account and history. Choose how to proceed:
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1">
                {/* Choice A: Add as a new person (Primary / Default) */}
                <div className="p-3 rounded-md border border-accent/40 bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-fg flex items-center gap-1.5">
                      <span>Add as a new person</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent-text font-medium">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-fg">
                      Preserves {reusedEmailConflict.previous_name}&apos;s previous account and history under an archived record. Creates a fresh account for {fullName.trim() || 'the new member'} starting with empty history.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => handleConfirmChoice('archive_and_create')}
                    className="shrink-0"
                  >
                    {isSubmitting ? 'Adding...' : 'Add as New Person'}
                  </Button>
                </div>

                {/* Choice B: Reactivate previous person */}
                <div className="p-3 rounded-md border border-border bg-surface/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-fg">
                      Reactivate previous person
                    </div>
                    <p className="text-[11px] text-muted-fg">
                      Reactivates {reusedEmailConflict.previous_name}&apos;s existing account and keeps their past attendance and logs. Only use this if the same person is returning.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => handleConfirmChoice('reactivate')}
                    className="shrink-0"
                  >
                    {isSubmitting ? 'Reactivating...' : 'Reactivate Person'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Row 1: Full name + Work email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Full name <span className="text-danger-fg">*</span>
              </label>
              <input
                type="text"
                name="fullName"
                required
                placeholder="Rida Kamal"
                value={fullName}
                disabled={!canEditIdentity}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (hasSubmitted) {
                    if (e.target.value.trim()) {
                      setFieldErrors((prev) => { const n = { ...prev }; delete n.fullName; return n; });
                    }
                  }
                }}
                aria-invalid={!!fieldErrors.fullName}
                className={`w-full h-9 px-3 text-ui bg-surface border rounded-md text-fg placeholder:text-fg-faint focus:outline-none ${
                  fieldErrors.fullName ? 'border-danger-bd ring-1 ring-danger-bd' : 'border-border focus:border-accent'
                }`}
              />
              {fieldErrors.fullName && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldErrors.fullName}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Work email <span className="text-danger-fg">*</span>
              </label>
              <input
                type="email"
                name="email"
                required
                placeholder="name@company.com"
                value={email}
                disabled={!canEditIdentity}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (reusedEmailConflict) setReusedEmailConflict(null);
                  if (hasSubmitted) {
                    const norm = e.target.value.trim().toLowerCase();
                    if (norm && looksLikeEmail(norm)) {
                      setFieldErrors((prev) => { const n = { ...prev }; delete n.email; return n; });
                    }
                  }
                }}
                aria-invalid={!!fieldErrors.email}
                className={`w-full h-9 px-3 text-ui bg-surface border rounded-md text-fg placeholder:text-fg-faint focus:outline-none ${
                  fieldErrors.email ? 'border-danger-bd ring-1 ring-danger-bd' : 'border-border focus:border-accent'
                }`}
              />
              {fieldErrors.email && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldErrors.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Phone + Joining date (non-clients only; client logins have no phone field) */}
          {!isClientForm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-ui font-medium text-fg mb-1.5">
                  Phone / WhatsApp
                </label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="+92 300 1234567"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (hasSubmitted) {
                      const norm = e.target.value.trim() ? normalizePhoneForSave(e.target.value) : undefined;
                      if (!e.target.value.trim() || norm) {
                        setFieldErrors((prev) => { const n = { ...prev }; delete n.phone; return n; });
                      }
                    }
                  }}
                  aria-invalid={!!fieldErrors.phone}
                  className={`w-full h-9 px-3 text-ui bg-surface border rounded-md text-fg placeholder:text-fg-faint focus:outline-none ${
                    fieldErrors.phone ? 'border-danger-bd ring-1 ring-danger-bd' : 'border-border focus:border-accent'
                  }`}
                />
                {fieldErrors.phone && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.phone}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-ui font-medium text-fg mb-1.5">
                  Joining date
                </label>
                <CustomDatePicker
                  value={joiningDate}
                  onChange={(val) => {
                    setJoiningDate(val);
                    if (employmentType === 'probation') {
                      setProbationEndDate((prev) => prev || defaultProbationEnd(val));
                    }
                  }}
                />
                <p className="text-caption text-fg-muted mt-1">
                  Attendance starts from this date.
                </p>
              </div>
            </div>
          )}

          {/* Row 3: Role (Only for non-clients) */}
          {!isClientForm && (
            <div>
              <label className="block text-ui font-medium text-fg mb-2">Role</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {assignableDirectoryRoles(user?.role)
                  .map((r) => {
                    const isSelected = role === r.id;
                    return (
                      <div
                        key={r.id}
                        onClick={() => setRole(r.id)}
                        className={`p-3 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-3 ${
                          isSelected
                            ? 'border-accent bg-accent-soft text-fg ring-1 ring-accent'
                            : 'border-border bg-surface hover:bg-hover text-fg'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full border mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'border-accent bg-accent'
                              : 'border-border-strong bg-surface'
                          }`}
                        >
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-accent-fg" />}
                        </span>
                        <div className="min-w-0">
                          <div className="text-ui font-medium">{r.label}</div>
                          <div className="text-caption text-fg-muted leading-tight mt-0.5">
                            {r.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Row 4: Client Workspace picker (Single Select, Mandatory, Only for clients) */}
          {isClientForm && (
            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Client workspace <span className="text-danger-fg">*</span>
              </label>
              {activeClients.length === 0 ? (
                <p className="text-ui text-warning-fg">No active client workspaces found. Please create a client workspace first.</p>
              ) : (
                <CustomSelect
                  value={selectedWorkspaceId}
                  onChange={(val) => {
                    setSelectedWorkspaceId(val);
                    if (hasSubmitted && val) {
                      setFieldErrors((prev) => { const n = { ...prev }; delete n.workspaceId; return n; });
                    }
                  }}
                  options={activeClients.map((client) => ({
                    value: client.id,
                    label: client.name,
                  }))}
                  placeholder="Select client workspace..."
                  aria-invalid={!!fieldErrors.workspaceId}
                />
              )}
              <p className="text-caption text-fg-muted mt-1.5">
                Select the client workspace this account is being created for. Only one workspace can be selected.
              </p>
              {fieldErrors.workspaceId && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldErrors.workspaceId}</span>
                </div>
              )}
            </div>
          )}

          {/* Row 5: Department selection (Only for team_member and team_lead) */}
          {!isClientForm && role !== 'operations' && role !== 'hr' && role !== 'admin' && (
            <div className="space-y-3">
              <div>
                <label className="block text-ui font-medium text-fg mb-1.5">
                  Primary department <span className="text-danger-fg">*</span>
                </label>
                <CustomSelect
                  value={primaryDepartment}
                  onChange={(val) => {
                    setPrimaryDepartment(val);
                    setSecondaryDepartments((prev) => prev.filter((d) => !sameDept(d, val)));
                    if (hasSubmitted && val) {
                      setFieldErrors((prev) => { const n = { ...prev }; delete n.departments; return n; });
                    }
                  }}
                  options={DEPARTMENTS.filter((d) => d !== 'HR').map((dept) => ({
                    value: dept,
                    label: dept,
                  }))}
                  placeholder="Select primary department..."
                  aria-invalid={!!fieldErrors.departments}
                />
                <p className="text-caption text-fg-muted mt-1.5">
                  Primary department determines default pipeline stage and department scoping.
                </p>
                {fieldErrors.departments && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.departments}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-ui font-medium text-fg mb-1.5">
                  Secondary departments <span className="text-caption text-fg-muted font-normal">(Optional)</span>
                </label>
                <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-border bg-subtle/40">
                  {DEPARTMENTS.filter((d) => d !== 'HR' && !sameDept(d, primaryDepartment)).map((dept) => {
                    const isSelected = secondaryDepartments.some((d) => sameDept(d, dept));
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => {
                          setSecondaryDepartments((prev) =>
                            prev.some((d) => sameDept(d, dept))
                              ? prev.filter((d) => !sameDept(d, dept))
                              : [...prev, dept]
                          );
                        }}
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium rounded-md border transition-all cursor-pointer flex items-center gap-1.5',
                          isSelected
                            ? 'bg-accent text-accent-fg border-accent shadow-xs'
                            : 'bg-surface text-fg-muted border-border hover:bg-hover hover:text-fg'
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 shrink-0" />}
                        <span>{dept}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-caption text-fg-muted mt-1.5">
                  Additional departments this member contributes to. Extra content stages can also be granted in Settings &gt; Access.
                </p>
              </div>
            </div>
          )}

          {/* Informational banners for HR and Operations */}
          {!isClientForm && role === 'hr' && (
            <div className="p-3 rounded-lg bg-surface border border-border text-fg text-ui flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-accent shrink-0" />
              <span>HR role has global access across all departments for logs and attendance.</span>
            </div>
          )}

          {!isClientForm && role === 'operations' && (
            <div className="p-3 rounded-lg bg-surface border border-border text-fg text-ui flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-accent shrink-0" />
              <span>Operations can view every module, company-wide. The only write action in sales is won-deal approval.</span>
            </div>
          )}

          {/* Row 6: Employment type + Temporary password (Employment type only for non-clients) */}
          <div className={isClientForm ? 'space-y-4 pt-1' : 'grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1'}>
            {!isClientForm && (
              <div>
                <label className="block text-ui font-medium text-fg mb-1.5">
                  Employment type
                </label>
                <SegmentedControl
                  size="sm"
                  value={employmentType}
                  onValueChange={(val) => {
                    const next = val as EmploymentType;
                    setEmploymentType(next);
                    if (next === 'probation' && !probationEndDate) {
                      setProbationEndDate(defaultProbationEnd(joiningDate));
                    }
                  }}
                  options={[
                    { value: 'probation', label: 'Probation' },
                    { value: 'contract', label: 'Contract' },
                  ]}
                />
              </div>
            )}
            {!isClientForm && employmentType === 'probation' && (
              <div>
                <label className="block text-ui font-medium text-fg mb-1.5">
                  Probation end date <span className="text-danger-fg">*</span>
                </label>
                <CustomDatePicker
                  value={probationEndDate}
                  onChange={(val) => {
                    setProbationEndDate(val);
                    if (hasSubmitted && val) {
                      setFieldErrors((prev) => {
                        const n = { ...prev };
                        delete n.probationEnd;
                        return n;
                      });
                    }
                  }}
                  minDate={joiningDate || undefined}
                />
                {fieldErrors.probationEnd && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.probationEnd}</span>
                  </div>
                )}
              </div>
            )}

            {isEdit && !loginManagedElsewhere && (
              <div>
                <label className="block text-ui font-medium text-fg mb-1.5">
                  Account status
                </label>
                <div className="flex items-center gap-2.5 h-8">
                  <ToggleSwitch
                    checked={isActive}
                    onChange={setIsActive}
                    label={isActive ? 'Active' : 'Deactivated'}
                  />
                </div>
              </div>
            )}

            {canEditIdentity && (
            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                {isEdit ? (
                  <>
                    Reset password <span className="text-fg-muted font-normal">(leave blank to keep current)</span>
                  </>
                ) : (
                  'Initial password'
                )}
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder={isEdit ? 'Enter new password or click generate' : undefined}
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                  className="w-full h-9 pl-3 pr-20 text-xs font-mono bg-surface border border-border rounded-md text-fg focus:outline-none focus:border-accent"
                />
                <div className="absolute right-1 flex items-center gap-0.5">
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    label={showPassword ? 'Hide password' : 'Show password'}
                    icon={showPassword ? EyeOff : Eye}
                    onClick={() => setShowPassword(!showPassword)}
                  />
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    label="Generate new password"
                    icon={RefreshCw}
                    onClick={() => setTemporaryPassword(generateRandomPassword())}
                  />
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    label="Copy password"
                    icon={copied ? Check : Copy}
                    onClick={handleCopyPassword}
                  />
                </div>
              </div>
            </div>
            )}
          </div>
        </FormDialogBody>

        <FormFooter
          errorCount={Object.keys(fieldErrors).length}
          onFocusFirst={() => {
            if (formRef.current) focusFirstError(formRef.current);
          }}
          serverError={serverError}
        >
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            {isEdit ? 'Save changes' : isClientForm ? 'Add client account' : 'Add member'}
          </Button>
        </FormFooter>
      </form>
    </FormDialog>
  );
};
