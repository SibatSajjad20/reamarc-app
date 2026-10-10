import React, { useId } from 'react';
import { Clock, X, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './button';

export interface CustomTimePickerProps {
  value: string; // 'HH:MM' (24-hour internally, e.g. '09:30' or '18:30')
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  id?: string;
  error?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  /** Shows an X beside the label to clear the value (optional times). */
  allowClear?: boolean;
  clearTitle?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}

const COMPLETE_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CustomTimePicker: React.FC<CustomTimePickerProps> = ({
  value,
  onChange,
  label,
  id,
  error,
  disabled = false,
  className = '',
  required = false,
  allowClear = false,
  clearTitle = 'Clear time',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}) => {
  const generatedId = useId();
  const timeId = id || (label || error ? generatedId : undefined);
  const errorId = error && timeId ? `${timeId}-error` : undefined;
  const safeValue = COMPLETE_24H.test(value) ? value.slice(0, 5) : '';

  return (
    <div className={cn('text-left w-full', className)}>
      {label && (
        <label htmlFor={timeId} className="block text-label font-medium text-fg mb-1.5 flex items-center gap-1.5">
          <Clock size={14} className="text-fg-muted" />
          <span>{label}</span>
        </label>
      )}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Clock
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
          />
          <input
            id={timeId}
            type="time"
            lang="en-US"
            step={60}
            required={required}
            disabled={disabled}
            value={safeValue}
            onChange={(e) => onChange(e.target.value.slice(0, 5))}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            aria-invalid={Boolean(error) || ariaInvalid === true || ariaInvalid === 'true'}
            aria-describedby={error ? errorId : ariaDescribedby}
            className={cn(
              'time-input w-full h-9 pl-9 pr-3 bg-surface border rounded-md text-ui font-numeric tabular-nums font-normal text-fg focus:outline-none shadow-xs disabled:opacity-50 disabled:cursor-not-allowed',
              error
                ? 'border-danger-dot focus:border-danger-fg'
                : 'border-border-strong hover:border-fg-muted/60 focus:border-border-strong',
              'aria-invalid:border-danger-dot'
            )}
          />
        </div>

        {allowClear && !disabled && (
          <IconButton
            variant="ghost"
            size="sm"
            icon={X}
            label={clearTitle}
            disabled={!safeValue}
            onClick={() => onChange('')}
            className="h-9 w-9 text-fg-muted hover:text-danger-fg"
          />
        )}
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-small text-danger-fg flex items-center gap-1.5 mt-1"
        >
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};
