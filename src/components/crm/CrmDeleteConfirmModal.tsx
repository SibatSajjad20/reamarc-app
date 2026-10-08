import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';

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
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      cancelBtnRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-overlay,50)] bg-overlay flex items-center justify-center p-4 animate-in fade-in-0 duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="crm-delete-title"
        aria-describedby="crm-delete-description"
        className="w-full max-w-[400px] bg-surface border border-border rounded-lg shadow-lg p-6 duration-200 animate-in fade-in-0 zoom-in-95 outline-none space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-danger-bg flex items-center justify-center text-danger-fg shrink-0">
            <TriangleAlert size={20} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 id="crm-delete-title" className="text-h2 font-semibold text-fg tracking-tight">
              Delete {leadName || 'lead'}?
            </h2>
            <p id="crm-delete-description" className="text-body text-fg-muted mt-1 leading-normal">
              All associated deals, commercial details, and activity history will be removed. This can't be undone.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            ref={cancelBtnRef}
            variant="secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                Deleting…
              </>
            ) : (
              'Delete lead'
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
