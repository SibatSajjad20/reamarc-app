import React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FormErrorSummaryButton } from '../../hooks/useFormValidation';
import { Popover, PopoverTrigger, PopoverContent } from './popover';

export interface FormFooterProps {
  errorCount?: number;
  count?: number;
  onFocusFirst?: () => void;
  serverError?: React.ReactNode;
  uploading?: boolean | string;
  className?: string;
  children?: React.ReactNode;
}

export const FormFooter: React.FC<FormFooterProps> = ({
  errorCount = 0,
  count,
  onFocusFirst,
  serverError,
  uploading = false,
  className,
  children,
}) => {
  const totalErrors = count ?? errorCount ?? 0;
  const isStringError = typeof serverError === 'string';

  return (
    <div
      className={cn(
        'shrink-0 px-6 py-3 bg-surface border-t border-border flex items-center justify-between gap-3',
        className
      )}
    >
      {/* Left side: single line, no wrapping */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 whitespace-nowrap overflow-hidden">
        {totalErrors >= 2 && (
          <FormErrorSummaryButton
            count={totalErrors}
            onClick={onFocusFirst}
            className="shrink-0"
          />
        )}

        {serverError && (
          <div
            role="alert"
            className="text-small text-danger-fg flex items-center gap-1.5 font-medium min-w-0 max-w-[40ch] shrink-0"
          >
            <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{serverError}</span>
            {isStringError && serverError.length > 25 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="View server error details"
                    className="p-0.5 rounded text-danger-fg hover:bg-danger-bg shrink-0 cursor-pointer"
                  >
                    <Info size={13} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 text-xs p-3 text-fg break-words" align="start">
                  <div className="font-semibold text-danger-fg mb-1 flex items-center gap-1.5">
                    <AlertCircle size={14} /> Server Error
                  </div>
                  <div className="text-fg-muted leading-relaxed whitespace-pre-wrap">{serverError}</div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}

        {uploading && (
          <span className="text-small text-fg-muted truncate shrink-0" aria-live="polite">
            {typeof uploading === 'string' ? uploading : 'Wait for upload to finish'}
          </span>
        )}
      </div>

      {/* Right side: action buttons */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">{children}</div>
    </div>
  );
};
