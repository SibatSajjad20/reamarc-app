import React, { useEffect, useState, useRef } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { focusFirstError } from '../../utils/formFocus';
import { FormErrorSummaryButton } from '../../hooks/useFormValidation';
import type { CrmAssignee, CrmLead, CrmLeadCreatePayload } from '../../types/crm';
import {
  LEAD_BUDGETS,
  LEAD_BUSINESS_STAGES,
  LEAD_EMPLOYEE_COUNTS,
  LEAD_HELP_WITH,
  LEAD_INDUSTRIES,
  LEAD_OBJECTIVES,
  LEAD_ROLES,
  LEAD_SALES_TEAMS,
  LEAD_START_TIMELINES,
  asOptions,
} from './qualificationOptions';
import {
  validateCityName,
  validateCompanyName,
  validateDescription,
  validateEmailAddress,
  validatePersonName,
  validatePhoneNumber,
  validateWebsiteUrl,
} from './leadFieldValidation';

const SOURCES = ['manual', 'website', 'referral', 'meta', 'google', 'other'].map((v) => ({
  value: v,
  label: v.charAt(0).toUpperCase() + v.slice(1),
}));

const inputClass =
  'mt-1 w-full h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent';

interface CrmCreateLeadModalProps {
  isOpen: boolean;
  assignees: CrmAssignee[];
  canAssign: boolean;
  mode?: 'create' | 'edit';
  initialLead?: CrmLead | null;
  onClose: () => void;
  onSubmit: (payload: CrmLeadCreatePayload & { mark_form_complete?: boolean }) => Promise<void>;
}

interface FormState {
  name: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  noWebsite: boolean;
  role: string;
  industry: string;
  businessStage: string;
  employeeCount: string;
  salesTeam: string;
  helpWith: string[];
  helpOther: string;
  objective: string;
  startTimeline: string;
  budget: string;
  brief: string;
  city: string;
  source: string;
  assignedTo: string;
}

const EMPTY: FormState = {
  name: '',
  company: '',
  email: '',
  phone: '',
  website: '',
  noWebsite: false,
  role: '',
  industry: '',
  businessStage: '',
  employeeCount: '',
  salesTeam: '',
  helpWith: [],
  helpOther: '',
  objective: '',
  startTimeline: '',
  budget: '',
  brief: '',
  city: '',
  source: 'manual',
  assignedTo: '',
};

function stateFromLead(lead: CrmLead): FormState {
  return {
    name: lead.name || '',
    company: lead.company || '',
    email: lead.email || '',
    phone: lead.phone_e164 ? `+${lead.phone_e164}` : lead.phone_raw || '',
    website: lead.website || '',
    noWebsite: !lead.website,
    role: lead.role || '',
    industry: lead.industry || '',
    businessStage: lead.business_stage || '',
    employeeCount: lead.employee_count || '',
    salesTeam: lead.sales_team || '',
    helpWith: Array.isArray(lead.help_with) ? lead.help_with : [],
    helpOther: lead.help_other || '',
    objective: lead.objective || '',
    startTimeline: lead.start_timeline || '',
    budget: lead.budget || '',
    brief: lead.brief || '',
    city: lead.city || '',
    source: lead.source || 'manual',
    assignedTo: lead.assigned_to || '',
  };
}

