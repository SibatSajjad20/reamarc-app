import React, { useId } from 'react';
import { cn } from '../../lib/utils';
import { Switch } from './switch';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}) => {
  const id = useId();

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 select-none',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {(label || description) && (
        <label htmlFor={id} className="flex-1 cursor-pointer">
          {label && (
            <span className="block text-ui font-medium text-fg">
              {label}
            </span>
          )}
          {description && (
            <span className="block text-small text-fg-muted mt-0.5 leading-normal">
              {description}
            </span>
          )}
        </label>
      )}

      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
};
