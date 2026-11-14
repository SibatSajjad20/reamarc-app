export interface DateRangeInfo {
  start: string;
  end: string;
  today_included: boolean;
  today: string;
}

export interface LiveHours {
  worked: number;
  logged: number;
  variance: number;
}

export interface LogVarianceAggregates {
  days_present: number;
  days_absent: number;
  days_scheduled: number;
  worked: number;
  logged: number;
  variance: number;
  coverage_pct: number | null;
  avg_logged_per_present_day: number | null;
  avg_logged_per_day?: number | null;
  avg_worked_per_present_day: number | null;
  avg_worked_per_day?: number | null;
  days_no_log: number;
  days_under_target: number;
  days_outside_hours: number;
  submission_pct: number | null;
  pending_ot?: number;
  scheduled_complete_logged?: number;
  scheduled_complete_days?: number;
  tasks_completed?: number | null;
  today_live?: LiveHours | null;
}

export interface LogVarianceSummary extends LogVarianceAggregates {
  people: number;
  open_exceptions: number;
  today_live: LiveHours;
}

export interface LogVarianceDayDetail {
  date: string;
  status: string;
  status_label: string;
  check_in: string | null;
  check_out: string | null;
  worked: number;
  pending_ot: number;
  expected: number;
  logged: number;
  variance: number;
  coverage_pct: number | null;
  tone: string;
  flags: string[];
  entries_count: number;
  compare_ready: boolean;
}

export interface EmployeeDetailResponse {
  user: {
    user_id: string;
    name: string;
    department?: string | null;
    role: string;
    inactive?: boolean;
    deactivation_date?: string | null;
  };
  summary: LogVarianceAggregates;
  days: LogVarianceDayDetail[];
  today_live?: LiveHours | null;
  range?: DateRangeInfo | null;
}

export interface LogVarianceResponse {
  range: DateRangeInfo;
  generated_at: string;
  summary: LogVarianceSummary;
  rows: any[];
}

export type UnifiedVarianceData = {
  summary: LogVarianceAggregates;
  today_live?: LiveHours | null;
  range?: DateRangeInfo | null;
  days?: LogVarianceDayDetail[];
};

export type ApiCaller = <T>(endpoint: string) => Promise<T>;

let _defaultApi: ApiCaller | null = null;

export function setLogVarianceApi(caller: ApiCaller): void {
  _defaultApi = caller;
}

/**
 * Format minutes into display string, e.g. 8h 09m, 8h, 45m, 0m.
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

/**
 * Format minutes with explicit sign, e.g. +1h 30m, -45m, 0m.
 */
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
 * Tone rules:
 * - per-day variance |v| <= 30 -> success; 31–60 -> warning; > 60 -> danger; v < -30 -> info (blue).
 * - range totals divide variance by days_present.
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

export function getCoverageTone(coveragePct: number | null | undefined): CoverageTone {
  if (coveragePct == null || isNaN(coveragePct)) return 'neutral';
  if (coveragePct >= 95) return 'success';
  if (coveragePct >= 80) return 'warning';
  return 'danger';
}

/**
 * PKT (Asia/Karachi) date helpers.
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

/**
 * Typed client for log variance:
 * - single employee / self: GET /log-variance/employee/{id}?start_date=...&end_date=...
 * - team view: GET /log-variance?start_date=...&end_date=...
 */
export async function fetchLogVariance(
  startDate: string,
  endDate: string,
  userId?: string | null,
  apiCaller?: ApiCaller,
): Promise<UnifiedVarianceData> {
  let caller = apiCaller || _defaultApi;
  if (!caller) {
    try {
      const mod = await import('./api');
      caller = mod.api;
    } catch {
      throw new Error('API client not available for log variance');
    }
  }

  if (userId) {
    const res = await caller<EmployeeDetailResponse>(
      `/log-variance/employee/${userId}?start_date=${startDate}&end_date=${endDate}`
    );
    const summary = {
      ...res.summary,
      avg_logged_per_present_day: res.summary.avg_logged_per_present_day ?? (res.summary as any).avg_logged_per_day ?? null,
      avg_worked_per_present_day: res.summary.avg_worked_per_present_day ?? (res.summary as any).avg_worked_per_day ?? null,
    };
    const todayLive = res.today_live ?? res.summary?.today_live ?? null;
    return {
      summary,
      today_live: todayLive,
      range: res.range,
      days: res.days,
    };
  } else {
    const res = await caller<LogVarianceResponse>(
      `/log-variance?start_date=${startDate}&end_date=${endDate}`
    );
    const summary = {
      ...res.summary,
      avg_logged_per_present_day: res.summary.avg_logged_per_present_day ?? (res.summary as any).avg_logged_per_day ?? null,
      avg_worked_per_present_day: res.summary.avg_worked_per_present_day ?? (res.summary as any).avg_worked_per_day ?? null,
    };
    const todayLive = res.summary?.today_live ?? (res as any)?.today_live ?? null;
    return {
      summary,
      today_live: todayLive,
      range: res.range,
    };
  }
}
