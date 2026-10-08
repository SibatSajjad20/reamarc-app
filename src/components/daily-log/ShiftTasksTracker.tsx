import React, { useEffect, useMemo, useState } from 'react';
import { Timer } from 'lucide-react';
import type { DayTarget } from '../../types/dailyLog';
import { formatHours } from '../../utils/logTimeChecks';
import {
  formatNowHhMm,
  LOG_GAP_MATCH_HOURS,
  provisionalNetWorkHours,
  signedLogGapHours,
} from '../../utils/liveNetWorkHours';
import { cn } from '../../lib/utils';

export interface ShiftTasksTrackerProps {
  dayTarget: DayTarget | null | undefined;
  /**
   * Optional override for logged hours. Prefer omitting this so the pill uses
   * `dayTarget.logged_hours` from GET /daily-log/day-target (date-scoped, not
   * tied to the table's current filter / sheet view).
   */
  loggedHours?: number;
  /** Show skeleton while day-target is fetching. */
  loading?: boolean;
  className?: string;
  variant?: 'strip' | 'pill';
}

function formatTrackerHours(hours: number): string {
  if (hours <= 0) return '0m';
  return formatHours(hours);
}

function formatShiftDate(isoDate?: string): string {
  if (!isoDate) return 'Today';
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3) return 'Today';
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const todayIso = new Date().toISOString().slice(0, 10);
  const prefix = isoDate === todayIso ? 'Today · ' : '';
  return `${prefix}${days[dt.getDay()]}, ${d} ${months[m - 1]}`;
}

function formatShiftWindow(target?: DayTarget | null): string {
  if (!target) return 'Standard shift · 9:30 AM – 6:30 PM';
  const name = target.shift_name || 'Standard shift';
  if (target.shift_start && target.shift_end) {
    return `${name} · ${target.shift_start} – ${target.shift_end}`;
  }
  return `${name} · 9:30 AM – 6:30 PM`;
}

/**
 * Restyled ShiftTasksTracker:
 * - 'strip': Full shift status strip matching mock 06 (for DailyLogView)
 * - 'pill': Compact header pill (for modals and tight toolbars)
 */
