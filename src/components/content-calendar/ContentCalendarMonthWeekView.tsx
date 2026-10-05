import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { ContentCalendarItem } from '../../types/contentCalendar';
import { NEUTRAL_METADATA_BADGE_COMPACT_CLASS } from '../../utils/badgeStyles';

interface Props {
  items: ContentCalendarItem[];
  isLoading?: boolean;
  onSelectItem: (item: ContentCalendarItem) => void;
  onUpdateItem: (id: string, payload: Partial<ContentCalendarItem>) => Promise<void>;
}

export const ContentCalendarMonthWeekView: React.FC<Props> = ({
  items,
  isLoading = false,
  onSelectItem,
  onUpdateItem,
}) => {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [dateMode, setDateMode] = useState<'publish' | 'design_due'>('publish');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Helper to format Date to local YYYY-MM-DD avoiding UTC timezone shifting
  const toLocalIso = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayIso = useMemo(() => toLocalIso(new Date()), []);

  // Compute Week Days (Monday to Sunday)
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    // Monday as start of week: day 0 is Sunday -> diff is -6, day 1 is Monday -> diff is 0
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.getFullYear(), d.getMonth(), diff);

    const days: { date: Date; iso: string; label: string; dayName: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const nextD = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const iso = toLocalIso(nextD);
      const dayName = nextD.toLocaleDateString('en-US', { weekday: 'long' });
      const label = nextD.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
      days.push({ date: nextD, iso, label, dayName });
    }
    return days;
  }, [currentDate]);

  // Compute Month Days (42 cells: 6 weeks)
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const dayOfWeek = firstDay.getDay();
    const startOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday start
    const startDate = new Date(year, month, 1 - startOffset);

    const daysCount = startOffset + new Date(year, month + 1, 0).getDate() > 35 ? 42 : 35;
    const days: { date: Date; iso: string; dayNum: number; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < daysCount; i++) {
      const cellD = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      const iso = toLocalIso(cellD);
      days.push({
        date: cellD,
        iso,
        dayNum: cellD.getDate(),
        isCurrentMonth: cellD.getMonth() === month,
      });
    }
    return days;
  }, [currentDate]);

  // Map items by date according to selected dateMode
  const itemsByDate = useMemo(() => {
    const map: Record<string, ContentCalendarItem[]> = {};
    for (const it of items) {
      const targetDate = dateMode === 'publish' ? it.publish_date : it.design_due;
      if (targetDate) {
        const dateKey = targetDate.includes('T') ? targetDate.split('T')[0] : targetDate;
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(it);
      }
    }
    return map;
  }, [items, dateMode]);

  // Unscheduled items count
  const unscheduledItems = useMemo(() => {
    return items.filter((it) => (dateMode === 'publish' ? !it.publish_date : !it.design_due));
  }, [items, dateMode]);

  const shiftDate = (amount: number) => {
    const next = new Date(currentDate);
    if (viewMode === 'week') {
      next.setDate(next.getDate() + amount * 7);
    } else {
      next.setMonth(next.getMonth() + amount);
    }
    setCurrentDate(next);
  };

  const handleDropOnDate = async (e: React.DragEvent, targetIso: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const id = draggingId || e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    if (!id) return;

    if (dateMode === 'publish') {
      await onUpdateItem(id, { publish_date: targetIso });
    } else {
      await onUpdateItem(id, { design_due: targetIso });
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50/70 dark:bg-[#090a0f] overflow-hidden select-none">
      {/* Calendar Navigation Bar */}
      <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12141c] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 px-3 min-w-[140px] text-center">
              {viewMode === 'week'
                ? `${weekDays[0].label} — ${weekDays[6].label}`
                : currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
          >
            Today
          </button>
        </div>

        {/* Date Mode and View Mode Toggles */}
        <div className="flex items-center gap-2.5">
          {/* Mode Selector: Publish Date vs Design Due Date */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5 border border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setDateMode('publish')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                dateMode === 'publish'
                  ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
              title="Schedule campaigns by Live / Publish Date"
            >
              <span>🚀</span>
              <span>Publish Date</span>
            </button>
            <button
              type="button"
              onClick={() => setDateMode('design_due')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                dateMode === 'design_due'
                  ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
              title="Schedule campaigns by Creative / Design Due Date"
            >
              <span>🎨</span>
              <span>Design Due</span>
            </button>
          </div>

          {unscheduledItems.length > 0 && (
            <span className="text-xs text-zinc-400 font-medium mr-1 hidden sm:inline-block">
              <strong className="text-zinc-700 dark:text-zinc-200 font-bold">{unscheduledItems.length}</strong> unscheduled
            </span>
          )}

          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5 border border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Week View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Month View
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 min-h-0 overflow-x-auto p-4 flex gap-3">
          {Array.from({ length: viewMode === 'week' ? 7 : 6 }).map((_, idx) => (
            <div
              key={`cal-skeleton-${idx}`}
              className="w-[260px] min-w-[220px] flex-1 h-full rounded-2xl bg-zinc-100/80 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 p-3 space-y-2"
            >
              <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="h-16 rounded-xl bg-zinc-200/80 dark:bg-zinc-800 animate-pulse" />
              <div className="h-16 rounded-xl bg-zinc-200/80 dark:bg-zinc-800 animate-pulse" />
              <div className="h-16 rounded-xl bg-zinc-200/80 dark:bg-zinc-800 animate-pulse" />
            </div>
          ))}
        </div>
      ) : viewMode === 'week' ? (
        <div className="flex-1 min-h-0 overflow-x-auto p-4 flex gap-3">
          {weekDays.map((day) => {
            const dayItems = itemsByDate[day.iso] || [];
            const isToday = day.iso === todayIso;
            const isOver = dragOverDate === day.iso;

            return (
              <div
                key={day.iso}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverDate !== day.iso) setDragOverDate(day.iso);
                }}
                onDragLeave={() => setDragOverDate(null)}
                onDrop={(e) => handleDropOnDate(e, day.iso)}
                className={`w-[260px] min-w-[260px] max-w-[260px] flex-shrink-0 flex flex-col rounded-2xl bg-zinc-100/70 dark:bg-zinc-900/40 border transition-all ${
                  isToday
                    ? 'border-indigo-500/50 shadow-xs'
                    : 'border-zinc-200/80 dark:border-zinc-800/80'
                } ${isOver ? 'ring-2 ring-indigo-500/50 bg-indigo-50/20' : ''}`}
              >
                {/* Day Header */}
                <div className="p-3 border-b border-zinc-200/70 dark:border-zinc-800/70 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      {day.dayName}
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-medium">
                      {day.label}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-numeric font-bold px-2 py-0.5 rounded-full ${
                      dayItems.length > 0
                        ? 'bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                        : 'bg-zinc-200/40 dark:bg-zinc-800/40 text-zinc-400'
                    }`}
                  >
                    {dayItems.length}
                  </span>
                </div>

                {/* Day Content Cards */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-[140px]">
                  {dayItems.length === 0 ? (
                    <div className="h-36 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800/80 flex flex-col items-center justify-center p-3 text-center">
                      <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                        No articles for this day
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-1 max-w-[180px]">
                        Drag a content item here to schedule for {day.dayName}.
                      </p>
                    </div>
                  ) : (
                    dayItems.map((item) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', item.id);
                          setDraggingId(item.id);
                        }}
                        onClick={() => onSelectItem(item)}
                        className="p-3 rounded-xl bg-white dark:bg-[#141620] border border-zinc-200/80 dark:border-zinc-800 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition cursor-pointer group"
                      >
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <div className="flex items-center gap-1.5 truncate min-w-0">
                            <span className="font-numeric font-bold text-[10px] text-indigo-600 dark:text-indigo-400 shrink-0">
                              {item.serial}
                            </span>
                            {item.client_name && (
                              <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 truncate max-w-[110px]" title={item.client_name}>
                                • {item.client_name}
                              </span>
                            )}
                          </div>
                          <span className={`${NEUTRAL_METADATA_BADGE_COMPACT_CLASS} shrink-0`}>
                            {item.creative_type}
                          </span>
                        </div>

                        <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {item.content_concept}
                        </h4>

                        <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[10px] text-zinc-400">
                          <span className="font-medium truncate max-w-[100px]">
                            {item.content_pillar || '—'}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {dateMode === 'publish' && item.design_due && item.design_due !== item.publish_date && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-medium" title={`Design Due: ${item.design_due}`}>
                                Due: {item.design_due.slice(5)}
                              </span>
                            )}
                            {dateMode === 'design_due' && item.publish_date && item.publish_date !== item.design_due && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-medium" title={`Publish Date: ${item.publish_date}`}>
                                Live: {item.publish_date.slice(5)}
                              </span>
                            )}
                            <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                              {item.stage}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Month Grid View */
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="grid grid-cols-7 gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayHeader) => (
              <div
                key={dayHeader}
                className="py-1 text-center text-xs font-bold text-zinc-400 uppercase tracking-wider"
              >
                {dayHeader}
              </div>
            ))}

            {monthDays.map((cell) => {
              const cellItems = itemsByDate[cell.iso] || [];
              const isToday = cell.iso === todayIso;
              const isOver = dragOverDate === cell.iso;

              return (
                <div
                  key={cell.iso}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverDate !== cell.iso) setDragOverDate(cell.iso);
                  }}
                  onDragLeave={() => setDragOverDate(null)}
                  onDrop={(e) => handleDropOnDate(e, cell.iso)}
                  className={`min-h-[110px] p-2 rounded-xl border flex flex-col transition-all ${
                    cell.isCurrentMonth
                      ? 'bg-white dark:bg-[#12141c]'
                      : 'bg-zinc-50/50 dark:bg-zinc-950/30 opacity-60'
                  } ${
                    isToday
                      ? 'border-indigo-500 shadow-xs'
                      : 'border-zinc-200/80 dark:border-zinc-800/80'
                  } ${isOver ? 'ring-2 ring-indigo-500 bg-indigo-50/20' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-xs font-bold font-numeric ${
                        isToday
                          ? 'w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]'
                          : 'text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    {cellItems.length > 0 && (
                      <span className="text-[10px] font-numeric font-bold px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        {cellItems.length}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 space-y-1 overflow-y-auto max-h-[85px]">
                    {cellItems.map((item) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', item.id);
                          setDraggingId(item.id);
                        }}
                        onClick={() => onSelectItem(item)}
                        className="px-1.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-[11px] font-medium text-zinc-800 dark:text-zinc-200 truncate cursor-pointer transition flex items-center justify-between gap-1"
                        title={`${item.serial} - ${item.content_concept} (Publish: ${item.publish_date || 'None'}, Design Due: ${item.design_due || 'None'})`}
                      >
                        <span className="truncate">
                          <span className="font-numeric font-bold text-indigo-600 dark:text-indigo-400 mr-1">
                            {item.serial}
                          </span>
                          {item.content_concept}
                        </span>
                        {dateMode === 'publish' && item.design_due && item.design_due !== item.publish_date && (
                          <span className="text-[8px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 font-bold shrink-0" title={`Design Due: ${item.design_due}`}>
                            Due {item.design_due.slice(5)}
                          </span>
                        )}
                        {dateMode === 'design_due' && item.publish_date && item.publish_date !== item.design_due && (
                          <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 font-bold shrink-0" title={`Live Date: ${item.publish_date}`}>
                            Live {item.publish_date.slice(5)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
