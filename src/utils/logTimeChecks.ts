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
