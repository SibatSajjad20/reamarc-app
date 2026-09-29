import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import type { CrmAssignee, CrmLeadCreatePayload } from '../../types/crm';
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
  'mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

interface CrmCreateLeadModalProps {
  isOpen: boolean;
  assignees: CrmAssignee[];
  canAssign: boolean;
  onClose: () => void;
  onSubmit: (payload: CrmLeadCreatePayload) => Promise<void>;
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

type FieldErrors = Partial<Record<keyof FormState, string>>;

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  const name = validatePersonName(form.name);
  const company = validateCompanyName(form.company);
  const email = validateEmailAddress(form.email);
  const phone = validatePhoneNumber(form.phone);
  const website = validateWebsiteUrl(form.website, form.noWebsite);
  const city = validateCityName(form.city);
  const brief = validateDescription(form.brief, 'The description');
  if (name) errors.name = name;
  if (company) errors.company = company;
  if (email) errors.email = email;
  if (phone) errors.phone = phone;
  if (website) errors.website = website;
  if (!form.role) errors.role = 'Role is required.';
  if (!form.industry) errors.industry = 'What the business does is required.';
  if (!form.businessStage) errors.businessStage = 'Business stage is required.';
  if (!form.employeeCount) errors.employeeCount = 'Employee count is required.';
  if (!form.salesTeam) errors.salesTeam = 'Sales team is required.';
  if (form.helpWith.length === 0) errors.helpWith = 'Select at least one thing they need help with.';
  if (form.helpWith.includes('Other')) {
    const other = validateDescription(form.helpOther, 'The specific need');
    if (other) errors.helpOther = other;
  }
  if (!form.objective) errors.objective = 'Main objective is required.';
  if (!form.startTimeline) errors.startTimeline = 'Start timeline is required.';
  if (brief) errors.brief = brief;
  if (city) errors.city = city;
  return errors;
}

