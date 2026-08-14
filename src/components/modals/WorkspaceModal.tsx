import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Building2, Palette, Sparkles, Briefcase, Layers } from 'lucide-react';
import type { Workspace } from '../../types';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; initials?: string; brandColor?: string; industry?: string; platform?: string }) => Promise<void>;
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
  const [platform, setPlatform] = useState('Meta Ads');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lock body scroll when modal is open
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

  useEffect(() => {
    if (workspaceToEdit) {
      setName(workspaceToEdit.name || '');
      setInitials(workspaceToEdit.initials || '');
      setBrandColor(workspaceToEdit.brandColor || 'bg-indigo-600');
      setIndustry(workspaceToEdit.industry || 'General B2B');
      const nameLower = (workspaceToEdit.name || '').toLowerCase();
      const isMulti =
        (workspaceToEdit.platform && workspaceToEdit.platform.toLowerCase().includes('google')) ||
        nameLower.includes('ed&c') ||
        nameLower.includes('ednc') ||
        nameLower.includes('elegant design');
      setPlatform(isMulti ? 'Meta & Google' : workspaceToEdit.platform || 'Meta Ads');
    } else {
      setName('');
      setInitials('');
      setBrandColor('bg-indigo-600');
      setIndustry('General B2B');
      setPlatform('Meta Ads');
    }
  }, [workspaceToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        initials: initials.trim() ? initials.trim().toUpperCase() : name.trim().slice(0, 2).toUpperCase(),
        brandColor,
        industry: industry.trim() || 'General B2B',
        platform,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save ad account:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center w-screen h-screen bg-black/60 backdrop-blur-xs animate-fadeIn p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {workspaceToEdit ? 'Edit Ad Account' : 'Connect New Ad Account'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Manage client ad account profile and branding settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Ad Account / Brand Name</label>
            <input
              type="text"
              placeholder="e.g. Apex Transfer, Elegant Design, Brand XYZ"
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-indigo-500" /> Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="Meta Ads">Meta Ads</option>
                <option value="Google Ads">Google Ads</option>
                <option value="Meta & Google">Meta & Google</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-indigo-500" /> Industry
              </label>
              <input
                type="text"
                placeholder="E-Commerce, B2B..."
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors"
                autoComplete="off"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Badge Initials</label>
            <input
              type="text"
              maxLength={4}
              placeholder="e.g. AT"
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase())}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-colors uppercase font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-indigo-500" /> Brand Avatar Color
            </label>
            <div className="flex items-center gap-3">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setBrandColor(c.value)}
                  className={`w-7 h-7 rounded-full ${c.value} border-2 transition-all cursor-pointer ${
                    brandColor === c.value
                      ? 'border-indigo-500 scale-110 shadow-md shadow-indigo-500/30 ring-2 ring-indigo-500/20'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
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
                  <Sparkles className="w-3.5 h-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>{workspaceToEdit ? 'Save Changes' : 'Connect Ad Account'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export const EditAdAccountModal = WorkspaceModal;
