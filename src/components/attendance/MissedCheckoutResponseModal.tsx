import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Calendar,
  UserCheck,
} from 'lucide-react';
import type { MissedPunchInquiry } from '../../types/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { CustomTimePicker } from '../ui/CustomTimePicker';
import { Button } from '../ui/button';
import { Callout } from '../ui/Callout';

interface MissedCheckoutResponseModalProps {
  isOpen: boolean;
  inquiry: MissedPunchInquiry | null;
  onClose: () => void;
  onSuccess: () => void;
}

const QUICK_REASONS = [
  'Forgot to punch out before logging off',
  'Power / internet outage before checkout',
  'System closed shift automatically in morning',
  'Worked overtime and forgot to punch out',
];

export const MissedCheckoutResponseModal: React.FC<MissedCheckoutResponseModalProps> = ({
  isOpen,
  inquiry,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [checkOut, setCheckOut] = useState<string>('04:30');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !inquiry) return;
    setErrorMessage(null);
    setCheckOut('04:30');
    setReason('');
  }, [isOpen, inquiry]);

  if (!isOpen || !inquiry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!checkOut.trim()) {
      setErrorMessage('Please provide a valid check-out time.');
      return;
    }

    if (!reason.trim() || reason.trim().length < 3) {
      setErrorMessage('Please provide a reason explaining why you missed punching out.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await attendanceService.respondToMissedPunchInquiry(inquiry.id, {
        check_out: checkOut.trim(),
        reason: reason.trim(),
      });
      addToast(
        'Checkout recorded',
        res.message || 'Your attendance has been successfully regularized.',
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to submit check-out time.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay animate-in fade-in duration-150">
      <div
        className="w-full max-w-[560px] bg-surface rounded-lg shadow-lg border border-border overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-warning-bg text-warning-fg border border-warning-bd">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-h2 font-semibold text-fg">
                Missed checkout inquiry
              </h3>
              <p className="text-small text-fg-muted">
                Provide your check-out time to regularize this shift
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-md text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {errorMessage && (
            <Callout variant="danger">
              {errorMessage}
            </Callout>
          )}

          {/* Shift Details Banner */}
          <div className="p-3.5 bg-subtle rounded-md border border-border space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-fg-muted flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-fg-muted" />
                Date:
              </span>
              <span className="font-semibold text-fg font-numeric">
                {inquiry.date}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-fg-muted flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-fg-muted" />
                Assigned shift:
              </span>
              <span className="font-medium text-fg">
                {inquiry.shift_name || 'Standard shift'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-fg-muted flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-success-fg" />
                Punch in recorded:
              </span>
              <span className="font-semibold text-success-fg font-numeric">
                {inquiry.punch_in || 'Recorded'}
              </span>
            </div>

            {inquiry.requested_by_name && (
              <div className="pt-2 border-t border-border text-micro text-fg-muted flex items-center justify-between">
                <span>Requested by:</span>
                <span className="font-medium text-fg">
                  {inquiry.requested_by_name}
                </span>
              </div>
            )}
          </div>

          {/* Input: Checkout Time */}
          <div>
            <label className="block text-label font-medium text-fg mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-fg-muted" />
                <span>What time did you finish / check out? *</span>
              </span>
            </label>
            <CustomTimePicker
              value={checkOut}
              onChange={(val) => setCheckOut(val)}
              placeholder="e.g. 04:30 AM"
            />
          </div>

          {/* Quick reasons */}
          <div>
            <span className="block text-small font-medium text-fg-muted mb-1.5">
              Quick suggestions:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  onClick={() => setReason(qr)}
                  className="text-micro px-2 py-1 rounded-md border border-border bg-surface hover:bg-hover text-fg-2 transition-colors cursor-pointer"
                >
                  {qr}
                </button>
              ))}
            </div>
          </div>

          {/* Input: Reason */}
          <div>
            <label className="block text-label font-medium text-fg mb-1.5 flex items-center justify-between">
              <span>Reason for missed checkout *</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Briefly explain why you missed punching out..."
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border-strong rounded-md text-xs text-fg placeholder:text-fg-faint focus-visible:focus-ring"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
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
              variant="primary"
              loading={isSubmitting}
            >
              Submit checkout
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
