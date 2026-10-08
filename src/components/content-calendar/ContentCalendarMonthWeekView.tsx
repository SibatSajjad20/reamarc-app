import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Palette,
  X,
} from 'lucide-react';
import type { ContentCalendarItem } from '../../types/contentCalendar';
import { renderPlatformIcon } from './ContentCalendarTableView';
import { Button } from '../ui/button';

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
  const [morePopoverDate, setMorePopoverDate] = useState<string | null>(null);

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
    <div className="flex-1 min-h-0 flex flex-col bg-bg overflow-hidden select-none">
      {/* Calendar Navigation Bar */}
      <div className="px-5 py-2.5 border-b border-border bg-surface flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-subtle border border-border rounded-md p-0.5">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="p-1.5 rounded-sm text-fg-muted hover:text-fg hover:bg-hover transition cursor-pointer"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-fg px-3 min-w-[140px] text-center">
              {viewMode === 'week'
                ? `${weekDays[0].label} — ${weekDays[6].label}`
                : currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="p-1.5 rounded-sm text-fg-muted hover:text-fg hover:bg-hover transition cursor-pointer"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
        </div>

        {/* Date Mode and View Mode Toggles */}
        <div className="flex items-center gap-2.5">
          {/* Mode Selector: Publish date vs Design due */}
          <div className="flex items-center bg-subtle rounded-md p-0.5 border border-border">
            <button
              type="button"
              onClick={() => setDateMode('publish')}
              className={`px-2.5 py-1 rounded-sm text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                dateMode === 'publish'
                  ? 'bg-surface text-fg shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
              title="Schedule campaigns by Live / Publish Date"
            >
              <Send className="w-3.5 h-3.5 text-accent" />
              <span>Publish date</span>
            </button>
            <button
              type="button"
              onClick={() => setDateMode('design_due')}
              className={`px-2.5 py-1 rounded-sm text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                dateMode === 'design_due'
                  ? 'bg-surface text-fg shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
              title="Schedule campaigns by Creative / Design Due Date"
            >
              <Palette className="w-3.5 h-3.5 text-accent" />
              <span>Design due</span>
            </button>
          </div>

          {unscheduledItems.length > 0 && (
            <span className="text-xs text-fg-muted font-medium mr-1 hidden sm:inline-block">
              <strong className="text-fg font-medium">{unscheduledItems.length}</strong> unscheduled
            </span>
          )}

          <div className="flex items-center bg-subtle rounded-md p-0.5 border border-border">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-sm text-xs font-medium transition cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-surface text-fg shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              Week view
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded-sm text-xs font-medium transition cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-surface text-fg shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              Month view
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 min-h-0 overflow-x-auto p-4 flex gap-3 custom-scrollbar">
          {Array.from({ length: viewMode === 'week' ? 7 : 6 }).map((_, idx) => (
            <div
              key={`cal-skeleton-${idx}`}
              className="w-[280px] min-w-[220px] flex-1 h-full rounded-lg bg-surface border border-border p-3 space-y-2 animate-pulse"
            >
              <div className="h-4 w-24 rounded-sm bg-subtle" />
              <div className="h-16 rounded-md bg-subtle" />
              <div className="h-16 rounded-md bg-subtle" />
              <div className="h-16 rounded-md bg-subtle" />
            </div>
          ))}
        </div>
      ) : viewMode === 'week' ? (
        <div className="flex-1 min-h-0 overflow-x-auto p-4 flex gap-3 custom-scrollbar">
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
                className={`w-[280px] min-w-[280px] max-w-[280px] flex-shrink-0 flex flex-col rounded-lg bg-surface border transition-colors ${
                  isToday
                    ? 'border-accent shadow-xs'
                    : 'border-border'
                } ${isOver ? 'ring-2 ring-accent bg-accent-soft/20' : ''}`}
              >
                {/* Day Header */}
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-fg">
                      {day.dayName}
                    </h3>
                    <p className="text-[10px] text-fg-muted font-medium">
                      {day.label}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-mono font-medium px-2 py-0.5 rounded-full ${
                      dayItems.length > 0
                        ? 'bg-subtle text-fg'
                        : 'bg-subtle/50 text-fg-muted'
                    }`}
                  >
                    {dayItems.length}
                  </span>
                </div>

                {/* Day Content Cards */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-[140px]">
                  {dayItems.length === 0 ? (
                    <div className="h-36 rounded-md border border-dashed border-border flex flex-col items-center justify-center p-3 text-center">
                      <p className="text-xs font-medium text-fg-muted">
                        No articles for this day
                      </p>
                      <p className="text-[10px] text-fg-muted mt-1 max-w-[180px]">
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
                        className="p-3 rounded-md bg-surface border border-border shadow-xs hover:border-border-strong hover:shadow-sm transition cursor-pointer group"
                      >
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <div className="flex items-center gap-1.5 truncate min-w-0">
                            {renderPlatformIcon(item)}
                            <span className="font-mono font-medium text-xs text-accent shrink-0">
                              {item.serial}
                            </span>
                            {item.client_name && (
                              <span className="text-xs font-medium text-fg-muted truncate max-w-[110px]" title={item.client_name}>
                                • {item.client_name}
                              </span>
                            )}
                          </div>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-subtle border border-border text-fg-muted shrink-0">
                            {item.creative_type}
                          </span>
                        </div>

                        <h4 className="text-[13px] font-medium text-fg line-clamp-2 leading-snug group-hover:text-accent transition-colors">
                          {item.content_concept}
                        </h4>

                        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs text-fg-muted">
                          <span className="font-medium truncate max-w-[100px]">
                            {item.content_pillar || '—'}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {dateMode === 'publish' && item.design_due && item.design_due !== item.publish_date && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-subtle border border-border text-fg-muted font-mono" title={`Design Due: ${item.design_due}`}>
                                Due: {item.design_due.slice(5)}
                              </span>
                            )}
                            {dateMode === 'design_due' && item.publish_date && item.publish_date !== item.design_due && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-subtle border border-border text-fg-muted font-mono" title={`Publish Date: ${item.publish_date}`}>
                                Live: {item.publish_date.slice(5)}
                              </span>
                            )}
                            <span className="font-medium text-fg">
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
        /* Month Grid View (7 columns, min-height 112px, 22px today circle, up to 3 chips + more popover) */
        <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-7 gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayHeader) => (
              <div
                key={dayHeader}
                className="py-1 text-center text-xs font-medium text-fg-muted uppercase tracking-wider"
              >
                {dayHeader}
              </div>
            ))}

            {monthDays.map((cell) => {
              const cellItems = itemsByDate[cell.iso] || [];
              const isToday = cell.iso === todayIso;
              const isOver = dragOverDate === cell.iso;
              const visibleItems = cellItems.slice(0, 3);
              const remainingCount = cellItems.length - 3;

              return (
                <div
                  key={cell.iso}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverDate !== cell.iso) setDragOverDate(cell.iso);
                  }}
                  onDragLeave={() => setDragOverDate(null)}
                  onDrop={(e) => handleDropOnDate(e, cell.iso)}
                  className={`min-h-[112px] p-2 rounded-lg border flex flex-col transition-all ${
                    cell.isCurrentMonth
                      ? 'bg-surface'
                      : 'bg-subtle/40 opacity-70'
                  } ${
                    isToday
                      ? 'border-accent shadow-xs'
                      : 'border-border'
                  } ${isOver ? 'ring-2 ring-accent bg-accent-soft/20' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    {isToday ? (
                      <span className="w-[22px] h-[22px] rounded-full bg-accent text-accent-contrast flex items-center justify-center text-xs font-medium">
                        {cell.dayNum}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-fg">
                        {cell.dayNum}
                      </span>
                    )}
                    {cellItems.length > 0 && (
                      <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full bg-subtle text-fg-muted">
                        {cellItems.length}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 space-y-1 overflow-hidden">
                    {visibleItems.map((item) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', item.id);
                          setDraggingId(item.id);
                        }}
                        onClick={() => onSelectItem(item)}
                        className="px-1.5 py-1 rounded-sm bg-subtle hover:bg-hover text-xs font-medium text-fg truncate cursor-pointer transition flex items-center gap-1.5 border border-border/50"
                        title={`${item.serial} - ${item.content_concept} (Publish: ${item.publish_date || 'None'}, Design Due: ${item.design_due || 'None'})`}
                      >
                        {renderPlatformIcon(item)}
                        <span className="truncate flex-1">
                          {item.content_concept || item.serial}
                        </span>
                      </div>
                    ))}
                    {remainingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setMorePopoverDate(cell.iso)}
                        className="text-xs text-accent hover:underline font-medium text-left pl-1 cursor-pointer block"
                      >
                        +{remainingCount} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Popover dialog for days with >3 items */}
      {morePopoverDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-100"
          onClick={() => setMorePopoverDate(null)}
        >
          <div
            className="bg-surface border border-border rounded-xl shadow-lg w-full max-w-md overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg">
                Items for {morePopoverDate}
              </h3>
              <button
                type="button"
                onClick={() => setMorePopoverDate(null)}
                className="p-1 rounded-sm text-fg-muted hover:text-fg hover:bg-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 max-h-80 overflow-y-auto space-y-1.5">
              {(itemsByDate[morePopoverDate] || []).map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setMorePopoverDate(null);
                    onSelectItem(item);
                  }}
                  className="p-2 rounded-md bg-subtle hover:bg-hover border border-border cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {renderPlatformIcon(item)}
                    <span className="font-mono text-xs font-medium text-accent shrink-0">
                      {item.serial}
                    </span>
                    <span className="text-xs text-fg truncate">
                      {item.content_concept}
                    </span>
                  </div>
                  <span className="text-[10px] text-fg-muted shrink-0 font-medium">
                    {item.stage}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
