import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import { useOffDays } from '../../hooks/useOffDays';

interface DateRangeCalendarPickerProps {
  initialStartDate?: string;
  initialEndDate?: string;
  onApply: (range: { startDate: string; endDate: string; label?: string }) => void;
  onCancel?: () => void;
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
    const offset = (firstDayIndex === 0 ? 6 : firstDayIndex - 1);
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
    <div className="flex flex-col md:flex-row bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 select-none">
      {/* Left Quick Presets Panel */}
      <div className="p-3 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 w-full md:w-44 flex flex-col justify-between shrink-0">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2">
            Quick Presets
          </span>

          {[
            { id: 'today', label: "Today's Logs" },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_week', label: 'This Week (Mon-Sat)' },
            { id: 'last_7_days', label: 'Past 7 Days' },
            { id: 'this_month', label: 'This Month' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
          <div className="text-[10px] text-zinc-400 px-2 font-mono">
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
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Weekdays Row */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {WEEKDAY_NAMES.map((wd) => (
            <span key={wd} className="text-[10px] font-bold text-zinc-400 uppercase">
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
                className={`h-8 w-8 mx-auto flex items-center justify-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none relative ${
                  isStart || isEnd
                    ? 'bg-indigo-600 text-white font-bold shadow-xs shadow-indigo-600/30 z-10'
                    : isInRange
                    ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                    : off.isOff
                    ? 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40'
                    : isCurrent
                    ? 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    : 'text-zinc-300 dark:text-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                }`}
              >
                {cd.dayNumber}
              </button>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleApply}
            disabled={!startDate}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer select-none"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Selected Range</span>
          </button>
        </div>
      </div>
    </div>
  );
};
