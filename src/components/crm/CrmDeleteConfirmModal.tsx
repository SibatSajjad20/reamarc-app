import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';

interface CrmDeleteConfirmModalProps {
  isOpen: boolean;
  leadName: string;
  isDeleting: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export const CrmDeleteConfirmModal: React.FC<CrmDeleteConfirmModalProps> = ({
  isOpen,
  leadName,
  isDeleting,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#11131a] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200/60 dark:border-rose-900/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4">
            <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50">Delete Lead</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
              Are you sure you want to delete <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">{leadName}</strong>? All associated deals, commercial details, and activity history will be permanently removed.
            </p>
            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-2.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>This action cannot be undone.</span>
            </p>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-zinc-50/70 dark:bg-zinc-900/40 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Lead</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
