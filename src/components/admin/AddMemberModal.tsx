import React, { useState, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button, IconButton } from '../ui/button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import type { UserRole } from '../../types/auth';
import type { CreateMemberPayload, EmploymentType } from '../../types/admin';
import type { Workspace } from '../../types';
import { workspaceService } from '../../services/workspaceService';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../context/AuthContext';
import { looksLikeEmail, normalizePhoneForSave } from '../../utils/phone';
import { focusFirstError } from '../../utils/formFocus';
import { FormErrorSummaryButton } from '../../hooks/useFormValidation';

export const DEPARTMENTS = [
  'Website',
  'Creative',
  'Content',
  'SEO',
  'Performance marketing',
  'Social media',
  'Sales',
  'AI',
  'Software development',
  'HR',
] as const;

export const ROLES: { id: UserRole; label: string; description: string }[] = [
  { id: 'team_member', label: 'Team member', description: 'Records own tasks and daily logs' },
  { id: 'team_lead', label: 'Team lead', description: 'Leads a department and reviews team logs' },
  { id: 'hr', label: 'HR', description: 'All departments, logs and compliance' },
  { id: 'operations', label: 'Operations', description: 'Cross-department operations and workspaces' },
  { id: 'client', label: 'Client', description: 'Client portal and approvals only' },
];

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateMemberPayload) => Promise<void>;
  defaultRole?: UserRole;
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
}) => {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(['Website']);
  const [joiningDate, setJoiningDate] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('contract');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [activeClients, setActiveClients] = useState<Workspace[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFullName('');
      setEmail('');
      setPhone('');
      setRole(defaultRole === 'member' ? 'team_member' : defaultRole);
      setSelectedDepartments(['Website']);
      const today = new Date().toISOString().slice(0, 10);
      setJoiningDate(today);
      setEmploymentType('contract');
      setTemporaryPassword(generateRandomPassword());
      setShowPassword(false);
      setWorkspaceIds([]);
      setCopied(false);
      setFieldErrors({});
      setServerError(null);
      setHasSubmitted(false);
    }
  }, [isOpen, defaultRole]);

  useEffect(() => {
    if (!isOpen || role !== 'client') return;
    let cancelled = false;
    Promise.all([
      workspaceService.getWorkspaces(),
      adminService.getMembers({ role: 'client' }).catch(() => []),
    ])
      .then(([workspaces]) => {
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
  }, [isOpen, role]);

  const handleCopyPassword = () => {
    if (!temporaryPassword) return;
    navigator.clipboard.writeText(temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  };

  const handleSelectClient = (client: Workspace) => {
    setWorkspaceIds((prev) =>
      prev.includes(client.id) ? prev.filter((id) => id !== client.id) : [...prev, client.id]
    );
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
    if (phone.trim() && !normalizedPhone) {
      errs.phone = 'Invalid phone number format';
    }
    if (role === 'client' && workspaceIds.length === 0) {
      errs.workspaceIds = 'Please select at least one client workspace to link';
    }
    if (role !== 'client' && selectedDepartments.length === 0 && role !== 'admin' && role !== 'operations') {
      errs.departments = 'Please select at least one department';
    }
    return errs;
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

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim() ? normalizePhoneForSave(phone) : undefined;

    try {
      setIsSubmitting(true);
      await onSubmit({
        full_name: fullName.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        role,
        department: selectedDepartments[0] || 'Website',
        departments: selectedDepartments,
        joining_date: role === 'client' ? null : joiningDate.trim() || null,
        employment_type: role === 'client' ? 'contract' : employmentType,
        temporary_password: temporaryPassword,
        send_invite_email: true,
        is_active: true,
        workspace_ids: role === 'client' ? workspaceIds : [],
      });
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to create team member');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent maxWidth="lg" className="p-0 overflow-hidden">
        {/* Header matching Mock 14 */}
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold">
            {role === 'client' ? 'Add client account' : 'Add member'}
          </DialogTitle>
          <DialogDescription className="text-ui text-fg-muted mt-0.5">
            They'll get a sign-in link by email. You can change their role later.
          </DialogDescription>
        </DialogHeader>

        {/* Form Body */}
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="p-6 space-y-4 max-h-[calc(85vh-140px)] overflow-y-auto">
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
                onChange={setJoiningDate}
              />
              <p className="text-caption text-fg-muted mt-1">
                Attendance starts from this date.
              </p>
            </div>
          </div>

          {/* Row 3: Role (2-column RadioCards matching Mock 14) */}
          <div>
            <label className="block text-ui font-medium text-fg mb-2">Role</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ROLES.filter((r) => r.id !== 'operations' || user?.role === 'admin')
                .filter((r) => r.id !== 'client' || defaultRole === 'client')
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

          {/* Row 4: Client Workspaces picker (when role is client) */}
          {role === 'client' && (
            <div>
              <label className="block text-ui font-medium text-fg mb-1">
                Linked workspaces <span className="text-danger-fg">*</span>
              </label>
              <p className="text-caption text-fg-muted mb-2">
                This account will only see content and approvals for selected workspaces.
              </p>
              {activeClients.length === 0 ? (
                <p className="text-ui text-warning-fg">No active client workspaces found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1">
                  {activeClients.map((client) => {
                    const selected = workspaceIds.includes(client.id);
                    return (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => handleSelectClient(client)}
                        className={`p-2.5 rounded-md text-xs border text-left cursor-pointer transition flex items-center justify-between ${
                          selected
                            ? 'bg-accent-soft border-accent text-accent-text font-medium'
                            : 'bg-surface border-border text-fg hover:bg-hover'
                        }`}
                      >
                        <span className="truncate">{client.name}</span>
                        {selected && <Check className="w-3.5 h-3.5 text-accent shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {fieldErrors.workspaceIds && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldErrors.workspaceIds}</span>
                </div>
              )}
            </div>
          )}

          {/* Row 5: Departments multi-select (when role is internal) */}
          {role !== 'client' && (
            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Departments <span className="text-fg-muted font-normal">· select one or more</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DEPARTMENTS.map((dept) => {
                  const isSelected = selectedDepartments.includes(dept);
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => {
                        toggleDepartment(dept);
                        if (hasSubmitted) {
                          setFieldErrors((prev) => { const n = { ...prev }; delete n.departments; return n; });
                        }
                      }}
                      className={`h-7 px-2.5 rounded-md text-[12px] font-medium border transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-accent-soft border-accent-200 text-accent-text'
                          : 'bg-surface border-border text-fg hover:bg-hover'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-accent shrink-0" />}
                      <span>{dept}</span>
                    </button>
                  );
                })}
              </div>
              {fieldErrors.departments && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldErrors.departments}</span>
                </div>
              )}
            </div>
          )}

          {/* Row 6: Employment type + Temporary password matching Mock 14 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
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

            <div>
              <label className="block text-ui font-medium text-fg mb-1.5">
                Initial password
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
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
          </div>
        </form>

        {/* Footer matching Mock 14 */}
        <DialogFooter className="px-6 py-3.5 border-t border-border bg-canvas flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FormErrorSummaryButton
              count={Object.keys(fieldErrors).length}
              onClick={() => {
                if (formRef.current) focusFirstError(formRef.current);
              }}
            />
            {serverError && (
              <div className="flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {role === 'client' ? 'Add client account' : 'Add member'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
