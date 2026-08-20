import React, { useState, useRef, useEffect } from 'react';
import { Clock, ChevronDown } from 'lucide-react';

interface CustomTimePickerProps {
  value: string; // 'HH:MM' (24-hour format e.g. '09:30' or '18:30')
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const COMMON_PRESETS = [
  '09:00', '09:30', '10:00', '10:15', '10:30',
  '13:00', '14:00', '17:00', '18:00', '18:30', '19:00', '20:00'
];

export const CustomTimePicker: React.FC<CustomTimePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select time...',
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current HH and MM
  const [currentH, currentM] = (value || '09:30').split(':').map((v) => v || '00');
  const [selectedH, setSelectedH] = useState(currentH.padStart(2, '0'));
  const [selectedM, setSelectedM] = useState(currentM.padStart(2, '0'));

  useEffect(() => {
    if (value && value.includes(':')) {
      const [h, m] = value.split(':');
      setSelectedH(h.padStart(2, '0'));
      setSelectedM(m.padStart(2, '0'));
    }
  }, [value]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const handleSelectTime = (h: string, m: string) => {
    setSelectedH(h);
    setSelectedM(m);
    onChange(`${h}:${m}`);
    setIsOpen(false);
  };

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down');

  const handleToggle = () => {
    if (!disabled) {
      if (!isOpen && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        if (spaceBelow < 260 && spaceAbove > 200) {
          setOpenDirection('up');
        } else {
          setOpenDirection('down');
        }
      }
      setIsOpen((prev) => !prev);
    }
  };

  return (
    <div className={`relative text-left ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          <span>{label}</span>
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all shadow-2xs cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed ${
          isOpen ? 'ring-2 ring-indigo-500/20 border-indigo-500 dark:border-indigo-500' : ''
        }`}
      >
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          <span>{value || placeholder}</span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className={`absolute left-0 ${openDirection === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} z-[100] w-64 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-3 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 space-y-3`}>
          {/* Preset Buttons */}
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
              Quick Timings
            </span>
            <div className="grid grid-cols-4 gap-1">
              {COMMON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    const [h, m] = preset.split(':');
                    handleSelectTime(h, m);
                  }}
                  className={`px-1.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer ${
                    value === preset
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Hour & Minute Pickers */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
              Custom Time (HH:MM)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-zinc-400 block mb-1">Hour</span>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 p-1 space-y-0.5 bg-zinc-50 dark:bg-zinc-900/50">
                  {hours.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleSelectTime(h, selectedM)}
                      className={`w-full text-center py-1 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                        selectedH === h
                          ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-extrabold'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-zinc-400 block mb-1">Minute</span>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 p-1 space-y-0.5 bg-zinc-50 dark:bg-zinc-900/50">
                  {minutes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSelectTime(selectedH, m)}
                      className={`w-full text-center py-1 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                        selectedM === m
                          ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-extrabold'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
