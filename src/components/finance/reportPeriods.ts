import type { ReportPeriod } from '../../types/finance';

export const REPORT_PERIODS: { value: ReportPeriod; label: string; unit: string; months: number; count: number }[] = [
  { value: 'monthly', label: 'Monthly', unit: 'month', months: 1, count: 12 },
  { value: 'quarterly', label: 'Quarterly (3 months)', unit: 'quarter', months: 3, count: 8 },
  { value: 'semiannual', label: 'Semi-annual (6 months)', unit: 'half-year', months: 6, count: 6 },
  { value: 'yearly', label: 'Yearly', unit: 'year', months: 12, count: 5 },
];

export function periodMeta(period: ReportPeriod) {
  return REPORT_PERIODS.find((p) => p.value === period) || REPORT_PERIODS[0];
}

export function parsePeriod(value: string | null | undefined): ReportPeriod {
  return REPORT_PERIODS.some((p) => p.value === value) ? (value as ReportPeriod) : 'monthly';
}

/** Last N whole periods ending today: 12 months, 8 quarters, 6 half-years or 5 years. */
export function defaultTrendRange(period: ReportPeriod = 'monthly', now = new Date()): { from: string; to: string } {
  const meta = periodMeta(period);
  const to = now.toISOString().split('T')[0];
  const periodStartMonth = Math.floor(now.getUTCMonth() / meta.months) * meta.months;
  const fromDate = new Date(
    Date.UTC(now.getUTCFullYear(), periodStartMonth - (meta.count - 1) * meta.months, 1),
  );
  return { from: fromDate.toISOString().split('T')[0], to };
}

export function readPeriodFromUrl(): ReportPeriod {
  if (typeof window === 'undefined') return 'monthly';
  return parsePeriod(new URLSearchParams(window.location.search).get('period'));
}

export function writePeriodToUrl(period: ReportPeriod): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (period === 'monthly') params.delete('period');
  else params.set('period', period);
  const qs = params.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
  );
}

export function runRatePctClass(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || pct === 0) return 'text-fg-muted';
  return pct > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300';
}
