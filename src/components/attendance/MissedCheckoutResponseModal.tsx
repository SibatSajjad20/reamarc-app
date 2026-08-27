import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileText,
  UserCheck,
} from 'lucide-react';
import type { MissedPunchInquiry } from '../../types/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { CustomTimePicker } from '../ui/CustomTimePicker';

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
        'Checkout Recorded',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white dark:bg-[#11131a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Missed Checkout Inquiry
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Provide your check-out time to regularize this shift
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Shift Details Banner */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                Date:
              </span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                {inquiry.date}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                Assigned Shift:
              </span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {inquiry.shift_name || 'Standard Shift'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                Punch In Recorded:
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                {inquiry.punch_in || 'Recorded'}
              </span>
            </div>

            {inquiry.requested_by_name && (
              <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80 text-[11px] text-zinc-500 flex items-center justify-between">
                <span>Requested by:</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {inquiry.requested_by_name}
                </span>
              </div>
            )}
          </div>

          {/* Input: Checkout Time */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>What time did you finish / check out? *</span>
              </span>
            </label>
            <CustomTimePicker
              value={checkOut}
              onChange={(val) => setCheckOut(val)}
              placeholder="e.g. 04:30 AM"
            />
          </div>

          {/* Input: Reason */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                <span>Reason for Missed Checkout *</span>
              </span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Briefly explain why you forgot to punch out..."
              rows={3}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />

            {/* Quick Reason Pills */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-400 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 transition-all cursor-pointer disabled:cursor-not-allowed select-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Submitting Checkout...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Submit Checkout & Regularize</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
