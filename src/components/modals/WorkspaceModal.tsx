import React, { useState, useEffect } from 'react';
import { X, Building2, Palette, Sparkles, Briefcase } from 'lucide-react';
import type { Workspace } from '../../types';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; initials?: string; brandColor?: string; industry?: string }) => Promise<void>;
  workspaceToEdit?: Workspace | null;
}

const BRAND_COLORS = [
  { name: 'Indigo', value: 'bg-indigo-600' },
  { name: 'Amber', value: 'bg-amber-500' },
  { name: 'Emerald', value: 'bg-emerald-500' },
  { name: 'Purple', value: 'bg-purple-600' },
  { name: 'Rose', value: 'bg-rose-500' },
  { name: 'Cyan', value: 'bg-cyan-500' },
];

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  workspaceToEdit,
}) => {
  const [name, setName] = useState('');
  const [initials, setInitials] = useState('');
  const [brandColor, setBrandColor] = useState('bg-indigo-600');
  const [industry, setIndustry] = useState('General B2B');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (workspaceToEdit) {
      setName(workspaceToEdit.name || '');
      setInitials(workspaceToEdit.initials || '');
      setBrandColor(workspaceToEdit.brandColor || 'bg-indigo-600');
      setIndustry(workspaceToEdit.industry || 'General B2B');
    } else {
      setName('');
      setInitials('');
      setBrandColor('bg-indigo-600');
      setIndustry('General B2B');
    }
  }, [workspaceToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        name,
        initials: initials.trim() ? initials.trim().toUpperCase() : name.trim().slice(0, 2).toUpperCase(),
        brandColor,
        industry,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save workspace:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">
                {workspaceToEdit ? 'Edit Brand Workspace' : 'Create New Brand Workspace'}
              </h2>
              <p className="text-xs text-zinc-400">Isolate campaigns & knowledge base per brand</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Brand Name</label>
            <input
              type="text"
              placeholder="e.g. Acme Corp or Nova Residences"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!workspaceToEdit && e.target.value.length >= 2) {
                  setInitials(e.target.value.slice(0, 2).toUpperCase());
                }
              }}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Badge Initials</label>
              <input
                type="text"
                maxLength={3}
                placeholder="AC"
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase())}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors uppercase font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Industry / Niche</label>
              <div className="relative">
                <Briefcase className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="SaaS, Real Estate..."
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-indigo-400" /> Brand Accent Color
            </label>
            <div className="flex items-center gap-3">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setBrandColor(c.value)}
                  className={`w-8 h-8 rounded-full ${c.value} border-2 transition-all ${
                    brandColor === c.value
                      ? 'border-white scale-110 shadow-lg shadow-indigo-500/20'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                <>{workspaceToEdit ? 'Save Changes' : 'Create Workspace'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
