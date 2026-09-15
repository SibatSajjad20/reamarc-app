import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, X } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import type { CrmAssignee, CrmLeadCreatePayload } from '../../types/crm';

const SOURCES = ['manual', 'website', 'referral', 'meta', 'google', 'other'].map((v) => ({
  value: v,
  label: v.charAt(0).toUpperCase() + v.slice(1),
}));

const SERVICES = [
  { value: '', label: '—' },
  { value: 'Branding', label: 'Branding' },
  { value: 'Website', label: 'Website' },
  { value: 'Performance Marketing', label: 'Performance Marketing' },
  { value: 'Social Media', label: 'Social Media' },
  { value: 'SEO', label: 'SEO' },
  { value: 'Other', label: 'Other' },
];

interface CrmCreateLeadModalProps {
  isOpen: boolean;
  assignees: CrmAssignee[];
  canAssign: boolean;
  onClose: () => void;
  onSubmit: (payload: CrmLeadCreatePayload) => Promise<void>;
}

export const CrmCreateLeadModal: React.FC<CrmCreateLeadModalProps> = ({
  isOpen,
  assignees,
  canAssign,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [service, setService] = useState('');
  const [source, setSource] = useState('manual');
  const [assignedTo, setAssignedTo] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setPhone('');
    setEmail('');
    setCompany('');
    setWebsite('');
    setCity('');
    setService('');
    setSource('manual');
    setAssignedTo('');
    setNote('');
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        website: website.trim() || undefined,
        city: city.trim() || undefined,
        service: service || undefined,
        source,
        note: note.trim() || undefined,
        assigned_to: assignedTo || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not create lead.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#11131a] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Create new lead</h2>
            <p className="text-xs text-zinc-500">Add an inbound prospect manually into the CRM pipeline.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3.5">
          <label className="col-span-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Full Name *
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="e.g. Sarah Jenkins"
              required
            />
          </label>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0300 1234567"
              className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-numeric focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sarah@company.com"
              className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Company
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company or Brand Name"
              className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Website
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://company.com"
              className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            City
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Lahore / Karachi"
              className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </label>
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Source
            <div className="mt-1">
              <CustomSelect value={source} onChange={setSource} options={SOURCES} size="sm" />
            </div>
          </div>
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Service
            <div className="mt-1">
              <CustomSelect value={service} onChange={setService} options={SERVICES} size="sm" />
            </div>
          </div>
          {canAssign && (
            <div className="col-span-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Assign to Owner
              <div className="mt-1">
                <CustomSelect
                  value={assignedTo}
                  onChange={setAssignedTo}
                  options={[{ value: '', label: 'Unassigned (Claim pool)' }, ...assignees.map((a) => ({ value: a.id, label: a.full_name }))]}
                  size="sm"
                />
              </div>
            </div>
          )}
          <label className="col-span-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Initial Note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Context or notes about this lead..."
              className="mt-1 w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed font-sans"
            />
          </label>
          {error && <p className="col-span-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
        <div className="px-5 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20 flex justify-end gap-2">
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
            className="h-8.5 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 transition shadow-xs"
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
