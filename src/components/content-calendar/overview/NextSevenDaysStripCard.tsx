import React, { useMemo } from 'react';
import { Calendar, ArrowRight } from 'lucide-react';
import type { ContentCalendarItem } from '../../../types/contentCalendar';
import { calculateNextSevenDays } from '../../../utils/contentCalendarOverview';

interface Props {
  items: ContentCalendarItem[];
  isLoading?: boolean;
  onOpenCalendar: () => void;
}

export const NextSevenDaysStripCard: React.FC<Props> = ({
  items,
  isLoading = false,
  onOpenCalendar,
}) => {
  const days = useMemo(() => calculateNextSevenDays(items), [items]);
  const totalScheduled = useMemo(() => days.reduce((sum, d) => sum + d.count, 0), [days]);
  const maxCount = useMemo(() => Math.max(1, ...days.map((d) => d.count)), [days]);

  return (
    <div className="w-full rounded-lg bg-surface border border-border shadow-xs p-4 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-accent" />
            <h3 className="text-ui font-semibold text-fg">
              Next 7 Days
            </h3>
          </div>
          <p className="text-xs text-fg-muted mt-0.5 font-numeric">
            {totalScheduled} scheduled {totalScheduled === 1 ? 'publish' : 'publishes'} in the upcoming week
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCalendar}
          className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
        >
          <span>Open calendar</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading ? (
        <div className="pt-3 pb-1 h-28 grid grid-cols-7 gap-2 items-end animate-pulse">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 h-full justify-end">
              <div className="w-4/5 h-12 bg-skel rounded-xs" />
              <div className="w-8 h-2.5 bg-skel rounded" />
              <div className="w-6 h-2 bg-skel rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="pt-3 pb-1">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center items-end h-28">
            {days.map((day) => {
              const heightPct = day.count > 0 ? Math.max(16, Math.round((day.count / maxCount) * 100)) : 0;
              const isToday = day.dayLabel === 'Today';

              return (
                <div
                  key={day.isoDate}
                  onClick={onOpenCalendar}
                  className="flex flex-col items-center h-full justify-end cursor-pointer group rounded-md p-1 hover:bg-subtle/50 transition"
                  title={`${day.dateStr} (${day.dayLabel}): ${day.count} scheduled`}
                >
                  {/* Bar Container */}
                  <div className="w-full flex flex-col items-center justify-end h-14">
                    <span
                      className={`text-[11px] font-numeric font-semibold mb-1 transition ${
                        day.count > 0 ? 'text-fg' : 'text-fg-muted/40 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {day.count}
                    </span>
                    <div className="w-full max-w-[28px] h-10 flex items-end justify-center">
                      {day.count > 0 ? (
                        <div
                          className="w-full bg-accent rounded-xs group-hover:bg-accent-hover transition-all duration-300"
                          style={{ height: `${heightPct}%` }}
                        />
                      ) : (
                        <div className="w-full h-1 bg-border rounded-xs" />
                      )}
                    </div>
                  </div>

                  {/* Day Label */}
                  <span
                    className={`text-[11px] mt-1.5 leading-none transition ${
                      isToday ? 'font-semibold text-accent' : 'text-fg-muted group-hover:text-fg'
                    }`}
                  >
                    {day.dayLabel}
                  </span>

                  {/* Date String */}
                  <span className="text-[10px] text-fg-muted font-numeric mt-0.5 leading-none">
                    {day.dateStr.split(' ')[1]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
