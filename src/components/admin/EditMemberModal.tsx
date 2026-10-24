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
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { CustomSelect } from '../ui/CustomSelect';
import type { UserRole } from '../../types/auth';
import type { AdminMember, EmploymentType, UpdateMemberPayload } from '../../types/admin';
import type { Workspace } from '../../types';
import { workspaceService } from '../../services/workspaceService';
import { useAuth } from '../../context/AuthContext';
import { looksLikeEmail, normalizePhoneForSave, phoneForInput } from '../../utils/phone';
import { focusFirstError } from '../../utils/formFocus';
import { cn } from '../../lib/utils';
import {
  CANONICAL_DEPARTMENTS,
  mapDeptToOption,
  memberDepartmentLists,
  sameDept,
} from '../../utils/departments';

export const DEPARTMENTS = CANONICAL_DEPARTMENTS;

export const ROLES: { id: UserRole; label: string; description: string }[] = [
  { id: 'team_member', label: 'Team member', description: 'Records own tasks and daily logs' },
  { id: 'team_lead', label: 'Team lead', description: 'Leads a department and reviews team logs' },
  { id: 'hr', label: 'HR', description: 'All departments, logs and compliance' },
  { id: 'operations', label: 'Operations', description: 'Company-wide view-only access, plus won-deal and HR approvals' },
  { id: 'admin', label: 'Admin', description: 'Full system control and user management' },
  { id: 'client', label: 'Client', description: 'Client portal and approvals only' },
];

interface EditMemberModalProps {
  isOpen: boolean;
  member: AdminMember | null;
  onClose: () => void;
  onSubmit: (userId: string, payload: UpdateMemberPayload) => Promise<void>;
}

const generateRandomPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part3 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part1}-${part2}-${part3}`;
};

export const EditMemberModal: React.FC<EditMemberModalProps> = ({
  isOpen,
  member,
  onClose,
  onSubmit,
}) => {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('team_member');
  const [primaryDepartment, setPrimaryDepartment] = useState<string>('Website');
  const [secondaryDepartments, setSecondaryDepartments] = useState<string[]>([]);
  const selectedDepartments = [
    primaryDepartment,
    ...secondaryDepartments.filter((d) => !sameDept(d, primaryDepartment)),
  ];
  const [joiningDate, setJoiningDate] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('contract');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [deactivationDate, setDeactivationDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [activeClients, setActiveClients] = useState<Workspace[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

    const finishingSetup = Boolean(member?.needs_setup);
    const loginManagedElsewhere = Boolean(member?.login_managed_elsewhere);
  const canEditIdentity =
    member?.can_edit_identity != null ? Boolean(member.can_edit_identity) : !loginManagedElsewhere;
  const canEditRole = member?.can_edit_role !== false;
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (isOpen && member) {
      setFullName(member.full_name || '');
      setEmail(member.email || '');
      setPhone(phoneForInput(member.phone));
      setRole((member.role as any) === 'member' ? 'team_member' : member.role || 'team_member');
      const mapped = memberDepartmentLists(member);
      setPrimaryDepartment(mapped.primary || 'Website');
      setSecondaryDepartments(mapped.secondaries);

      setJoiningDate(member.joining_date || '');
      setEmploymentType(member.employment_type === 'probation' ? 'probation' : 'contract');
      setPassword('');
      setShowPassword(false);
      setIsActive(member.is_active !== undefined ? member.is_active : true);
      setDeactivationDate(member.deactivation_date || '');
      setSelectedWorkspaceId(member.workspace_ids?.[0] || '');
      setCopied(false);
      setFieldErrors({});
      setServerError(null);
      setHasSubmitted(false);
    }
  }, [isOpen, member]);

  useEffect(() => {
    if (!isOpen || role !== 'client') return;
    let cancelled = false;
    workspaceService
      .getWorkspaces()
      .then((list) => {
        if (!cancelled) setActiveClients(list.filter((w) => w.status !== 'inactive'));
      })
      .catch(() => {
        if (!cancelled) setActiveClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, role]);

  const handleCopyPassword = () => {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) {
      errs.fullName = 'Full name is required';
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (canEditIdentity && (!normalizedEmail || !looksLikeEmail(normalizedEmail))) {
      errs.email = 'A valid work email is required';
    }
    const normalizedPhone = phone.trim() ? normalizePhoneForSave(phone) : undefined;
    if (phone.trim() && !normalizedPhone) {
      errs.phone = 'Invalid phone number format';
    }
    if (role === 'client' && !selectedWorkspaceId) {
      errs.workspaceId = 'Please select a client workspace';
    }
    if (role !== 'client' && role !== 'admin' && role !== 'operations' && role !== 'hr' && selectedDepartments.length === 0) {
      errs.departments = 'Please select at least one department';
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;
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

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim() ? normalizePhoneForSave(phone) : undefined;

    let deptValue: string | undefined = undefined;
    let deptsList: string[] = [];

    if (role === 'client') {
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

    try {
      setIsSubmitting(true);
      if (loginManagedElsewhere || !canEditIdentity) {
        const payload: UpdateMemberPayload = {};
        if (finishingSetup || (canEditRole && role !== member.role)) {
          payload.role = role;
        }
        const newPrimary = role === 'client' ? undefined : (role === 'operations' || role === 'admin' ? 'All' : (role === 'hr' ? 'HR' : primaryDepartment));
        const initialDepts = (member.departments && member.departments.length > 0) ? member.departments : (member.department ? [member.department] : []);
        if (finishingSetup || (newPrimary !== member.primary_department && (newPrimary !== undefined || member.primary_department !== undefined))) {
          payload.primary_department = newPrimary;
        }
        if (finishingSetup || JSON.stringify(deptsList) !== JSON.stringify(initialDepts)) {
          payload.department = deptValue;
          payload.departments = deptsList;
        }
        const newJoining = role === 'client' ? null : joiningDate.trim() || null;
        if (newJoining !== (member.joining_date || null)) {
          payload.joining_date = newJoining;
        }
        const newEmpType = role === 'client' ? 'contract' : employmentType;
        if (newEmpType !== member.employment_type) {
          payload.employment_type = newEmpType;
        }
        const newWorkspaces = role === 'client' ? (selectedWorkspaceId ? [selectedWorkspaceId] : []) : [];
        const oldWorkspaces = member.workspace_ids || [];
        if (JSON.stringify(newWorkspaces) !== JSON.stringify(oldWorkspaces)) {
          payload.workspace_ids = newWorkspaces;
        }
        // Never send is_active for login_managed_elsewhere
        await onSubmit(member.id, payload);
      } else {
        const newPrimary = role === 'client' ? undefined : (role === 'operations' || role === 'admin' ? 'All' : (role === 'hr' ? 'HR' : primaryDepartment));
        const initialDepts = (member.departments && member.departments.length > 0) ? member.departments : (member.department ? [member.department] : []);
        const payload: UpdateMemberPayload = {
          joining_date: role === 'client' ? null : joiningDate.trim() || null,
          employment_type: role === 'client' ? 'contract' : employmentType,
          is_active: isActive,
          ...(!isActive && deactivationDate && deactivationDate !== (member.deactivation_date || '')
            ? { deactivation_date: deactivationDate }
            : {}),
          workspace_ids: role === 'client' ? (selectedWorkspaceId ? [selectedWorkspaceId] : []) : [],
          full_name: fullName.trim(),
          phone: normalizedPhone,
        };
        if (finishingSetup || (canEditRole && role !== member.role)) {
          payload.role = role;
        }
        if (finishingSetup || (newPrimary !== member.primary_department && (newPrimary !== undefined || member.primary_department !== undefined))) {
          payload.primary_department = newPrimary;
        }
        if (finishingSetup || JSON.stringify(deptsList) !== JSON.stringify(initialDepts)) {
          payload.department = deptValue;
          payload.departments = deptsList;
        }
        if (canEditIdentity && normalizedEmail !== (member.email || '').toLowerCase()) {
          payload.email = normalizedEmail;
        }
        if (canEditIdentity && password.trim()) {
          payload.password = password.trim();
        }
        await onSubmit(member.id, payload);
      }
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to update member profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={isSubmitting ? undefined : onClose}
      maxWidth="lg"
      title="Edit member details"
      subtitle="Update roles, department assignments, contact details, and account status."
    >
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
        <FormDialogBody className="space-y-4">
          {finishingSetup && (
            <p className="text-ui text-fg-muted">
              Pick a role and department to finish this member&apos;s setup.
            </p>
          )}
          {/* Row 1: Full name + Work email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Full name {!loginManagedElsewhere && <span className="text-danger-fg">*</span>}
              </label>
              {loginManagedElsewhere ? (
                <p className="h-9 px-3 flex items-center text-ui text-fg-muted bg-subtle border border-border rounded-md">
                  {fullName}
                </p>
              ) : (
                <>
                  <input
                    type="text"
                    name="fullName"
                    required
                    value={fullName}
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
                </>
              )}
            </div>

            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Work email {canEditIdentity && <span className="text-danger-fg">*</span>}
              </label>
              {!canEditIdentity ? (
                <>
                  <p className="h-9 px-3 flex items-center text-ui text-fg-muted bg-subtle border border-border rounded-md">
                    {email}
                  </p>
                  <p className="text-caption text-fg-muted mt-1.5">
                    Only the platform owner can change this login.
                  </p>
                </>
              ) : (
                <input
                  type="email"
                  name="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
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
              )}
              {fieldErrors.email && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldErrors.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Phone + Joining date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Phone / WhatsApp
              </label>
              {loginManagedElsewhere ? (
                <p className="h-9 px-3 flex items-center text-ui text-fg-muted bg-subtle border border-border rounded-md">
                  {phone || '—'}
                </p>
              ) : (
                <>
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
                </>
              )}
            </div>

            {role !== 'client' && (
              <div>
                <label className="block text-ui font-medium text-fg mb-1.5">
                  Joining date
                </label>
                <CustomDatePicker
                  value={joiningDate}
                  onChange={setJoiningDate}
                />
              </div>
            )}
          </div>

          {/* Row 3: Role (2-column RadioCards) */}
          <div>
            <label className="block text-ui font-medium text-fg mb-2">Role</label>
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 ${!canEditRole ? 'opacity-60' : ''}`}>
              {ROLES.filter((r) => r.id !== 'operations' || user?.role === 'admin').map((r) => {
                const isSelected = role === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      if (canEditRole) setRole(r.id);
                    }}
                    aria-disabled={!canEditRole}
                    className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 ${
                      canEditRole ? 'cursor-pointer' : 'cursor-not-allowed'
                    } ${
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

          {/* Row 4: Client Workspace picker (when role is client) */}
          {role === 'client' && (
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

          {/* Row 5: Department selection (when role is internal) */}
          {role !== 'client' && role !== 'operations' && role !== 'hr' && role !== 'admin' && (
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
                  options={[
                    ...DEPARTMENTS.filter((d) => d !== 'HR'),
                    ...(primaryDepartment && !DEPARTMENTS.some((d) => sameDept(d, primaryDepartment))
                      ? [primaryDepartment]
                      : []),
                  ].map((dept) => ({
                    value: mapDeptToOption(dept, DEPARTMENTS) || dept,
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
          {role === 'hr' && (
            <div className="p-3 rounded-lg bg-surface border border-border text-fg text-ui flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-accent shrink-0" />
              <span>HR role has global access across all departments for logs and attendance.</span>
            </div>
          )}

          {role === 'operations' && (
            <div className="p-3 rounded-lg bg-surface border border-border text-fg text-ui flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-accent shrink-0" />
              <span>Operations can view every module, company-wide. The only write action in sales is won-deal approval.</span>
            </div>
          )}

          {/* Row 6: Employment type + Account Status */}
          <div className={role === 'client' ? 'pt-1' : 'grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1'}>
            {role !== 'client' && (
              <div>
                <label className="block text-ui font-medium text-fg mb-1.5">
                  Employment type
                </label>
                <SegmentedControl
                  size="sm"
                  value={employmentType}
                  onValueChange={(val) => setEmploymentType(val as EmploymentType)}
                  options={[
                    { value: 'probation', label: 'Probation' },
                    { value: 'contract', label: 'Contract' },
                  ]}
                />
              </div>
            )}

            {!loginManagedElsewhere && (
              <div className="flex flex-col justify-end">
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

            {!loginManagedElsewhere && !isActive && role !== 'client' && (
              <div>
                <label className="block text-ui font-medium text-fg mb-1.5">
                  Inactive from
                </label>
                <CustomDatePicker value={deactivationDate} onChange={setDeactivationDate} />
                <p className="text-caption text-fg-muted mt-1">
                  Their last working day is the day before. Days from this date show as Inactive and are not counted.
                </p>
              </div>
            )}
          </div>

          {/* Row 7: Reset password (optional) */}
          <div className="pt-2 border-t border-border">
            {!canEditIdentity ? (
              loginManagedElsewhere ? (
              <p className="text-ui text-fg-muted">
                This person manages their own login.
              </p>
              ) : null
            ) : (
              <>
            <label className="block text-ui font-medium text-fg mb-1">
              Reset password <span className="text-fg-muted font-normal">(leave blank to keep current)</span>
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password or click generate"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                  onClick={() => setPassword(generateRandomPassword())}
                />
                {password && (
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    label="Copy password"
                    icon={copied ? Check : Copy}
                    onClick={handleCopyPassword}
                  />
                )}
              </div>
            </div>
              </>
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
            {finishingSetup ? 'Finish setup' : 'Save changes'}
          </Button>
        </FormFooter>
      </form>
    </FormDialog>
  );
};
