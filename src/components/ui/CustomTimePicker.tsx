import React from 'react';
import { Clock, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './button';

export interface CustomTimePickerProps {
  value: string; // 'HH:MM' (24-hour internally, e.g. '09:30' or '18:30')
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  /** Shows an X beside the label to clear the value (optional times). */
  allowClear?: boolean;
  clearTitle?: string;
}

const COMPLETE_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CustomTimePicker: React.FC<CustomTimePickerProps> = ({
  value,
  onChange,
  label,
  disabled = false,
  className = '',
  required = false,
  allowClear = false,
  clearTitle = 'Clear time',
}) => {
  const safeValue = COMPLETE_24H.test(value) ? value.slice(0, 5) : '';

  return (
    <div className={cn('text-left w-full', className)}>
      {label && (
        <label className="block text-label font-medium text-fg mb-1.5 flex items-center gap-1.5">
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
            type="time"
            lang="en-US"
            step={60}
            required={required}
            disabled={disabled}
            value={safeValue}
            onChange={(e) => onChange(e.target.value.slice(0, 5))}
            className="time-input w-full h-9 pl-9 pr-3 bg-surface border border-border-strong rounded-md text-ui font-numeric tabular-nums font-normal text-fg hover:border-fg-muted/60 focus:border-border-strong focus:outline-none shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
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
    </div>
  );
};