export const ShiftTasksTracker: React.FC<ShiftTasksTrackerProps> = ({
  dayTarget,
  loggedHours: loggedHoursProp,
  loading = false,
  className = '',
  variant = 'strip',
}) => {
  const hasCheckin = Boolean(dayTarget?.has_checkin);
  const hasCheckout = Boolean(dayTarget?.has_checkout);
  const stillIn = hasCheckin && !hasCheckout;
  const isWfh = Boolean(dayTarget?.is_wfh);
  const isFullLeave = Boolean(dayTarget?.is_full_leave);

  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!stillIn) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [stillIn, dayTarget?.date, dayTarget?.check_in]);

  const loggedHours = useMemo(() => {
    if (typeof loggedHoursProp === 'number' && Number.isFinite(loggedHoursProp)) {
      return Math.max(0, loggedHoursProp);
    }
    return Math.max(0, Number(dayTarget?.logged_hours) || 0);
  }, [loggedHoursProp, dayTarget?.logged_hours]);

  const timeAtWorkHours = useMemo(() => {
    if (!dayTarget) return 0;
    if (stillIn && dayTarget.check_in) {
      return provisionalNetWorkHours({
        checkIn: dayTarget.check_in,
        checkOut: formatNowHhMm(new Date(nowTick)),
        shiftStart: dayTarget.shift_start,
        shiftEnd: dayTarget.shift_end,
        breakDurationMinutes: dayTarget.break_duration_minutes ?? 60,
        breakStart: dayTarget.break_start_time,
        breakEnd: dayTarget.break_end_time,
        isNightShift: Boolean(dayTarget.is_night_shift),
      });
    }
    const fromApi = Number(dayTarget.time_at_work_hours);
    if (Number.isFinite(fromApi) && fromApi > 0) return fromApi;
    const worked = Number(dayTarget.worked_hours);
    if (Number.isFinite(worked) && worked > 0) return worked;
    if (isWfh && !hasCheckin) return Math.max(0, Number(dayTarget.expected_hours) || 0);
    return 0;
  }, [dayTarget, stillIn, nowTick, isWfh, hasCheckin]);

  const expectedHours = Math.max(0, Number(dayTarget?.expected_hours) || 8);
  const remainingHours = Math.max(0, expectedHours - loggedHours);
  const progressTarget = Math.max(timeAtWorkHours, expectedHours, 0.1);
  const progressPercent = Math.min(100, Math.max(0, (loggedHours / progressTarget) * 100));

  const signedGap = signedLogGapHours(loggedHours, timeAtWorkHours);
  const absGap = Math.abs(signedGap);
  const isOver = signedGap > LOG_GAP_MATCH_HOURS;
  const isUnder = signedGap < -LOG_GAP_MATCH_HOURS;

  // --- Skeleton Loading States ---
  if (loading) {
    if (variant === 'pill') {
      return (
        <div
          className={cn(
            'inline-flex items-center gap-1.5 shrink-0 h-7 px-2.5 rounded-full border border-border bg-subtle/50 animate-pulse',
            className
          )}
          aria-busy="true"
          aria-label="Loading shift hours"
        >
          <span className="w-3 h-3 rounded-full bg-skel shrink-0" />
          <span className="h-2.5 w-10 rounded bg-skel" />
          <span className="h-2 w-1 rounded bg-skel/80" />
          <span className="h-2.5 w-8 rounded bg-skel" />
        </div>
      );
    }

    return (
      <div
        className={cn(
          'bg-surface border border-border rounded-lg p-3.5 sm:px-4 flex flex-wrap items-center gap-4 sm:gap-6 shrink-0 mb-4 shadow-xs animate-pulse',
          className
        )}
      >
        <div className="space-y-1.5">
          <div className="h-3 w-24 bg-skel rounded" />
          <div className="h-4 w-40 bg-skel rounded" />
        </div>
        <div className="w-px self-stretch bg-border hidden sm:block" />
        <div className="space-y-1.5">
          <div className="h-3 w-12 bg-skel rounded" />
          <div className="h-5 w-10 bg-skel rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-12 bg-skel rounded" />
          <div className="h-5 w-12 bg-skel rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-12 bg-skel rounded" />
          <div className="h-5 w-10 bg-skel rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-14 bg-skel rounded" />
          <div className="h-5 w-10 bg-skel rounded" />
        </div>
        <div className="flex-1 min-w-[160px] space-y-2">
          <div className="h-2 bg-skel rounded-full" />
          <div className="h-3 w-48 bg-skel rounded" />
        </div>
      </div>
    );
  }

  // --- Pill Variant ---
  if (variant === 'pill') {
    const visible = Boolean(dayTarget) && !isFullLeave && (hasCheckin || isWfh);
    if (!visible || !dayTarget) return null;

    const gapTone = isOver
      ? absGap >= 0.5
        ? 'text-danger-fg'
        : 'text-warning-fg'
      : isUnder
        ? absGap >= 0.5
          ? 'text-danger-fg'
          : 'text-warning-fg'
        : 'text-fg-muted';

    const gapLabel = isOver
      ? `${formatTrackerHours(absGap)} over`
      : isUnder
        ? `${formatTrackerHours(absGap)} gap`
        : 'caught up';

    const title = `Time at work ${formatTrackerHours(timeAtWorkHours)} · Logged ${
      loggedHours > 0 ? formatTrackerHours(loggedHours) : '0m'
    } · ${gapLabel}`;

    return (
      <div
        title={title}
        className={cn(
          'inline-flex items-center gap-1.5 shrink-0 h-7 max-w-full px-2.5 rounded-full border border-border bg-surface text-micro font-medium tabular-nums shadow-xs select-none',
          className
        )}
      >
        <Timer className="w-3 h-3 text-accent shrink-0 opacity-90" />
        <span className="text-fg whitespace-nowrap">
          {formatTrackerHours(timeAtWorkHours)}
        </span>
        <span className="text-fg-muted select-none" aria-hidden>
          ·
        </span>
        <span className="text-success-fg whitespace-nowrap font-semibold">
          {loggedHours > 0 ? formatTrackerHours(loggedHours) : '0m'}
        </span>
        <span className="text-fg-muted select-none" aria-hidden>
          ·
        </span>
        <span className={cn('whitespace-nowrap', gapTone)}>{gapLabel}</span>
      </div>
    );
  }

  // --- Strip Variant (Mock 06 Reference) ---
  const dateLabel = formatShiftDate(dayTarget?.date);
  const shiftLabel = formatShiftWindow(dayTarget);
  const atWorkDisplay = formatTrackerHours(timeAtWorkHours);
  const loggedDisplay = formatTrackerHours(loggedHours);
  const remainingDisplay = formatTrackerHours(remainingHours);
  const expectedDisplay = `${expectedHours}h`;

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg px-4 py-3 sm:px-4 sm:py-3.5 flex flex-wrap items-center gap-4 sm:gap-6 shrink-0 mb-4 shadow-xs select-none',
        className
      )}
    >
      {/* Date & Shift Info */}
      <div className="min-w-[170px]">
        <div className="text-small text-fg-muted">{dateLabel}</div>
        <div className="text-body font-medium text-fg">{shiftLabel}</div>
      </div>

      <div className="w-px h-8 bg-border hidden sm:block" />

      {/* Stats Columns */}
      <div>
        <div className="text-small text-fg-muted">Expected</div>
        <div className="text-h2 font-semibold font-numeric tabular-nums text-fg leading-tight">
          {expectedDisplay}
        </div>
      </div>

      <div>
        <div className="text-small text-fg-muted">At work</div>
        <div className="text-h2 font-semibold font-numeric tabular-nums text-fg leading-tight">
          {atWorkDisplay}
        </div>
      </div>

      <div>
        <div className="text-small text-fg-muted">Logged</div>
        <div className="text-h2 font-semibold font-numeric tabular-nums text-accent-text leading-tight">
          {loggedDisplay}
        </div>
      </div>

      <div>
        <div className="text-small text-fg-muted">Remaining</div>
        <div className="text-h2 font-semibold font-numeric tabular-nums text-fg leading-tight">
          {remainingDisplay}
        </div>
      </div>

      {/* Progress Bar & Caption */}
      <div className="flex-1 min-w-[180px]">
        <div className="h-2 rounded-full bg-subtle overflow-hidden relative">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="text-small text-fg-muted mt-1.5 font-numeric">
          Logged {loggedDisplay} of {formatTrackerHours(timeAtWorkHours || expectedHours)} at work so far
        </div>
      </div>
    </div>
  );
};