export const CrmCreateLeadModal: React.FC<CrmCreateLeadModalProps> = ({
  isOpen,
  assignees,
  canAssign,
  onClose,
  onSubmit,
}) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!isOpen) return;
    setForm(EMPTY);
    setError(null);
    setFieldErrors({});
  }, [isOpen]);

  if (!isOpen) return null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const toggleHelp = (value: string) => {
    setForm((prev) => {
      const selected = prev.helpWith.includes(value)
        ? prev.helpWith.filter((item) => item !== value)
        : [...prev.helpWith, value];
      return {
        ...prev,
        helpWith: selected,
        helpOther: selected.includes('Other') ? prev.helpOther : '',
      };
    });
    setFieldErrors((prev) => ({ ...prev, helpWith: undefined, helpOther: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problems = validate(form);
    const first = Object.values(problems).find(Boolean);
    if (first) {
      setFieldErrors(problems);
      setError(first);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        website: form.noWebsite ? undefined : form.website.trim(),
        no_website: form.noWebsite,
        role: form.role,
        industry: form.industry,
        business_stage: form.businessStage,
        employee_count: form.employeeCount,
        sales_team: form.salesTeam,
        help_with: form.helpWith,
        help_other: form.helpWith.includes('Other') ? form.helpOther.trim() : undefined,
        objective: form.objective,
        start_timeline: form.startTimeline,
        budget: form.budget || undefined,
        brief: form.brief.trim(),
        city: form.city.trim() || undefined,
        source: form.source,
        assigned_to: form.assignedTo || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not create lead.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <form
        noValidate
        onSubmit={handleSubmit}
        className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#11131a] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Create new lead</h2>
            <p className="text-xs text-zinc-500">Qualification answers used by sales to judge fit.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-2 gap-3.5">
          <Section title="Contact" />
          <TextField label="Full name" required value={form.name} error={fieldErrors.name} onChange={(v) => set('name', v)} />
          <TextField label="Company" required value={form.company} error={fieldErrors.company} onChange={(v) => set('company', v)} />
          <TextField label="Work email" required type="email" value={form.email} error={fieldErrors.email} onChange={(v) => set('email', v)} />
          <TextField label="WhatsApp / phone" required value={form.phone} error={fieldErrors.phone} onChange={(v) => set('phone', v)} />
          <label className="col-span-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Website {form.noWebsite ? '' : '*'}
            <input
              value={form.website}
              disabled={form.noWebsite}
              onChange={(e) => set('website', e.target.value)}
              placeholder="https://company.com"
              className={`${inputClass} disabled:opacity-50`}
            />
            <FieldError message={fieldErrors.website} />
          </label>
          <label className="col-span-2 -mt-1 inline-flex items-center gap-2 w-fit text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={form.noWebsite}
              onChange={(e) => {
                const checked = e.target.checked;
                setForm((prev) => ({
                  ...prev,
                  noWebsite: checked,
                  website: checked ? '' : prev.website,
                }));
                setFieldErrors((prev) => ({ ...prev, website: undefined }));
              }}
              className="w-3.5 h-3.5 rounded accent-indigo-600"
            />
            No website
          </label>

          <Section title="Business" />
          <SelectField label="Role" required value={form.role} error={fieldErrors.role} options={LEAD_ROLES} onChange={(v) => set('role', v)} />
          <SelectField label="What the business does" required value={form.industry} error={fieldErrors.industry} options={LEAD_INDUSTRIES} onChange={(v) => set('industry', v)} />
          <SelectField label="Business stage" required value={form.businessStage} error={fieldErrors.businessStage} options={LEAD_BUSINESS_STAGES} onChange={(v) => set('businessStage', v)} />
          <SelectField label="Employees" required value={form.employeeCount} error={fieldErrors.employeeCount} options={LEAD_EMPLOYEE_COUNTS} onChange={(v) => set('employeeCount', v)} />
          <SelectField label="Sales team" required className="col-span-2" value={form.salesTeam} error={fieldErrors.salesTeam} options={LEAD_SALES_TEAMS} onChange={(v) => set('salesTeam', v)} />

          <Section title="Need" />
          <div className="col-span-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            What do you need help with? *
            <FieldError message={fieldErrors.helpWith} />
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {LEAD_HELP_WITH.map((item) => {
                const checked = form.helpWith.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggleHelp(item)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left text-xs font-medium cursor-pointer ${
                      checked
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        checked
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600'
                      }`}
                    >
                      {checked && <Check className="w-2.5 h-2.5" />}
                    </span>
                    <span>{item}</span>
                  </button>
                );
              })}
            </div>
            {form.helpWith.includes('Other') && (
              <label className="block mt-2 font-medium">
                Describe the specific need *
                <textarea
                  value={form.helpOther}
                  onChange={(e) => set('helpOther', e.target.value)}
                  rows={2}
                  placeholder="What else do they need?"
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <FieldError message={fieldErrors.helpOther} />
              </label>
            )}
          </div>
          <SelectField label="Main objective" required value={form.objective} error={fieldErrors.objective} options={LEAD_OBJECTIVES} onChange={(v) => set('objective', v)} />
          <SelectField label="When to start" required value={form.startTimeline} error={fieldErrors.startTimeline} options={LEAD_START_TIMELINES} onChange={(v) => set('startTimeline', v)} />
          <SelectField
            label="Maximum monthly budget"
            className="col-span-2"
            value={form.budget}
            options={LEAD_BUDGETS}
            blank="Not provided"
            onChange={(v) => set('budget', v)}
          />
          <label className="col-span-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Briefly describe what they need *
            <textarea
              value={form.brief}
              onChange={(e) => set('brief', e.target.value)}
              rows={3}
              placeholder="What they are trying to achieve, and the problem they are facing."
              className="mt-1 w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <FieldError message={fieldErrors.brief} />
          </label>

          <Section title="Internal" />
          <TextField label="City" value={form.city} error={fieldErrors.city} onChange={(v) => set('city', v)} />
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Source
            <div className="mt-1">
              <CustomSelect value={form.source} onChange={(v) => set('source', v)} options={SOURCES} size="sm" />
            </div>
          </div>
          {canAssign && (
            <div className="col-span-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
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
          {error && <p className="col-span-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        <div className="px-5 py-3.5 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8.5 px-3.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-8.5 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create lead
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

function Section({ title }: { title: string }) {
  return (
    <h3 className="col-span-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 pb-1">
      {title}
    </h3>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">{message}</p>;
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
    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
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
    <div className={`text-xs font-medium text-zinc-600 dark:text-zinc-400 ${className}`}>
      {label} {required ? '*' : ''}
      <div className="mt-1">
        <CustomSelect value={value} onChange={onChange} options={asOptions(options, blank)} size="sm" />
      </div>
      <FieldError message={error} />
    </div>
  );
}
