import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface FormFooterProps {
  errorCount?: number;
  onFocusFirst?: () => void;
  serverError?: React.ReactNode;
  uploading?: boolean | string;
  className?: string;
  children?: React.ReactNode;
}

export const FormFooter: React.FC<FormFooterProps> = ({
  errorCount = 0,
  onFocusFirst,
  serverError,
  uploading = false,
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-5 -mb-5 px-5 py-3 bg-surface border-t border-border flex items-center justify-between gap-3',
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1 whitespace-nowrap overflow-hidden">
        {errorCount >= 2 && (
          <button
            type="button"
            onClick={onFocusFirst}
            aria-live="polite"
            className="text-small text-danger-fg hover:underline cursor-pointer flex items-center gap-1.5 font-medium shrink-0 truncate"
          >
            <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{errorCount} fields need attention</span>
          </button>
        )}

        {serverError && (
          <div
            role="alert"
            className="text-small text-danger-fg flex items-center gap-1.5 font-medium min-w-0 truncate"
          >
            <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{serverError}</span>
          </div>
        )}

        {uploading && (
          <span className="text-small text-fg-muted truncate" aria-live="polite">
            {typeof uploading === 'string' ? uploading : 'Wait for upload to finish'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto">{children}</div>
    </div>
  );
};
