import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useOffDays } from '../../hooks/useOffDays';

interface CustomDatePickerProps {
  value?: string; // ISO date string 'YYYY-MM-DD'
  onChange: (isoDate: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  align?: 'left' | 'right';
  className?: string;
  clearable?: boolean;
  /** disable = cannot pick off days (logging). mark = still selectable, styled as holiday (viewing / appeals). */
  offDayMode?: 'none' | 'disable' | 'mark';
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const formatIso = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseIso = (isoStr?: string): Date => {
  if (!isoStr) return new Date();
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const formatDisplayDate = (isoStr?: string): string => {
  if (!isoStr) return '';
  try {
    const [y, m, d] = isoStr.split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
};

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select date...',
  disabled = false,
  minDate,
  maxDate,
  align = 'left',
  className = '',
  clearable = true,
  offDayMode = 'none',
}) => {
  const { getOffDay } = useOffDays();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down');
  const [horizontalAlign, setHorizontalAlign] = useState<'left' | 'right'>(align);

  const handleToggle = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Smart vertical flip: if space below < 340px and space above is larger, flip upward
      if (spaceBelow < 340 && spaceAbove > 280) {
        setOpenDirection('up');
      } else {
        setOpenDirection('down');
      }

      // Smart horizontal alignment: check right boundary
      const spaceRight = window.innerWidth - rect.left;
      if (spaceRight < 300 || align === 'right') {
        setHorizontalAlign('right');
      } else {
        setHorizontalAlign('left');
      }
    }
    setIsOpen(!isOpen);
  };

  // Month navigation view state
  const initialDateObj = parseIso(value);
  const [viewYear, setViewYear] = useState<number>(initialDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDateObj.getMonth()); // 0-11

  // Update view when value changes externally
  useEffect(() => {
    if (value) {
      const d = parseIso(value);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const todayIso = useMemo(() => formatIso(new Date()), []);

  // Calendar calculations
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sun, 1 is Mon
    const offset = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Convert so Mon=0, Sun=6
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const days: { dayNumber: number; iso: string; isCurrentMonth: boolean; isDisabled: boolean; offLabel?: string }[] = [];

    const describe = (iso: string) => {
      const off = offDayMode !== 'none' ? getOffDay(iso) : { isOff: false, label: '' };
      const rangeBlocked = Boolean((minDate && iso < minDate) || (maxDate && iso > maxDate));
      const offBlocked = Boolean(offDayMode === 'disable' && off.isOff);
      return {
        isDisabled: rangeBlocked || offBlocked,
        offLabel: off.isOff ? off.label : undefined,
      };
    };

    // Preceding month padding
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = offset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevDate = new Date(viewYear, viewMonth - 1, d);
      const iso = formatIso(prevDate);
      const meta = describe(iso);
      days.push({
        dayNumber: d,
        iso,
        isCurrentMonth: false,
        ...meta,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(viewYear, viewMonth, d);
      const iso = formatIso(curDate);
      const meta = describe(iso);
      days.push({
        dayNumber: d,
        iso,
        isCurrentMonth: true,
        ...meta,
      });
    }

    // Trailing padding to fill complete grid of 35 or 42
    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(viewYear, viewMonth + 1, d);
      const iso = formatIso(nextDate);
      const meta = describe(iso);
      days.push({
        dayNumber: d,
        iso,
        isCurrentMonth: false,
        ...meta,
      });
    }

    return days;
  }, [viewYear, viewMonth, minDate, maxDate, offDayMode, getOffDay]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDate = (iso: string, isDisabled: boolean) => {
    if (isDisabled) return;
    onChange(iso);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const handleSelectToday = () => {
    if (offDayMode === 'disable' && getOffDay(todayIso).isOff) return;
    onChange(todayIso);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5 text-indigo-500" />
          <span>{label}</span>
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full h-10 flex items-center justify-between px-3.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none bg-zinc-50 dark:bg-zinc-900 ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white dark:bg-zinc-900'
            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CalendarIcon className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className={`truncate font-numeric ${value ? 'text-zinc-900 dark:text-zinc-100 font-bold' : 'text-zinc-400 font-normal'}`}>
            {value ? formatDisplayDate(value) : placeholder}
          </span>
        </div>

        {value && !disabled && clearable ? (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition"
            title="Clear date"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Popover Calendar Dropdown */}
      {isOpen && (
        <div
          className={`absolute ${openDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} z-[100] w-72 sm:w-80 p-3.5 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl animate-scaleIn select-none ${
            horizontalAlign === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Navigation */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800/80">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              {MONTH_NAMES[viewMonth]} <span className="font-numeric">{viewYear}</span>
            </h4>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition"
                title="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition"
                title="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAY_NAMES.map((wd) => (
              <span key={wd} className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 py-1">
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const isSelected = day.iso === value;
              const isToday = day.iso === todayIso;
              const isSelectablePast = !day.isDisabled && !isToday && !isSelected && day.iso < todayIso;
              const isOffMarked = Boolean(day.offLabel) && !day.isDisabled;

              return (
                <button
                  key={day.iso}
                  type="button"
                  disabled={day.isDisabled}
                  onClick={() => handleSelectDate(day.iso, day.isDisabled)}
                  title={
                    day.offLabel
                      ? day.isDisabled
                        ? `${day.offLabel} — logging is closed`
                        : `${day.offLabel} — viewing only / requests still allowed`
                      : day.isDisabled
                      ? day.iso > todayIso
                        ? 'Future dates cannot be logged'
                        : 'Date is before system start date'
                      : isToday
                      ? "Today's date"
                      : 'Selectable previous date'
                  }
                  className={`h-8 rounded-xl text-xs font-bold font-numeric transition-all flex items-center justify-center relative ${
                    day.isDisabled
                      ? 'opacity-25 cursor-not-allowed text-zinc-400 dark:text-zinc-600 select-none'
                      : isSelected
                      ? 'bg-indigo-600 text-white shadow-xs font-black ring-2 ring-indigo-600/30'
                      : isOffMarked
                      ? 'text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 cursor-pointer'
                      : isToday
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-500 font-extrabold shadow-2xs'
                      : isSelectablePast
                      ? 'text-indigo-900 dark:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 cursor-pointer font-bold'
                      : day.isCurrentMonth
                      ? 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 cursor-pointer'
                      : 'text-zinc-400 dark:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer'
                  }`}
                >
                  <span>{day.dayNumber}</span>
                  {isToday && !isSelected && (
                    <span className="w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400 absolute bottom-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Actions Footer */}
          {clearable && (
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="text-[11px] font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleSelectToday}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 px-2 py-1 rounded-lg transition"
            >
              Today
            </button>
          </div>
          )}
        </div>
      )}
    </div>
  );
};

