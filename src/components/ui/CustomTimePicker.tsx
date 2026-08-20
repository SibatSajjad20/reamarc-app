import React from 'react';
import { Clock } from 'lucide-react';

interface CustomTimePickerProps {
  value: string; // 'HH:MM' (24-hour internally, e.g. '09:30' or '18:30')
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
}

const COMPLETE_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CustomTimePicker: React.FC<CustomTimePickerProps> = ({
  value,
  onChange,
  label,
  disabled = false,
  className = '',
  required = false,
}) => {
  const safeValue = COMPLETE_24H.test(value) ? value.slice(0, 5) : '';

  return (
    <div className={`text-left ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          <span>{label}</span>
        </label>
      )}
      <input
        type="time"
        lang="en-US"
        step={60}
        required={required}
        disabled={disabled}
        value={safeValue}
        onChange={(e) => onChange(e.target.value.slice(0, 5))}
        className="time-input w-full h-10 px-3 bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </div>
  );
};
