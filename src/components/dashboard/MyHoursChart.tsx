import React, { useMemo } from 'react';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';
import { formatHours } from '../../utils/logTimeChecks';

export interface MyHoursDay {
  date: string;
  dayLabel: string;
  loggedHours: number;
  workedHours: number;
  isOff: boolean;
  isToday: boolean;
}

interface MyHoursChartProps {
  days: MyHoursDay[];
  range: '7D' | '14D' | '30D';
  onRangeChange: (r: '7D' | '14D' | '30D') => void;
  dateRangeLabel: string;
  isLoading?: boolean;
  className?: string;
}

export const MyHoursChart: React.FC<MyHoursChartProps> = ({
  days,
  range,
  onRangeChange,
  dateRangeLabel,
  isLoading,
  className,
}) => {
  const maxHours = useMemo(() => {
    const maxVal = Math.max(
      8,
      ...days.map((d) => Math.max(d.workedHours, d.loggedHours))
    );
    return Math.ceil(maxVal / 2) * 2;
  }, [days]);

  const yTicks = useMemo(() => {
    const ticks = [];
    const step = maxHours > 10 ? 4 : 2;
    for (let i = maxHours; i >= 0; i -= step) {
      ticks.push(i);
    }
    return ticks;
  }, [maxHours]);

  const hasAnyHours = days.some((d) => d.loggedHours > 0 || d.workedHours > 0);

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg shadow-xs overflow-hidden flex flex-col justify-between',
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-ui font-semibold text-fg">My hours</h3>
          <p className="text-xs text-fg-muted mt-0.5">
            Logged in daily logs vs time at work · {dateRangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-accent shrink-0" />
              Logged
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-accent/25 border border-accent/40 shrink-0" />
              At work
            </span>
          </div>
          <SegmentedControl
            value={range}
            onValueChange={(val: string) => onRangeChange(val as '7D' | '14D' | '30D')}
            options={[
              { value: '7D', label: '7D' },
              { value: '14D', label: '14D' },
              { value: '30D', label: '30D' },
            ]}
            className="h-7 text-xs"
          />
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex-1">
        {isLoading && days.length === 0 ? (
          <div className="h-44 flex items-center justify-center">
            <Skeleton className="w-full h-full rounded-md" />
          </div>
        ) : !hasAnyHours && days.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-xs text-fg-muted">
            No hours recorded in this range.
          </div>
        ) : (
          <div className="h-48 flex items-end gap-3 pt-4 pb-2 relative">
            {/* Y-axis Gridlines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8 text-[10px] text-fg-muted">
              {yTicks.map((t) => (
                <div key={t} className="flex items-center w-full">
                  <span className="w-6 text-right pr-2 font-numeric">{t}h</span>
                  <div className="flex-1 border-b border-border/40 border-dashed" />
                </div>
              ))}
            </div>

            {/* Bars container */}
            <div className="flex-1 flex items-end justify-around pl-8 h-full pb-8 z-10 overflow-x-auto scrollbar-none">
              {days.map((day) => {
                const workedPct = Math.min(100, (day.workedHours / maxHours) * 100);
                const loggedPct = Math.min(100, (day.loggedHours / maxHours) * 100);

                return (
                  <div
                    key={day.date}
                    className="flex flex-col items-center h-full justify-end min-w-[36px] flex-1 px-1"
                  >
                    {/* Overlaid Bars */}
                    <div className="w-full relative flex items-end justify-center h-full">
                      {/* At work (background wider bar) */}
                      {day.workedHours > 0 ? (
                        <div
                          title={`At work: ${formatHours(day.workedHours)}`}
                          className="w-full max-w-[28px] bg-accent/20 border border-dashed border-accent/40 rounded-xs transition-all duration-300"
                          style={{ height: `${workedPct}%` }}
                        />
                      ) : null}
                      {/* Logged (foreground solid bar) */}
                      {day.loggedHours > 0 ? (
                        <div
                          title={`Logged: ${formatHours(day.loggedHours)}`}
                          className="w-3/5 max-w-[16px] bg-accent rounded-xs absolute transition-all duration-300"
                          style={{ height: `${loggedPct}%` }}
                        />
                      ) : null}
                      {day.workedHours === 0 && day.loggedHours === 0 ? (
                        <span className="text-[10px] text-fg-muted">—</span>
                      ) : null}
                    </div>

                    {/* Day label */}
                    <span className="text-[10px] text-fg font-medium truncate w-full text-center mt-1.5 leading-tight">
                      {day.dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
