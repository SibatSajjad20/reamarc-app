import React, { useState, useMemo } from 'react';
import { ArrowRight, X } from 'lucide-react';
import type { TeamHoursMember } from '../../types/dailyLog';
import type { ViewType } from '../../types';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';
import { formatHours } from '../../utils/logTimeChecks';

interface TeamHoursChartProps {
  members: TeamHoursMember[];
  range: '7D' | '14D' | '30D';
  onRangeChange: (r: '7D' | '14D' | '30D') => void;
  dateRangeLabel: string;
  onNavigateView: (view: ViewType) => void;
  isLoading?: boolean;
  className?: string;
}

export const TeamHoursChart: React.FC<TeamHoursChartProps> = ({
  members,
  range,
  onRangeChange,
  dateRangeLabel,
  onNavigateView,
  isLoading,
  className,
}) => {
  const [selectedMember, setSelectedMember] = useState<TeamHoursMember | null>(null);

  // Sort by largest gap (most negative deficit first, e.g. -14.5h before -4.2h)
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => a.gap - b.gap);
  }, [members]);

  const displayedMembers = useMemo(() => {
    return sortedMembers.slice(0, 8);
  }, [sortedMembers]);

  // Max scale for y-axis
  const maxHours = useMemo(() => {
    const maxVal = Math.max(
      10,
      ...members.map((m) => Math.max(m.worked_total, m.logged_total))
    );
    return Math.ceil(maxVal / 10) * 10;
  }, [members]);

  const yTicks = useMemo(() => {
    const ticks = [];
    const step = maxHours > 30 ? 10 : 5;
    for (let i = maxHours; i >= 0; i -= step) {
      ticks.push(i);
    }
    return ticks;
  }, [maxHours]);

  return (
    <>
      <div
        className={cn(
          'bg-surface border border-border rounded-lg shadow-xs overflow-hidden flex flex-col justify-between',
          className
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-ui font-semibold text-fg">Team hours</h3>
            <p className="text-xs text-fg-muted mt-0.5">
              Your {members.length} team members · logged vs time at work · {dateRangeLabel}
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

        {/* Chart Body */}
        <div className="p-4 flex-1">
          {isLoading && members.length === 0 ? (
            <div className="h-44 flex items-center justify-center">
              <Skeleton className="w-full h-full rounded-md" />
            </div>
          ) : displayedMembers.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-fg-muted">
              No team hours recorded in this range.
            </div>
          ) : (
            <div className="h-48 flex items-end gap-4 pt-4 pb-2 relative">
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
              <div className="flex-1 flex items-end justify-around pl-8 h-full pb-8 z-10">
                {displayedMembers.map((member) => {
                  const workedPct = Math.min(100, (member.worked_total / maxHours) * 100);
                  const loggedPct = Math.min(100, (member.logged_total / maxHours) * 100);
                  const isSevereDeficit = member.gap <= -5.0;

                  return (
                    <div
                      key={member.user_id}
                      onClick={() => setSelectedMember(member)}
                      className="group flex flex-col items-center h-full justify-end cursor-pointer max-w-[64px] flex-1 px-1"
                    >
                      {/* Overlaid Bars */}
                      <div className="w-full relative flex items-end justify-center h-full">
                        {/* At work (background wider bar) */}
                        <div
                          className="w-full max-w-[36px] bg-accent/20 border border-dashed border-accent/40 rounded-xs transition-all duration-300 group-hover:bg-accent/30"
                          style={{ height: `${workedPct}%` }}
                        />
                        {/* Logged (foreground solid bar) */}
                        <div
                          className="w-3/5 max-w-[20px] bg-accent rounded-xs absolute transition-all duration-300 group-hover:brightness-110"
                          style={{ height: `${loggedPct}%` }}
                        />
                      </div>

                      {/* Name & Gap */}
                      <span className="text-[11px] text-fg font-medium truncate w-full text-center mt-1.5 leading-tight">
                        {member.full_name}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-numeric font-medium leading-tight',
                          isSevereDeficit ? 'text-warning-fg' : 'text-fg-muted'
                        )}
                      >
                        {member.gap > 0 ? `+${member.gap}h` : `${member.gap}h`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-subtle/20 text-xs text-fg-muted flex items-center justify-between">
          <span>Sorted by largest gap · gap = at work - logged</span>
          <button
            type="button"
            onClick={() => onNavigateView('daily-log')}
            className="text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            View all {members.length}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Member Details Popover / Drawer */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border w-full max-w-md shadow-lg flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-ui font-semibold text-fg">
                  {selectedMember.full_name}
                </h3>
                <p className="text-xs text-fg-muted mt-0.5 font-numeric">
                  {dateRangeLabel} · {selectedMember.department}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="text-fg-muted hover:text-fg p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-fg-muted font-medium text-left">
                    <th className="pb-2">Day</th>
                    <th className="pb-2 text-right">At work</th>
                    <th className="pb-2 text-right">Logged</th>
                    <th className="pb-2 text-right">Gap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {selectedMember.days.map((day) => {
                    const dayGap = Math.round((day.logged_hours - day.worked_hours) * 10) / 10;
                    const dateObj = new Date(day.date);
                    const dayName = isNaN(dateObj.getTime())
                      ? day.date
                      : dateObj.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

                    return (
                      <tr key={day.date} className="h-8">
                        <td className="text-fg font-medium">
                          {dayName}
                          {day.is_off && (
                            <span className="ml-1 text-[10px] text-fg-muted font-normal">
                              (off)
                            </span>
                          )}
                        </td>
                        <td className="text-right font-numeric text-fg">
                          {formatHours(day.worked_hours)}
                        </td>
                        <td className="text-right font-numeric text-fg">
                          {formatHours(day.logged_hours)}
                        </td>
                        <td
                          className={cn(
                            'text-right font-numeric font-medium',
                            dayGap < 0 ? 'text-warning-fg' : 'text-fg-muted'
                          )}
                        >
                          {dayGap > 0 ? `+${dayGap}h` : `${dayGap}h`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t border-border bg-subtle/30 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedMember(null);
                  onNavigateView('daily-log');
                }}
                className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                Open in Daily log
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
