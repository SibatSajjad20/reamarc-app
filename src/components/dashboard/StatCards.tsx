import React from 'react';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';
import { formatHours } from '../../utils/logTimeChecks';

export interface DailyStripDay {
  label: string; // Mon, Tue, etc.
  date: string;
  hours: number;
  isFuture: boolean;
  isToday: boolean;
}

interface LoggedThisWeekCardProps {
  totalHours: number;
  pastDaysLogged: number;
  pastDaysTotal: number;
  comparisonDiff?: number | null;
  days: DailyStripDay[];
  isLoading?: boolean;
  className?: string;
}

export const LoggedThisWeekCard: React.FC<LoggedThisWeekCardProps> = ({
  totalHours,
  pastDaysLogged,
  pastDaysTotal,
  comparisonDiff,
  days,
  isLoading,
  className,
}) => {
  const maxHours = Math.max(8, ...days.map((d) => d.hours));

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg shadow-xs p-4 flex flex-col justify-between',
        className
      )}
    >
      <div>
        <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium mb-1">
          <svg className="w-3.5 h-3.5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <path strokeWidth="2" strokeLinecap="round" d="M12 6v6l4 2" />
          </svg>
          <span>Logged this week</span>
        </div>

        {isLoading ? (
          <div className="space-y-1.5 py-1">
            <Skeleton className="w-16 h-8 rounded-sm" />
            <Skeleton className="w-36 h-3 rounded-sm" />
          </div>
        ) : (
          <div>
            <div className="text-kpi font-semibold text-fg font-numeric tracking-tight flex items-baseline gap-1">
              <span>{Math.round(totalHours * 10) / 10}</span>
              <span className="text-base font-normal text-fg-muted">h</span>
            </div>
            <p className="text-xs text-fg-muted mt-0.5 font-numeric">
              {comparisonDiff !== undefined && comparisonDiff !== null && comparisonDiff !== 0 && (
                <span className="text-success-fg font-medium mr-1">
                  {comparisonDiff > 0 ? `+${comparisonDiff}h` : `${comparisonDiff}h`} vs last week ·
                </span>
              )}
              <span>{pastDaysLogged} of {pastDaysTotal} past days logged</span>
            </p>
          </div>
        )}
      </div>

      {/* Mon-Sat Strip */}
      <div className="pt-4 mt-2 border-t border-border/50">
        <div className="grid grid-cols-6 gap-2 text-center items-end h-16 pb-1">
          {days.map((day) => {
            const heightPct = day.hours > 0 ? Math.min(100, Math.max(12, Math.round((day.hours / maxHours) * 100))) : 0;
            return (
              <div key={day.label} className="flex flex-col items-center h-full justify-end">
                <div className="w-full flex items-end justify-center h-9">
                  {day.hours > 0 ? (
                    <div
                      className="w-4/5 max-w-[28px] bg-accent rounded-xs transition-all duration-300"
                      style={{ height: `${heightPct}%` }}
                    />
                  ) : null}
                </div>
                <span className="text-[10px] text-fg-muted mt-1 leading-none">{day.label}</span>
                <span className="text-[11px] font-numeric text-fg font-medium mt-0.5 leading-none">
                  {day.isFuture ? '—' : day.hours > 0 ? `${formatHours(day.hours)}` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface AtWorkThisWeekCardProps {
  totalHours: number;
  pastDaysAtWork: number;
  pastDaysTotal: number;
  todayInProgress: boolean;
  days: DailyStripDay[];
  isLoading?: boolean;
  className?: string;
}

export const AtWorkThisWeekCard: React.FC<AtWorkThisWeekCardProps> = ({
  totalHours,
  pastDaysAtWork,
  pastDaysTotal,
  todayInProgress,
  days,
  isLoading,
  className,
}) => {
  const maxHours = Math.max(8, ...days.map((d) => d.hours));

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg shadow-xs p-4 flex flex-col justify-between',
        className
      )}
    >
      <div>
        <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium mb-1">
          <svg className="w-3.5 h-3.5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <path strokeWidth="2" strokeLinecap="round" d="M12 6v6l4 2" />
          </svg>
          <span>At work this week</span>
        </div>

        {isLoading ? (
          <div className="space-y-1.5 py-1">
            <Skeleton className="w-16 h-8 rounded-sm" />
            <Skeleton className="w-48 h-3 rounded-sm" />
          </div>
        ) : (
          <div>
            <div className="text-kpi font-semibold text-fg font-numeric tracking-tight flex items-baseline gap-1">
              <span>{Math.round(totalHours * 10) / 10}</span>
              <span className="text-base font-normal text-fg-muted">h</span>
            </div>
            <p className="text-xs text-fg-muted mt-0.5 font-numeric">
              {pastDaysAtWork} of {pastDaysTotal} past days at work {todayInProgress ? '· today in progress' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Mon-Sat Strip */}
      <div className="pt-4 mt-2 border-t border-border/50">
        <div className="grid grid-cols-6 gap-2 text-center items-end h-16 pb-1">
          {days.map((day) => {
            const heightPct = day.hours > 0 ? Math.min(100, Math.max(12, Math.round((day.hours / maxHours) * 100))) : 0;
            return (
              <div key={day.label} className="flex flex-col items-center h-full justify-end">
                <div className="w-full flex items-end justify-center h-9">
                  {day.hours > 0 ? (
                    <div
                      className="w-4/5 max-w-[28px] bg-accent rounded-xs transition-all duration-300"
                      style={{ height: `${heightPct}%` }}
                    />
                  ) : null}
                </div>
                <span className="text-[10px] text-fg-muted mt-1 leading-none">{day.label}</span>
                <span className="text-[11px] font-numeric text-fg font-medium mt-0.5 leading-none">
                  {day.isFuture ? '—' : day.hours > 0 ? `${formatHours(day.hours)}` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export type MonthDotStatus = 'present' | 'late' | 'off' | 'upcoming';

export interface MonthDot {
  dayNumber: number;
  status: MonthDotStatus;
  dateStr: string;
}

interface PresentInMonthCardProps {
  monthName: string;
  daysPresent: number;
  workingDaysElapsed: number;
  lateStrikes: number;
  isLateToday?: boolean;
  dots: MonthDot[];
  isLoading?: boolean;
  className?: string;
}

export const PresentInMonthCard: React.FC<PresentInMonthCardProps> = ({
  monthName,
  daysPresent,
  workingDaysElapsed,
  lateStrikes,
  isLateToday = false,
  dots,
  isLoading,
  className,
}) => {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg shadow-xs p-4 flex flex-col justify-between',
        className
      )}
    >
      <div>
        <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium mb-1">
          <svg className="w-3.5 h-3.5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" />
            <path strokeWidth="2" strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <span>Present in {monthName}</span>
        </div>

        {isLoading ? (
          <div className="space-y-1.5 py-1">
            <Skeleton className="w-28 h-8 rounded-sm" />
            <Skeleton className="w-24 h-3 rounded-sm" />
          </div>
        ) : (
          <div>
            <div className="text-kpi font-semibold text-fg font-numeric tracking-tight flex items-baseline gap-1">
              <span>{daysPresent}</span>
              <span className="text-base font-normal text-fg-muted">
                /{workingDaysElapsed} working days so far
              </span>
            </div>
            <p
              className={cn(
                'text-xs mt-0.5 font-numeric font-medium',
                lateStrikes > 0 ? 'text-warning-fg' : 'text-success-fg'
              )}
            >
              {lateStrikes} late strike{lateStrikes === 1 ? '' : 's'}{isLateToday ? ' (today)' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Dots Grid and Legend */}
      <div className="pt-3 mt-2 border-t border-border/50 space-y-2.5">
        <div className="flex flex-wrap gap-1.5 items-center max-w-[280px]">
          {dots.map((dot) => {
            let dotClass = 'bg-subtle';
            if (dot.status === 'present') dotClass = 'bg-success-fg';
            else if (dot.status === 'late') dotClass = 'bg-warning-fg';
            else if (dot.status === 'off') dotClass = 'bg-subtle border border-border';
            else if (dot.status === 'upcoming') dotClass = 'border border-dashed border-border bg-transparent';

            return (
              <span
                key={dot.dateStr}
                title={`Day ${dot.dayNumber}: ${dot.status}`}
                className={cn('w-2.5 h-2.5 rounded-sm shrink-0', dotClass)}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-[10px] text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-success-fg shrink-0" />
            Present
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-warning-fg shrink-0" />
            Late
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-subtle border border-border shrink-0" />
            Off
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs border border-dashed border-border shrink-0" />
            Upcoming
          </span>
        </div>
      </div>
    </div>
  );
};
