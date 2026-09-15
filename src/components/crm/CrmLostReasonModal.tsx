import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';

export const LEAD_LOST_REASON_OPTIONS = [
  { value: 'budget', label: 'Budget / Price' },
  { value: 'timing', label: 'Timing / Not ready' },
  { value: 'competitor', label: 'Chose competitor' },
  { value: 'no_response', label: 'No response' },
  { value: 'not_a_fit', label: 'Not a fit' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'other', label: 'Other' },
];

export const DEAL_LOST_REASON_OPTIONS = [
  { value: 'budget', label: 'Budget / Price' },
  { value: 'timing', label: 'Timing / Not ready' },
  { value: 'competitor', label: 'Chose competitor' },
  { value: 'no_response', label: 'No response' },
  { value: 'not_a_fit', label: 'Not a fit' },
  { value: 'scope_mismatch', label: 'Scope mismatch' },
  { value: 'other', label: 'Other' },
];

interface CrmLostReasonModalProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  options?: { value: string; label: string }[];
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (reason: string, note?: string) => Promise<void> | void;
}

export const CrmLostReasonModal: React.FC<CrmLostReasonModalProps> = ({
  isOpen,
  title = 'Mark as Lost',
  subtitle = 'Select a reason so the team can learn from this outcome.',
  options = DEAL_LOST_REASON_OPTIONS,
  isSubmitting = false,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState(options[0]?.value || 'other');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      setError('Please select a reason.');
      return;
    }
    setError(null);
    try {
      await onConfirm(reason, note.trim() || undefined);
      setNote('');
    } catch (err: any) {
      setError(err?.message || 'Could not save. Try again.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
              <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
              Reason *
            </label>
            <CustomSelect value={reason} onChange={setReason} options={options} />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
              Additional notes (optional)
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Context that will help the team improve conversion…"
              className="w-full text-xs p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 resize-none focus:ring-2 focus:ring-rose-500/30 outline-hidden"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Confirm Lost
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
