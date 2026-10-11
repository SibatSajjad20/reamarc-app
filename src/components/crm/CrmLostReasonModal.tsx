import React, { useState } from 'react';
import { TriangleAlert, AlertCircle } from 'lucide-react';
import { FormDialog, FormDialogHeader, FormDialogBody } from '../ui/FormDialogLayout';
import { FormFooter } from '../ui/FormFooter';
import { Button } from '../ui/button';

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
  title = 'Mark as lost',
  subtitle = 'Select a reason so the team can learn from this outcome.',
  options = DEAL_LOST_REASON_OPTIONS,
  isSubmitting = false,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState(options[0]?.value || 'other');
  const [note, setNote] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReasonError(null);
    setServerError(null);
    if (!reason) {
      setReasonError('Please select a reason.');
      return;
    }
    try {
      await onConfirm(reason, note.trim() || undefined);
      setNote('');
    } catch (err: any) {
      setServerError(err?.message || 'Could not save. Try again.');
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={isSubmitting ? undefined : onClose}
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
        <FormDialogHeader>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-danger-bg flex items-center justify-center text-danger-fg shrink-0">
              <TriangleAlert size={18} />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h2 className="text-h2 font-semibold text-fg">
                {title}
              </h2>
              <p className="text-body text-fg-muted mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>
        </FormDialogHeader>

        <FormDialogBody className="space-y-3.5">
          <div>
            <label className="text-small font-medium text-fg block mb-2">
              Reason *
            </label>
            <div className="space-y-1.5" role="radiogroup" aria-label="Lost reasons">
              {options.map((opt) => {
                const selected = reason === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setReason(opt.value);
                      setReasonError(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      selected
                        ? 'border-accent bg-accent-soft text-fg font-medium'
                        : 'border-border bg-surface text-fg-muted hover:bg-hover hover:text-fg'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        selected
                          ? 'border-accent bg-accent'
                          : 'border-border-strong bg-transparent'
                      }`}
                    >
                      {selected && <span className="w-1.5 h-1.5 rounded-full bg-accent-fg" />}
                    </span>
                  </button>
                );
              })}
            </div>
            {reasonError && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-danger-fg" role="alert">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{reasonError}</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-small font-medium text-fg block mb-1">
              Additional notes (optional)
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Context that will help the team improve conversion…"
              className="w-full text-xs p-2.5 rounded-md border border-border bg-subtle/50 text-fg placeholder:text-fg-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </FormDialogBody>

        <FormFooter serverError={serverError}>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={isSubmitting}
            loading={isSubmitting}
            loadingText="Saving…"
          >
            Confirm lost
          </Button>
        </FormFooter>
      </form>
    </FormDialog>
  );
};