export const CrmCreateLeadModal: React.FC<CrmCreateLeadModalProps> = ({
  isOpen,
  assignees,
  canAssign,
  mode = 'create',
  initialLead = null,
  onClose,
  onSubmit,
}) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && initialLead) {
      setForm(stateFromLead(initialLead));
    } else {
      setForm(EMPTY);
    }
    setError(null);
    setFieldErrors({});
  }, [isOpen, mode, initialLead]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const toggleHelp = (item: string) => {
    setForm((prev) => {
      const exists = prev.helpWith.includes(item);
      const next = exists ? prev.helpWith.filter((h) => h !== item) : [...prev.helpWith, item];
      return { ...prev, helpWith: next };
    });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const nameErr = validatePersonName(form.name);
    if (nameErr) errs.name = nameErr;
    const companyErr = validateCompanyName(form.company);
    if (companyErr) errs.company = companyErr;
    const emailErr = validateEmailAddress(form.email);
    if (emailErr) errs.email = emailErr;
    const phoneErr = validatePhoneNumber(form.phone);
    if (phoneErr) errs.phone = phoneErr;
    const siteErr = validateWebsiteUrl(form.website, form.noWebsite);
    if (siteErr) errs.website = siteErr;
    const cityErr = validateCityName(form.city);
    if (cityErr) errs.city = cityErr;
    if (!form.role) errs.role = 'Role is required.';
    if (!form.industry) errs.industry = 'Industry is required.';
    if (!form.businessStage) errs.businessStage = 'Business stage is required.';
    if (!form.employeeCount) errs.employeeCount = 'Employee count is required.';
    if (!form.salesTeam) errs.salesTeam = 'Sales team is required.';
    if (form.helpWith.length === 0) errs.helpWith = 'Select at least one need.';
    if (form.helpWith.includes('Other')) {
      const otherErr = validateDescription(form.helpOther, 'The specific need');
      if (otherErr) errs.helpOther = otherErr;
    }
    if (!form.objective) errs.objective = 'Main objective is required.';
    if (!form.startTimeline) errs.startTimeline = 'Timeline is required.';
    const briefErr = validateDescription(form.brief, 'Description');
    if (briefErr) errs.brief = briefErr;

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      setTimeout(() => {
        if (formRef.current) focusFirstError(formRef.current);
      }, 50);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: CrmLeadCreatePayload & { mark_form_complete?: boolean } = {
        name: form.name.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        website: form.noWebsite ? undefined : form.website.trim() || undefined,
        city: form.city.trim() || undefined,
        brief: form.brief.trim(),
        budget: form.budget || undefined,
        source: form.source || 'manual',
        assigned_to: canAssign && form.assignedTo ? form.assignedTo : undefined,
        role: form.role,
        industry: form.industry,
        business_stage: form.businessStage,
        employee_count: form.employeeCount,
        sales_team: form.salesTeam,
        help_with: form.helpWith,
        help_other: form.helpWith.includes('Other') ? form.helpOther.trim() : undefined,
        objective: form.objective,
        start_timeline: form.startTimeline,
        mark_form_complete: true,
      };
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save lead.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent maxWidth="lg" className="p-0 overflow-hidden">
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col max-h-[calc(100vh-64px)]">
          <DialogHeader className="p-5 pb-3 border-b border-border">
            <DialogTitle className="text-h2 font-semibold text-fg">
              {mode === 'edit' ? 'Edit Lead Brief & Info' : 'New Lead'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-4 custom-scrollbar">
            <Section title="Contact Information" />
            <TextField label="Full Name" required value={form.name} error={fieldErrors.name} onChange={(v) => set('name', v)} />
            <TextField label="Company" required value={form.company} error={fieldErrors.company} onChange={(v) => set('company', v)} />
            <TextField label="Work Email" required type="email" value={form.email} error={fieldErrors.email} onChange={(v) => set('email', v)} />
            <TextField label="WhatsApp / Phone" required value={form.phone} error={fieldErrors.phone} onChange={(v) => set('phone', v)} />

            <div className="md:col-span-2">
              <TextField
                label="Company Website"
                value={form.website}
                error={fieldErrors.website}
                onChange={(v) => set('website', v)}
              />
              <div className="mt-1.5">
                <Checkbox
                  id="no-website"
                  checked={form.noWebsite}
                  onCheckedChange={(c) => set('noWebsite', Boolean(c))}
                  label="They don't have a website yet"
                />
              </div>
            </div>

            <Section title="Qualification & Business Details" />
            <SelectField label="Role at company" required value={form.role} error={fieldErrors.role} options={LEAD_ROLES} onChange={(v) => set('role', v)} />
            <SelectField label="Industry" required value={form.industry} error={fieldErrors.industry} options={LEAD_INDUSTRIES} onChange={(v) => set('industry', v)} />
            <SelectField label="Business stage" required value={form.businessStage} error={fieldErrors.businessStage} options={LEAD_BUSINESS_STAGES} onChange={(v) => set('businessStage', v)} />
            <SelectField label="Employee count" required value={form.employeeCount} error={fieldErrors.employeeCount} options={LEAD_EMPLOYEE_COUNTS} onChange={(v) => set('employeeCount', v)} />
            <SelectField
              label="Sales team size"
              required
              className="md:col-span-2"
              value={form.salesTeam}
              error={fieldErrors.salesTeam}
              options={LEAD_SALES_TEAMS}
              onChange={(v) => set('salesTeam', v)}
            />

            <div className="md:col-span-2">
              <span className="block text-small font-medium text-fg mb-1">
                What do they need help with? *
              </span>
              <FieldError message={fieldErrors.helpWith} />
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {LEAD_HELP_WITH.map((item) => {
                  const checked = form.helpWith.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleHelp(item)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-left text-xs transition-colors cursor-pointer ${
                        checked
                          ? 'border-accent bg-accent-soft text-fg font-medium'
                          : 'border-border bg-surface text-fg-muted hover:bg-hover hover:text-fg'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        className="pointer-events-none"
                        tabIndex={-1}
                      />
                      <span>{item}</span>
                    </button>
                  );
                })}
              </div>
              {form.helpWith.includes('Other') && (
                <label className="block mt-2 text-small font-medium text-fg">
                  Describe the specific need *
                  <textarea
                    value={form.helpOther}
                    onChange={(e) => set('helpOther', e.target.value)}
                    rows={2}
                    placeholder="What else do they need?"
                    className="mt-1 w-full p-2.5 rounded-md border border-border bg-subtle/50 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <FieldError message={fieldErrors.helpOther} />
                </label>
              )}
            </div>

            <SelectField label="Main objective" required value={form.objective} error={fieldErrors.objective} options={LEAD_OBJECTIVES} onChange={(v) => set('objective', v)} />
            <SelectField label="When to start" required value={form.startTimeline} error={fieldErrors.startTimeline} options={LEAD_START_TIMELINES} onChange={(v) => set('startTimeline', v)} />

            <SelectField
              label="Maximum monthly budget"
              className="md:col-span-2"
              value={form.budget}
              options={LEAD_BUDGETS}
              blank="Not provided"
              onChange={(v) => set('budget', v)}
            />

            <label className="md:col-span-2 text-small font-medium text-fg">
              Briefly describe what they need *
              <textarea
                value={form.brief}
                onChange={(e) => set('brief', e.target.value)}
                rows={3}
                placeholder="What they are trying to achieve, and the problem they are facing."
                className="mt-1 w-full p-2.5 rounded-md border border-border bg-subtle/50 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <FieldError message={fieldErrors.brief} />
            </label>

            <Section title="Internal Details" />
            <TextField label="City" value={form.city} error={fieldErrors.city} onChange={(v) => set('city', v)} />

            {mode === 'create' && (
              <div className="text-small font-medium text-fg">
                Source
                <div className="mt-1">
                  <CustomSelect value={form.source} onChange={(v) => set('source', v)} options={SOURCES} size="sm" />
                </div>
              </div>
            )}

            {mode === 'create' && canAssign && (
              <div className="md:col-span-2 text-small font-medium text-fg">
                Assign to
                <div className="mt-1">
                  <CustomSelect
                    value={form.assignedTo}
                    onChange={(v) => set('assignedTo', v)}
                    options={[{ value: '', label: 'Unassigned' }, ...assignees.map((a) => ({ value: a.id, label: a.full_name }))]}
                    size="sm"
                  />
                </div>
              </div>
            )}

          </div>

          <DialogFooter className="p-4 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FormErrorSummaryButton
                count={Object.keys(fieldErrors).length}
                onClick={() => {
                  if (formRef.current) focusFirstError(formRef.current);
                }}
              />
              {error && (
                <div className="flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={saving}
                loading={saving}
                loadingText="Saving…"
                icon={Plus}
              >
                {mode === 'edit' ? 'Save form' : 'Create lead'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

function Section({ title }: { title: string }) {
  return (
    <h3 className="md:col-span-2 pt-2 text-[13px] font-semibold text-fg border-b border-border pb-1">
      {title}
    </h3>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-micro font-medium text-danger-fg">{message}</p>;
}

function TextField({
  label,
  value,
  onChange,
  required,
  type = 'text',
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  error?: string;
}) {
  return (
    <label className="text-small font-medium text-fg block">
      {label} {required ? '*' : ''}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      <FieldError message={error} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  required,
  blank = 'Select',
  className = '',
  error,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  blank?: string;
  className?: string;
  error?: string;
}) {
  return (
    <div className={`text-small font-medium text-fg ${className}`}>
      {label} {required ? '*' : ''}
      <div className="mt-1">
        <CustomSelect value={value} onChange={onChange} options={asOptions(options, blank)} size="sm" />
      </div>
      <FieldError message={error} />
    </div>
  );
}
