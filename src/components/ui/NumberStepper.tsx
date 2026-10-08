import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './button';

export interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const NumberStepper: React.FC<NumberStepperProps> = ({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit = '',
  label,
  disabled = false,
  className = '',
}) => {
  const handleDecrement = () => {
    if (disabled) return;
    const next = Math.max(min, Math.round((value - step) * 10) / 10);
    onChange(next);
  };

  const handleIncrement = () => {
    if (disabled) return;
    const next = Math.min(max, Math.round((value + step) * 10) / 10);
    onChange(next);
  };

  return (
    <div className={cn('text-left w-full', className)}>
      {label && (
        <label className="block text-label font-medium text-fg mb-1.5">
          {label}
        </label>
      )}

      <div className="h-9 px-1 flex items-center justify-between rounded-md bg-surface border border-border-strong shadow-xs focus-within:border-ring-border focus-within:ring-3 focus-within:ring-[var(--ring)]">
        <IconButton
          variant="ghost"
          size="sm"
          icon={Minus}
          label="Decrease value"
          disabled={disabled || value <= min}
          onClick={handleDecrement}
          className="h-7 w-7 text-fg-muted hover:text-fg"
        />

        <div className="flex-1 text-center font-numeric tabular-nums font-medium text-ui text-fg px-2 select-none">
          {value} {unit && <span className="font-sans text-small text-fg-muted font-normal ml-0.5">{unit}</span>}
        </div>

        <IconButton
          variant="ghost"
          size="sm"
          icon={Plus}
          label="Increase value"
          disabled={disabled || (max !== undefined && value >= max)}
          onClick={handleIncrement}
          className="h-7 w-7 text-fg-muted hover:text-fg"
        />
      </div>
    </div>
  );
};
