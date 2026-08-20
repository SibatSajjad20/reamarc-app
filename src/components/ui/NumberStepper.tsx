import React from 'react';
import { Plus, Minus } from 'lucide-react';

interface NumberStepperProps {
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
    <div className={`text-left ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
          {label}
        </label>
      )}

      <div className="flex items-center rounded-xl bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-2xs">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={handleDecrement}
          className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1 text-center font-mono font-bold text-xs text-zinc-900 dark:text-zinc-100 px-2 select-none">
          {value} {unit && <span className="font-sans text-[11px] font-normal text-zinc-400">{unit}</span>}
        </div>

        <button
          type="button"
          disabled={disabled || (max !== undefined && value >= max)}
          onClick={handleIncrement}
          className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
