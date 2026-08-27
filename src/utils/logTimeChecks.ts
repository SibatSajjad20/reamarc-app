export function parseTimeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes >= 60 || hours < 0) return null;
  return hours * 60 + minutes;
}

export function hoursFromStartEnd(start?: string | null, end?: string | null): number | null {
  const startM = parseTimeToMinutes(start);
  const endM = parseTimeToMinutes(end);
  if (startM === null || endM === null) return null;
  let finish = endM;
  if (finish <= startM) finish += 24 * 60;
  return Math.round(((finish - startM) / 60) * 100) / 100;
}

export function formatHours(hours: number): string {
  const safe = Math.max(0, hours);
  const h = Math.floor(safe);
  const m = Math.round((safe - h) * 60);
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatSignedHours(hours: number): string {
  if (Math.abs(hours) < 0.01) return '0h';
  const sign = hours > 0 ? '+' : '−';
  return `${sign}${formatHours(Math.abs(hours))}`;
}

export interface TimedLogSlice {
  id?: string;
  date?: string;
  start_time?: string | null;
  end_time?: string | null;
  task_description?: string;
  hours_utilized?: number | string;
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const aFinish = aEnd <= aStart ? aEnd + 24 * 60 : aEnd;
  const bFinish = bEnd <= bStart ? bEnd + 24 * 60 : bEnd;
  return aStart < bFinish && bStart < aFinish;
}

export function findOverlap(
  candidate: TimedLogSlice,
  existing: TimedLogSlice[],
): TimedLogSlice | null {
  const start = parseTimeToMinutes(candidate.start_time);
  const end = parseTimeToMinutes(candidate.end_time);
  if (start === null || end === null) return null;
  for (const row of existing) {
    if (candidate.id && row.id === candidate.id) continue;
    if (candidate.date && row.date && candidate.date !== row.date) continue;
    const otherS = parseTimeToMinutes(row.start_time);
    const otherE = parseTimeToMinutes(row.end_time);
    if (otherS === null || otherE === null) continue;
    if (rangesOverlap(start, end, otherS, otherE)) return row;
  }
  return null;
}

export function findDuplicate(
  candidate: TimedLogSlice,
  existing: TimedLogSlice[],
): TimedLogSlice | null {
  const task = (candidate.task_description || '').trim().toLowerCase();
  const hours = Number(candidate.hours_utilized || 0);
  if (!task) return null;
  for (const row of existing) {
    if (candidate.id && row.id === candidate.id) continue;
    if (candidate.date && row.date && candidate.date !== row.date) continue;
    const otherTask = (row.task_description || '').trim().toLowerCase();
    const otherHours = Number(row.hours_utilized || 0);
    if (otherTask === task && Math.round(otherHours * 100) === Math.round(hours * 100)) {
      return row;
    }
  }
  return null;
}

export function uncoveredShiftHours(
  shiftStart?: string | null,
  shiftEnd?: string | null,
  breakMinutes: number = 60,
  blocks: TimedLogSlice[] = [],
): number {
  const start = parseTimeToMinutes(shiftStart);
  let end = parseTimeToMinutes(shiftEnd);
  if (start === null || end === null) return 0;
  if (end <= start) end += 24 * 60;
  const expected = Math.max(0, end - start - breakMinutes);
  const intervals: Array<[number, number]> = [];
  for (const block of blocks) {
    const s = parseTimeToMinutes(block.start_time);
    let e = parseTimeToMinutes(block.end_time);
    if (s === null || e === null) continue;
    if (e <= s) e += 24 * 60;
    intervals.push([Math.max(s, start), Math.min(e, end)]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = start;
  for (const [s, e] of intervals) {
    if (e <= cursor) continue;
    const from = Math.max(s, cursor);
    if (e > from) {
      covered += e - from;
      cursor = e;
    }
  }
  const gap = Math.max(0, expected - covered);
  return Math.round((gap / 60) * 100) / 100;
}

export type VarianceReasonOption = {
  value: string;
  label: string;
};

export const VARIANCE_REASONS: VarianceReasonOption[] = [
  { value: 'leave', label: 'Leave' },
  { value: 'late_arrival', label: 'Late arrival' },
  { value: 'early_departure', label: 'Early departure' },
  { value: 'client_meeting', label: 'Client meeting' },
  { value: 'training', label: 'Training' },
  { value: 'internal_meeting', label: 'Internal meeting' },
  { value: 'business_development', label: 'Business development' },
  { value: 'technical_downtime', label: 'Technical downtime' },
  { value: 'approved_overtime', label: 'Approved overtime' },
  { value: 'other_approved', label: 'Other approved reason' },
  { value: 'unexplained', label: 'Unexplained' },
];

export function isLogDateExpired(
  targetDateStr: string,
  holidays: Set<string> = new Set(),
  workingSaturdays: Set<string> = new Set(),
  shiftStartTime: string = '09:30',
  now: Date = new Date(),
): boolean {
  if (!targetDateStr) return true;
  const [y, m, d] = targetDateStr.split('-').map(Number);
  if (!y || !m || !d) return true;

  const [sh, sm] = (shiftStartTime || '09:30').split(':').map(Number);
  const startHour = Number.isNaN(sh) ? 9 : sh;
  const startMin = Number.isNaN(sm) ? 30 : sm;

  // Count 2 full working days forward from target date
  let workingDaysCounted = 0;
  const checkDate = new Date(y, m - 1, d + 1);

  for (let i = 0; i < 14; i++) {
    const iso = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    
    // Check if checkDate is an off day
    const weekday = checkDate.getDay(); // 0 is Sun, 6 is Sat
    const isSunday = weekday === 0;
    const isFirstSaturday = weekday === 6 && checkDate.getDate() <= 7 && !workingSaturdays.has(iso);
    const isHoliday = holidays.has(iso);
    const isOff = isSunday || isFirstSaturday || isHoliday;

    if (!isOff) {
      workingDaysCounted += 1;
      if (workingDaysCounted === 2) {
        break;
      }
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }

  const windowEndDate = new Date(
    checkDate.getFullYear(),
    checkDate.getMonth(),
    checkDate.getDate(),
    startHour,
    startMin,
    0,
    0,
  );

  return now.getTime() > windowEndDate.getTime();
}

export function isLogDateNotStarted(
  targetDateStr: string,
  shiftStartTime: string = '09:30',
  now: Date = new Date(),
): boolean {
  if (!targetDateStr) return false;
  const [y, m, d] = targetDateStr.split('-').map(Number);
  if (!y || !m || !d) return false;

  const [sh, sm] = (shiftStartTime || '09:30').split(':').map(Number);
  const startHour = Number.isNaN(sh) ? 9 : sh;
  const startMin = Number.isNaN(sm) ? 30 : sm;

  const windowStartDate = new Date(y, m - 1, d, startHour, startMin, 0, 0);
  return now.getTime() < windowStartDate.getTime();
}

export function getOldestOpenLogDate(
  holidays: Set<string> = new Set(),
  workingSaturdays: Set<string> = new Set(),
  shiftStartTime: string = '09:30',
  now: Date = new Date(),
): string {
  let candidate = new Date(now);
  let oldest = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (let i = 0; i < 14; i++) {
    const iso = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
    const expired = isLogDateExpired(iso, holidays, workingSaturdays, shiftStartTime, now);
    if (!expired) {
      oldest = iso;
    }
    candidate.setDate(candidate.getDate() - 1);
  }
  return oldest;
}

