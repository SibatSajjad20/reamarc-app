import React from 'react';

interface ToggleSwitchProps {
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
  return (
    <label
      className={`flex items-start justify-between gap-3 cursor-pointer select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <span className="block text-xs font-bold text-zinc-900 dark:text-zinc-100">
              {label}
            </span>
          )}
          {description && (
            <span className="block text-[11px] text-zinc-400 mt-0.5 leading-tight">
              {description}
            </span>
          )}
        </div>
      )}

      <div className="relative inline-flex items-center shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.value !== undefined ? e.target.checked : !checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-zinc-200 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
      </div>
    </label>
  );
};
