/** Same hour formatting as the web log compliance screen. */
export function formatHours(hours: number): string {
  const totalMinutes = Math.round(Math.max(0, hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatSignedHours(hours: number): string {
  if (Math.abs(hours) < 0.01) return '0h';
  const sign = hours > 0 ? '+' : '−';
  return `${sign}${formatHours(Math.abs(hours))}`;
}

export type OverviewRange = 'today' | 'week' | 'month' | 'range';

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(now = new Date()): string {
  return toIsoDate(now);
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

/** Monday of the week containing iso. Sunday belongs to the previous Monday. */
export function mondayOf(iso: string): string {
  const date = parseIso(iso);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return toIsoDate(date);
}

export function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Month window through today, so future days are not counted as missed. */
export function monthBounds(anchorIso: string, today = todayIso()): { start: string; end: string } {
  const [y, m] = anchorIso.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(y, m, 0);
  let end = toIsoDate(last);
  if (end > today) end = today;
  if (start > end) return { start: today, end: today };
  return { start, end };
}

export function shiftMonth(anchorIso: string, delta: number): string {
  const [y, m] = anchorIso.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1 + delta, 1));
}

/**
 * Query string for GET /log-exceptions/snapshot.
 * today and week match the web compliance screen.
 * month and custom range use the same range=range path as the web date picker.
 */
export function snapshotSearch(args: {
  mode: OverviewRange;
  anchor: string;
  start?: string;
  end?: string;
  today?: string;
}): string {
  const today = args.today || todayIso();
  if (args.mode === 'today') {
    const date = args.anchor > today ? today : args.anchor;
    return `?date=${date}&range=today`;
  }
  if (args.mode === 'week') {
    return `?date=${mondayOf(args.anchor)}&range=week`;
  }
  if (args.mode === 'month') {
    const bounds = monthBounds(args.anchor, today);
    return `?range=range&start_date=${bounds.start}&end_date=${bounds.end}`;
  }
  let start = args.start || args.anchor;
  let end = args.end || args.anchor;
  if (start > today) start = today;
  if (end > today) end = today;
  if (start > end) {
    const swap = start;
    start = end;
    end = swap;
  }
  return `?range=range&start_date=${start}&end_date=${end}`;
}

export interface SnapshotException {
  id: string;
  user_id: string;
  date: string;
  full_name: string;
  department?: string | null;
  role?: string;
  exception_type?: string;
  message?: string;
  signed_gap_hours?: number;
  worked_hours?: number;
  logged_hours?: number;
  is_missing_log?: boolean;
  compare_ready?: boolean;
  action_status?: string;
  employee_notified?: boolean;
  escalated?: boolean;
  severity?: string;
}

export interface SnapshotPerson {
  user_id: string;
  full_name: string;
  department?: string | null;
  role?: string;
  logged: boolean;
  worked_hours: number;
  logged_hours: number;
  gap_hours: number;
  signed_gap_hours?: number;
  has_open_request?: boolean;
  has_checkin?: boolean;
  has_checkout?: boolean;
  due?: boolean;
  is_full_leave?: boolean;
}

export interface SnapshotDepartment {
  name: string;
  total: number;
  logged: number;
  missing: number;
  worked_hours: number;
  logged_hours: number;
}

export interface LogSnapshot {
  date: string;
  range?: string;
  start_date?: string;
  end_date?: string;
  employees_expected: number;
  logs_submitted: number;
  compliance_pct: number;
  logged_hours: number;
  worked_hours?: number;
  unallocated_hours?: number;
  exception_count: number;
  summary?: string;
  missed_workdays?: number;
  top_exceptions?: SnapshotException[];
  hr_exceptions?: SnapshotException[];
  departments?: SnapshotDepartment[];
  people?: SnapshotPerson[];
}

export type PersonStatus = 'logged' | 'missing' | 'in_shift' | 'awaiting' | 'on_leave' | 'not_started';

export type LiveShift = 'in_shift' | 'awaiting' | 'checked_out' | 'leave' | 'off';

export interface LiveAttendanceRow {
  user_id?: string;
  check_in?: string | null;
  check_out?: string | null;
  punch_in?: string | null;
  punch_out?: string | null;
  status?: string | null;
  status_badge?: string | null;
}

/**
 * Same signal as the home attendance register: a punch in with no punch out
 * means the shift is still going. Missed punch is not an open shift.
 */
export function liveShiftFromMatrix(row?: LiveAttendanceRow | null): LiveShift | null {
  if (!row) return null;
  const status = String(row.status || '').toLowerCase();
  const badge = String(row.status_badge || '').toLowerCase();
  const cin = String(row.check_in || row.punch_in || '').trim();
  const cout = String(row.check_out || row.punch_out || '').trim();
  if (
    ['on_leave', 'sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave'].includes(status) ||
    badge === 'leave' ||
    badge === 'annual leave' ||
    badge === 'sick leave'
  ) {
    return 'leave';
  }
  if (['holiday', 'sunday_off', 'first_saturday_off', 'weekend_off'].includes(status)) return 'off';
  if (status === 'missed_punch' || badge === 'missed punch') return 'checked_out';
  if (cin && !cout) return 'in_shift';
  if (cout) return 'checked_out';
  if (status === 'awaiting_checkin' || badge === 'awaiting' || !cin) return 'awaiting';
  return 'checked_out';
}

/**
 * A live attendance row wins over the log snapshot. The snapshot's check-in flag
 * is not the home register, and its checkout flag is true for any day in the range.
 */
export function personStatus(
  person: SnapshotPerson,
  opts: { periodEnded: boolean; includesToday: boolean; live?: LiveShift | null },
): PersonStatus {
  if (opts.live === 'in_shift') return 'in_shift';
  if (person.is_full_leave || opts.live === 'leave') return 'on_leave';
  if (opts.live == null && person.has_checkin && !opts.periodEnded) return 'in_shift';
  if (person.logged && opts.live !== 'awaiting') return 'logged';
  const comparable =
    opts.live === 'checked_out' ||
    opts.periodEnded ||
    Boolean(person.has_checkout) ||
    (person.worked_hours > 0 && !person.has_checkin);
  if (!person.logged && person.due && comparable && opts.live !== 'awaiting') return 'missing';
  if ((opts.live === 'awaiting' || (opts.live == null && !person.has_checkin && person.worked_hours <= 0)) && opts.includesToday && !opts.periodEnded) {
    return 'awaiting';
  }
  if (person.due) return 'missing';
  return 'not_started';
}

export function isMissingLog(item: SnapshotException): boolean {
  return Boolean(item.is_missing_log || item.exception_type === 'missing_log');
}

/** Same labels as the web exception inbox. */
export function exceptionReviewLabel(item: SnapshotException): string {
  if (item.action_status === 'waiting_on_reviewer') return 'Reason submitted';
  if (item.action_status === 'waiting_on_employee' || item.employee_notified) return 'Awaiting employee';
  if (item.escalated || item.action_status === 'escalated') return 'Sent to HR';
  if (item.action_status === 'reviewed' || item.action_status === 'cleared') return 'Resolved';
  return 'Needs review';
}

/** Same detail line as the web exception inbox. */
export function exceptionDetail(item: SnapshotException): string {
  if (item.compare_ready === false) return 'No punch-out';
  if (isMissingLog(item)) return `No log · at work ${formatHours(item.worked_hours || 0)}`;
  return `Gap ${formatSignedHours(item.signed_gap_hours || 0)}`;
}

/** Drop days that have not happened yet. The web inbox only returns elapsed workdays. */
export function exceptionInWindow(item: SnapshotException, start: string, end: string, today: string): boolean {
  const date = String(item.date || '');
  if (!date) return false;
  const last = end > today ? today : end;
  return date >= start && date <= last;
}

export function coveragePercent(loggedHours: number, workedHours: number): number {
  if (workedHours > 0) return Math.min(100, Math.round((loggedHours / workedHours) * 100));
  return loggedHours > 0 ? 100 : 0;
}
