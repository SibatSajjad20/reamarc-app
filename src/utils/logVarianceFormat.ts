/**
 * Display formatters for Log Variance numbers and tones.
 * All functions operate purely on display presentation.
 */

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes)) return '—';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;

  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function formatSignedMinutes(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes)) return '—';
  const rounded = Math.round(minutes);
  if (rounded === 0) return '0m';
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${formatMinutes(Math.abs(rounded))}`;
}

export function formatPercentage(pct: number | null | undefined, decimals: number = 0): string {
  if (pct == null || isNaN(pct)) return '—';
  return `${pct.toFixed(decimals)}%`;
}

export type VarianceTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * §4.6 Tone rules:
 * - per-day variance |v| <= 30 -> success; 31–60 -> warning; > 60 -> danger; v < -30 -> info (blue).
 * - range rows use variance ÷ days_present.
 */
export function getVarianceTone(
  varianceMinutes: number | null | undefined,
  daysPresent: number = 1
): VarianceTone {
  if (varianceMinutes == null || isNaN(varianceMinutes) || daysPresent <= 0) {
    return 'neutral';
  }
  const v = varianceMinutes / Math.max(1, daysPresent);
  if (v < -30) return 'info';
  if (Math.abs(v) <= 30) return 'success';
  if (v <= 60) return 'warning';
  return 'danger';
}

export type CoverageTone = 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Coverage target 95%: >=95 success, otherwise warning (danger below 80).
 */
export function getCoverageTone(coveragePct: number | null | undefined): CoverageTone {
  if (coveragePct == null || isNaN(coveragePct)) return 'neutral';
  if (coveragePct >= 95) return 'success';
  if (coveragePct >= 80) return 'warning';
  return 'danger';
}

export function getToneBadgeClass(tone: VarianceTone | CoverageTone): string {
  switch (tone) {
    case 'success':
      return 'bg-success-bg text-success-fg border-success-bd';
    case 'warning':
      return 'bg-warning-bg text-warning-fg border-warning-bd';
    case 'danger':
      return 'bg-danger-bg text-danger-fg border-danger-bd';
    case 'info':
      return 'bg-info-bg text-info-fg border-info-bd';
    default:
      return 'bg-muted-bg text-fg-muted border-border';
  }
}

export function getToneTextClass(tone: VarianceTone | CoverageTone): string {
  switch (tone) {
    case 'success':
      return 'text-success-fg';
    case 'warning':
      return 'text-warning-fg';
    case 'danger':
      return 'text-danger-fg';
    case 'info':
      return 'text-info-fg';
    default:
      return 'text-fg-muted';
  }
}

/**
 * PKT (Asia/Karachi) date helpers (§2.9.2).
 * Computes calendar date strings in Asia/Karachi independent of the browser's local timezone.
 */
export function pktTodayIso(refDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(refDate);
}

/**
 * Returns Monday and Saturday for the week containing reference date in PKT (week Mon–Sat).
 */
export function pktWeekBounds(refDate: Date = new Date()): { start: string; end: string } {
  const todayStr = pktTodayIso(refDate);
  const [y, m, d] = todayStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = utcDate.getUTCDay();
  const distToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(Date.UTC(y, m - 1, d - distToMonday));
  const saturday = new Date(Date.UTC(y, m - 1, d - distToMonday + 5));

  const formatUtc = (dt: Date) => dt.toISOString().slice(0, 10);
  return {
    start: formatUtc(monday),
    end: formatUtc(saturday),
  };
}

/**
 * Returns first and last day of the month containing reference date in PKT.
 */
export function pktMonthBounds(refDate: Date = new Date()): { start: string; end: string } {
  const todayStr = pktTodayIso(refDate);
  const [y, m] = todayStr.split('-').map(Number);
  const firstDay = new Date(Date.UTC(y, m - 1, 1));
  const lastDay = new Date(Date.UTC(y, m, 0));

  const formatUtc = (dt: Date) => dt.toISOString().slice(0, 10);
  return {
    start: formatUtc(firstDay),
    end: formatUtc(lastDay),
  };
}

/**
 * Shifts a date range [start, end] by its duration in days forwards (direction > 0) or backwards (direction < 0).
 */
export function shiftDateRange(start: string, end: string, direction: number): { start: string; end: string } {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const sDate = new Date(Date.UTC(sy, sm - 1, sd));
  const eDate = new Date(Date.UTC(ey, em - 1, ed));
  const diffDays = Math.round((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const shiftDays = diffDays * (direction >= 0 ? 1 : -1);

  const newS = new Date(Date.UTC(sy, sm - 1, sd + shiftDays));
  const newE = new Date(Date.UTC(ey, em - 1, ed + shiftDays));
  const formatUtc = (dt: Date) => dt.toISOString().slice(0, 10);
  return {
    start: formatUtc(newS),
    end: formatUtc(newE),
  };
}

