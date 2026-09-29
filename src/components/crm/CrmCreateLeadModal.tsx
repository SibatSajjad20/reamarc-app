import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, X } from 'lucide-react';
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
  objective: '',
  startTimeline: '',
  budget: '',
  brief: '',
  city: '',
  source: 'manual',
  assignedTo: '',
};

function validate(form: FormState): string | null {
  if (!form.name.trim()) return 'Full name is required.';
  if (!form.company.trim()) return 'Company is required.';
  if (!form.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
    return 'A valid work email is required.';
  }
  if (!form.phone.trim()) return 'WhatsApp / phone is required.';
  if (!form.noWebsite && !form.website.trim()) return 'Website is required, or mark that there is no website.';
  if (!form.role) return 'Role is required.';
  if (!form.industry) return 'Business type is required.';
  if (!form.businessStage) return 'Business stage is required.';
  if (!form.employeeCount) return 'Employee count is required.';
  if (!form.salesTeam) return 'Sales team is required.';
  if (form.helpWith.length === 0) return 'Select at least one thing they need help with.';
  if (!form.objective) return 'Main objective is required.';
  if (!form.startTimeline) return 'Start timeline is required.';
  if (!form.brief.trim()) return 'A short description of the need is required.';
  return null;
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

  useEffect(() => {
    if (!isOpen) return;
    setForm(EMPTY);
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleHelp = (value: string) => {
    setForm((prev) => ({
      ...prev,
      helpWith: prev.helpWith.includes(value)
        ? prev.helpWith.filter((item) => item !== value)
        : [...prev.helpWith, value],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) {
      setError(problem);
      return;
    }
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
          <TextField label="Full name" required value={form.name} onChange={(v) => set('name', v)} />
          <TextField label="Company" required value={form.company} onChange={(v) => set('company', v)} />
          <TextField label="Work email" required type="email" value={form.email} onChange={(v) => set('email', v)} />
          <TextField label="WhatsApp / phone" required value={form.phone} onChange={(v) => set('phone', v)} />
          <label className="col-span-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Website {form.noWebsite ? '' : '*'}
            <input
              value={form.website}
              disabled={form.noWebsite}
              onChange={(e) => set('website', e.target.value)}
              placeholder="https://company.com"
              className={`${inputClass} disabled:opacity-50`}
            />
          </label>
          <label className="col-span-2 -mt-1 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={form.noWebsite}
              onChange={(e) => {
                setForm((prev) => ({
                  ...prev,
                  noWebsite: e.target.checked,
                  website: e.target.checked ? '' : prev.website,
                }));
              }}
              className="w-3.5 h-3.5 rounded border-zinc-300"
            />
            No website
          </label>

          <Section title="Business" />
          <SelectField label="Role" required value={form.role} options={LEAD_ROLES} onChange={(v) => set('role', v)} />
          <SelectField label="What the business does" required value={form.industry} options={LEAD_INDUSTRIES} onChange={(v) => set('industry', v)} />
          <SelectField label="Business stage" required value={form.businessStage} options={LEAD_BUSINESS_STAGES} onChange={(v) => set('businessStage', v)} />
          <SelectField label="Employees" required value={form.employeeCount} options={LEAD_EMPLOYEE_COUNTS} onChange={(v) => set('employeeCount', v)} />
          <SelectField label="Sales team" required className="col-span-2" value={form.salesTeam} options={LEAD_SALES_TEAMS} onChange={(v) => set('salesTeam', v)} />

          <Section title="Need" />
          <div className="col-span-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            What do you need help with? *
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {LEAD_HELP_WITH.map((item) => (
                <label key={item} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-normal text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.helpWith.includes(item)}
                    onChange={() => toggleHelp(item)}
                    className="w-3.5 h-3.5 rounded border-zinc-300"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>
          <SelectField label="Main objective" required value={form.objective} options={LEAD_OBJECTIVES} onChange={(v) => set('objective', v)} />
          <SelectField label="When to start" required value={form.startTimeline} options={LEAD_START_TIMELINES} onChange={(v) => set('startTimeline', v)} />
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
          </label>

          <Section title="Internal" />
          <TextField label="City" value={form.city} onChange={(v) => set('city', v)} />
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

function TextField({
  label,
  value,
  onChange,
  required,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
      {label} {required ? '*' : ''}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
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
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  blank?: string;
  className?: string;
}) {
  return (
    <div className={`text-xs font-medium text-zinc-600 dark:text-zinc-400 ${className}`}>
      {label} {required ? '*' : ''}
      <div className="mt-1">
        <CustomSelect value={value} onChange={onChange} options={asOptions(options, blank)} size="sm" />
      </div>
    </div>
  );
}
