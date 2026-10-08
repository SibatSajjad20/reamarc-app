import React, { useState, useMemo, useEffect } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useOffDays } from '../../hooks/useOffDays';
import { cn } from '../../lib/utils';
import { IconButton, Button } from './button';

export interface CustomDatePickerProps {
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
      weekday: 'short',
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

  const todayIso = useMemo(() => formatIso(new Date()), []);

  // Calendar calculations
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sun, 1 is Mon
    const offset = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Convert so Mon=0, Sun=6
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const days: {
      dayNumber: number;
      iso: string;
      isCurrentMonth: boolean;
      isDisabled: boolean;
      offLabel?: string;
    }[] = [];

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
    <div className={cn('relative w-full text-left', className)}>
      {label && (
        <label className="block text-label font-medium text-fg mb-1.5 flex items-center gap-1.5">
          <CalendarDays size={14} className="text-fg-muted" />
          <span>{label}</span>
        </label>
      )}

      <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'w-full h-9 px-3 flex items-center justify-between gap-2 border border-border-strong bg-surface rounded-md text-ui text-fg shadow-xs transition-colors cursor-pointer select-none outline-none disabled:opacity-50 disabled:cursor-not-allowed hover:border-fg-muted/60 focus-visible:outline-none focus-visible:border-border-strong',
              isOpen && 'border-border-strong bg-subtle/50'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CalendarDays size={16} className="text-fg-muted shrink-0" />
              <span
                className={cn(
                  'truncate font-numeric tabular-nums',
                  value ? 'text-fg font-medium' : 'text-fg-muted font-normal'
                )}
              >
                {value ? formatDisplayDate(value) : placeholder}
              </span>
            </div>

            {value && !disabled && clearable ? (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onChange('');
                  }
                }}
                className="p-0.5 text-fg-muted hover:text-fg rounded-sm hover:bg-hover transition-colors shrink-0"
                title="Clear date"
              >
                <X size={14} />
              </span>
            ) : (
              <div className="w-3.5 h-3.5" />
            )}
          </button>
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align={align === 'right' ? 'end' : 'start'}
            sideOffset={4}
            className="z-[var(--z-popover,100)] w-[280px] sm:w-[300px] p-3.5 bg-surface border border-border rounded-lg shadow-md select-none outline-none duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            {/* Header Navigation */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
              <h4 className="text-ui font-semibold text-fg">
                {MONTH_NAMES[viewMonth]} <span className="font-numeric tabular-nums">{viewYear}</span>
              </h4>

              <div className="flex items-center gap-1">
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={ChevronLeft}
                  label="Previous month"
                  onClick={handlePrevMonth}
                  className="h-7 w-7"
                />
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={ChevronRight}
                  label="Next month"
                  onClick={handleNextMonth}
                  className="h-7 w-7"
                />
              </div>
            </div>

            {/* Weekday Labels */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {WEEKDAY_NAMES.map((wd) => (
                <span
                  key={wd}
                  className="text-micro font-medium text-fg-muted py-1"
                >
                  {wd}
                </span>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const isSelected = day.iso === value;
                const isToday = day.iso === todayIso;
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
                        : undefined
                    }
                    className={cn(
                      'h-8 rounded-sm text-small font-numeric tabular-nums transition-colors flex items-center justify-center relative cursor-pointer',
                      day.isDisabled && 'opacity-40 cursor-not-allowed text-fg-muted',
                      isSelected && 'bg-accent text-accent-fg font-semibold shadow-xs',
                      !isSelected && isToday && 'ring-1 ring-accent text-accent font-semibold',
                      !isSelected && !isToday && isOffMarked && 'bg-info-bg text-info-fg border border-info-bd',
                      !isSelected && !isToday && !isOffMarked && day.isCurrentMonth && 'text-fg hover:bg-hover',
                      !isSelected && !isToday && !isOffMarked && !day.isCurrentMonth && 'text-fg-faint hover:bg-hover'
                    )}
                  >
                    <span>{day.dayNumber}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick Actions Footer */}
            {clearable && (
              <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                  }}
                  className="h-7 px-2 text-small"
                >
                  Clear
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectToday}
                  className="h-7 px-2 text-small text-accent hover:text-accent font-medium"
                >
                  Today
                </Button>
              </div>
            )}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
};
