import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import type { DayTarget } from '../../types/dailyLog';
import { formatHours } from '../../utils/logTimeChecks';

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
}

function parseHhMm(value?: string | null): { h: number; m: number } | null {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || m >= 60 || h < 0) return null;
  return { h, m };
}

function liveElapsedHours(dateStr: string, checkIn: string, nowMs: number): number {
  const cin = parseHhMm(checkIn);
  if (!cin) return 0;
  const [y, mo, d] = dateStr.split('-').map(Number);
  if (!y || !mo || !d) return 0;
  let start = new Date(y, mo - 1, d, cin.h, cin.m, 0, 0).getTime();
  if (nowMs < start) {
    start -= 24 * 60 * 60 * 1000;
  }
  return Math.max(0, (nowMs - start) / 3_600_000);
}

function formatTrackerHours(hours: number): string {
  if (hours <= 0) return '0m';
  return formatHours(hours);
}

/**
 * Compact header pill: Time at Work · Logged · Gap.
 * Returns null when there is nothing useful to show (unless loading).
 */
export const ShiftTasksTracker: React.FC<ShiftTasksTrackerProps> = ({
  dayTarget,
  loggedHours: loggedHoursProp,
  loading = false,
  className = '',
}) => {
  const hasCheckin = Boolean(dayTarget?.has_checkin);
  const hasCheckout = Boolean(dayTarget?.has_checkout);
  const stillIn = hasCheckin && !hasCheckout;
  const isWfh = Boolean(dayTarget?.is_wfh);
  const isFullLeave = Boolean(dayTarget?.is_full_leave);

  const visible =
    Boolean(dayTarget) &&
    !isFullLeave &&
    (hasCheckin || isWfh);

  const [nowTick, setNowTick] = useState(() => Date.now());
  const liveBaseRef = useRef<{ atMs: number; hours: number } | null>(null);

  useEffect(() => {
    if (!visible || !stillIn || !dayTarget) {
      liveBaseRef.current = null;
      return;
    }
    // Prefer server PKT baseline so the live clock is timezone-safe.
    const apiHours = Number(dayTarget.time_at_work_hours);
    const baseHours =
      Number.isFinite(apiHours) && apiHours >= 0
        ? apiHours
        : dayTarget.check_in && dayTarget.date
          ? liveElapsedHours(dayTarget.date, dayTarget.check_in, Date.now())
          : 0;
    liveBaseRef.current = { atMs: Date.now(), hours: baseHours };
    setNowTick(Date.now());
  }, [visible, stillIn, dayTarget?.date, dayTarget?.check_in, dayTarget?.time_at_work_hours]);

  useEffect(() => {
    if (!visible || !stillIn) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [visible, stillIn, dayTarget?.date, dayTarget?.check_in]);

  const loggedHours = useMemo(() => {
    if (typeof loggedHoursProp === 'number' && Number.isFinite(loggedHoursProp)) {
      return Math.max(0, loggedHoursProp);
    }
    return Math.max(0, Number(dayTarget?.logged_hours) || 0);
  }, [loggedHoursProp, dayTarget?.logged_hours]);

  const timeAtWorkHours = useMemo(() => {
    if (!dayTarget) return 0;
    if (stillIn) {
      const base = liveBaseRef.current;
      if (base) {
        return Math.max(0, base.hours + (nowTick - base.atMs) / 3_600_000);
      }
      if (dayTarget.check_in && dayTarget.date) {
        return liveElapsedHours(dayTarget.date, dayTarget.check_in, nowTick);
      }
    }
    const fromApi = Number(dayTarget.time_at_work_hours);
    if (Number.isFinite(fromApi) && fromApi > 0) return fromApi;
    const worked = Number(dayTarget.worked_hours);
    if (Number.isFinite(worked) && worked > 0) return worked;
    if (isWfh && !hasCheckin) return Math.max(0, Number(dayTarget.expected_hours) || 0);
    return 0;
  }, [dayTarget, stillIn, nowTick, isWfh, hasCheckin]);

  const gapHours = Math.max(0, timeAtWorkHours - loggedHours);

  if (loading) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 shrink-0 h-7 px-2.5 rounded-full border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50 dark:bg-zinc-900/80 ${className}`}
        aria-busy="true"
        aria-label="Loading shift hours"
      >
        <span className="w-3 h-3 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse shrink-0" />
        <span className="h-2.5 w-10 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        <span className="h-2 w-1 rounded bg-zinc-200/80 dark:bg-zinc-700/80" />
        <span className="h-2.5 w-8 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        <span className="h-2 w-1 rounded bg-zinc-200/80 dark:bg-zinc-700/80" />
        <span className="h-2.5 w-12 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
      </div>
    );
  }

  if (!visible || !dayTarget) return null;

  const gapTone =
    gapHours > 0.02
      ? gapHours >= 0.5
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-amber-600 dark:text-amber-400'
      : 'text-zinc-400 dark:text-zinc-500';

  const shellTone =
    gapHours > 0.02
      ? gapHours >= 0.5
        ? 'border-rose-200/80 dark:border-rose-800/40 bg-rose-50/60 dark:bg-rose-950/20'
        : 'border-amber-200/80 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/20'
      : loggedHours > 0
        ? 'border-emerald-200/80 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20'
        : 'border-zinc-200 dark:border-zinc-700/80 bg-zinc-50 dark:bg-zinc-900/80';

  const title = `Time at work ${formatTrackerHours(timeAtWorkHours)} · Logged ${
    loggedHours > 0 ? formatTrackerHours(loggedHours) : '0m'
  } · Gap ${gapHours > 0.02 ? formatTrackerHours(gapHours) : 'none'}`;

  return (
    <div
      title={title}
      className={`inline-flex items-center gap-1.5 shrink-0 h-7 max-w-full px-2.5 rounded-full border text-[11px] font-bold tabular-nums shadow-2xs ${shellTone} ${className}`}
    >
      <Timer className="w-3 h-3 text-indigo-500 shrink-0 opacity-90" />
      <span className="text-zinc-800 dark:text-zinc-100 whitespace-nowrap">
        {formatTrackerHours(timeAtWorkHours)}
      </span>
      <span className="text-zinc-300 dark:text-zinc-600 select-none" aria-hidden>
        ·
      </span>
      <span className="text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
        {loggedHours > 0 ? formatTrackerHours(loggedHours) : '0m'}
      </span>
      <span className="text-zinc-300 dark:text-zinc-600 select-none" aria-hidden>
        ·
      </span>
      <span className={`${gapTone} whitespace-nowrap`}>
        {gapHours > 0.02 ? `${formatTrackerHours(gapHours)} gap` : 'caught up'}
      </span>
    </div>
  );
};
