import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import { useOffDays } from '../../hooks/useOffDays';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export interface DateRangeCalendarPickerProps {
  initialStartDate?: string;
  initialEndDate?: string;
  onApply: (range: { startDate: string; endDate: string; label?: string }) => void;
  onCancel?: () => void;
  className?: string;
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

export const DateRangeCalendarPicker: React.FC<DateRangeCalendarPickerProps> = ({
  initialStartDate,
  initialEndDate,
  onApply,
  onCancel,
  className,
}) => {
  const { getOffDay } = useOffDays();
  const [startDate, setStartDate] = useState<string>(initialStartDate || formatIso(new Date()));
  const [endDate, setEndDate] = useState<string>(initialEndDate || formatIso(new Date()));
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Month navigation view state
  const initialDateObj = parseIso(initialStartDate);
  const [viewYear, setViewYear] = useState<number>(initialDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDateObj.getMonth()); // 0-11

  // Calendar calculations
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sun, 1 is Mon
    // Convert so Monday is 0, Sunday is 6
    const offset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const days: { dayNumber: number; iso: string; isCurrentMonth: boolean }[] = [];

    // Preceding month padding
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = offset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevDate = new Date(viewYear, viewMonth - 1, d);
      days.push({
        dayNumber: d,
        iso: formatIso(prevDate),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(viewYear, viewMonth, d);
      days.push({
        dayNumber: d,
        iso: formatIso(curDate),
        isCurrentMonth: true,
      });
    }

    // Trailing padding to fill complete grid of 35 or 42
    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(viewYear, viewMonth + 1, d);
      days.push({
        dayNumber: d,
        iso: formatIso(nextDate),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [viewYear, viewMonth]);

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

  const handleDateClick = (iso: string) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(iso);
      setEndDate('');
    } else if (startDate && !endDate) {
      if (iso < startDate) {
        setEndDate(startDate);
        setStartDate(iso);
      } else {
        setEndDate(iso);
      }
    }
  };

  // Quick Preset Handlers
  const applyPreset = (presetKey: string) => {
    const now = new Date();
    if (presetKey === 'today') {
      const t = formatIso(now);
      setStartDate(t);
      setEndDate(t);
    } else if (presetKey === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(now.getDate() - 1);
      const y = formatIso(yest);
      setStartDate(y);
      setEndDate(y);
    } else if (presetKey === 'this_week') {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const mon = new Date(now);
      mon.setDate(now.getDate() + diffToMonday);
      const sat = new Date(mon);
      sat.setDate(mon.getDate() + 5);
      setStartDate(formatIso(mon));
      setEndDate(formatIso(sat));
    } else if (presetKey === 'last_7_days') {
      const past = new Date(now);
      past.setDate(now.getDate() - 6);
      setStartDate(formatIso(past));
      setEndDate(formatIso(now));
    } else if (presetKey === 'this_month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(formatIso(first));
      setEndDate(formatIso(last));
    }
  };

  const handleApply = () => {
    const finalStart = startDate || formatIso(new Date());
    const finalEnd = endDate || finalStart;
    onApply({
      startDate: finalStart,
      endDate: finalEnd,
    });
  };

  const activeRangeEnd = endDate || hoverDate || startDate;
  const isSelectedRange = (iso: string) => {
    if (!startDate) return false;
    const s = startDate <= activeRangeEnd ? startDate : activeRangeEnd;
    const e = startDate <= activeRangeEnd ? activeRangeEnd : startDate;
    return iso >= s && iso <= e;
  };

  return (
    <div
      className={cn(
        'flex flex-col md:flex-row bg-surface border border-border rounded-lg shadow-md overflow-hidden select-none',
        className
      )}
    >
      {/* Left Quick Presets Panel */}
      <div className="p-3 border-b md:border-b-0 md:border-r border-border bg-subtle/50 w-full md:w-44 flex flex-col justify-between shrink-0">
        <div className="space-y-1">
          <span className="text-micro font-medium text-fg-muted px-2 block mb-1">
            Quick presets
          </span>

          {[
            { id: 'today', label: "Today's logs" },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_week', label: 'This week (Mon–Sat)' },
            { id: 'last_7_days', label: 'Past 7 days' },
            { id: 'this_month', label: 'This month' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-small font-medium text-fg-2 hover:bg-hover hover:text-fg transition-colors cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="pt-3 border-t border-border space-y-1">
          <div className="text-micro text-fg-muted px-2 font-numeric">
            {startDate} {endDate ? `→ ${endDate}` : ''}
          </div>
        </div>
      </div>

      {/* Main Interactive Calendar View */}
      <div className="p-4 flex-1 flex flex-col justify-between min-w-[280px]">
        {/* Month / Year Navigator Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1 rounded-md hover:bg-hover text-fg-muted hover:text-fg transition-colors cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>

          <span className="text-ui font-semibold text-fg">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 rounded-md hover:bg-hover text-fg-muted hover:text-fg transition-colors cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Weekdays Row */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {WEEKDAY_NAMES.map((wd) => (
            <span key={wd} className="text-micro font-medium text-fg-muted uppercase">
              {wd}
            </span>
          ))}
        </div>

        {/* Calendar Days Matrix */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {calendarDays.map((cd) => {
            const isStart = cd.iso === startDate;
            const isEnd = cd.iso === endDate;
            const isInRange = isSelectedRange(cd.iso);
            const isCurrent = cd.isCurrentMonth;
            const off = getOffDay(cd.iso);

            return (
              <button
                key={cd.iso}
                type="button"
                onClick={() => handleDateClick(cd.iso)}
                onMouseEnter={() => {
                  if (startDate && !endDate) {
                    setHoverDate(cd.iso);
                  }
                }}
                onMouseLeave={() => setHoverDate(null)}
                title={off.isOff ? off.label : undefined}
                className={cn(
                  'h-8 w-8 mx-auto flex items-center justify-center rounded-md text-small font-medium transition-colors cursor-pointer select-none relative',
                  isStart || isEnd
                    ? 'bg-accent text-accent-fg font-semibold shadow-xs z-10'
                    : isInRange
                    ? 'bg-accent-soft text-accent-text font-medium'
                    : off.isOff
                    ? 'text-info-fg bg-info-bg/50'
                    : isCurrent
                    ? 'text-fg hover:bg-hover'
                    : 'text-fg-faint hover:bg-hover/50'
                )}
              >
                {cd.dayNumber}
              </button>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={!startDate}
            icon={Check}
            className="flex-1"
          >
            Apply selected range
          </Button>
        </div>
      </div>
    </div>
  );
};
