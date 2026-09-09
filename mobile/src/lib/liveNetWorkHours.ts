/**
 * Live / provisional net work hours — mirrors backend attendance_calculator
 * (early punch clipped to shift start; unpaid break overlap excluded).
 */

export function parseHhMmToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || m >= 60 || h < 0) return null;
  return h * 60 + m;
}

function resolveBreakWindow(opts: {
  shiftStartMins: number;
  shiftEndMins: number;
  breakDurationMinutes: number;
  breakStart?: string | null;
  breakEnd?: string | null;
  isNightShift?: boolean;
}): { start: number; end: number } | null {
  const duration = Math.max(0, Math.floor(opts.breakDurationMinutes || 0));
  if (duration <= 0) return null;

  let endM = opts.shiftEndMins;
  const crosses = Boolean(opts.isNightShift) || endM <= opts.shiftStartMins;
  if (crosses) endM += 1440;

  if (opts.breakStart && opts.breakEnd) {
    let bStart = parseHhMmToMinutes(opts.breakStart);
    let bEnd = parseHhMmToMinutes(opts.breakEnd);
    if (bStart === null || bEnd === null) return null;
    if (bEnd <= bStart) bEnd += 1440;
    if (crosses && bStart < opts.shiftStartMins - 360) {
      bStart += 1440;
      bEnd += 1440;
    }
    return { start: bStart, end: bEnd };
  }

  const mid = opts.shiftStartMins + Math.floor(Math.max(0, endM - opts.shiftStartMins) / 2);
  const half = Math.floor(duration / 2);
  return { start: mid - half, end: mid - half + duration };
}

function intervalOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export interface ProvisionalNetWorkHoursInput {
  checkIn: string;
  checkOut: string;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  breakDurationMinutes?: number | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  isNightShift?: boolean;
}

export function provisionalNetWorkHours(input: ProvisionalNetWorkHoursInput): number {
  const checkInMins = parseHhMmToMinutes(input.checkIn);
  const checkOutMins = parseHhMmToMinutes(input.checkOut);
  if (checkInMins === null || checkOutMins === null) return 0;

  const shiftStartMins = parseHhMmToMinutes(input.shiftStart || '09:30') ?? 570;
  const shiftEndMins = parseHhMmToMinutes(input.shiftEnd || '18:30') ?? 1110;
  const unpaid = Math.max(0, Math.floor(Number(input.breakDurationMinutes) || 0));
  const isNight = Boolean(input.isNightShift);
  const crosses = isNight || shiftEndMins <= shiftStartMins;

  let checkInAdjusted = checkInMins;
  if (crosses && checkInMins < shiftStartMins - 360) {
    checkInAdjusted = checkInMins + 1440;
  }

  let checkOutAdjusted = checkOutMins;
  if (checkOutMins < checkInAdjusted) {
    checkOutAdjusted = checkOutMins + 1440;
  }

  const effectiveCheckIn = Math.max(checkInAdjusted, shiftStartMins);
  const gross = Math.max(0, checkOutAdjusted - effectiveCheckIn);
  if (gross <= 0) return 0;

  const window = resolveBreakWindow({
    shiftStartMins,
    shiftEndMins,
    breakDurationMinutes: unpaid,
    breakStart: input.breakStart,
    breakEnd: input.breakEnd,
    isNightShift: isNight,
  });

  let deducted = 0;
  if (window && unpaid > 0) {
    deducted = Math.min(
      unpaid,
      intervalOverlap(effectiveCheckIn, checkOutAdjusted, window.start, window.end),
    );
  }

  return Math.round((Math.max(0, gross - deducted) / 60) * 100) / 100;
}

export function formatNowHhMm(now: Date = new Date()): string {
  const h = now.getHours();
  const m = now.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function signedLogGapHours(loggedHours: number, timeAtWorkHours: number): number {
  return Math.round(((Number(loggedHours) || 0) - (Number(timeAtWorkHours) || 0)) * 100) / 100;
}

export const LOG_GAP_MATCH_HOURS = 0.02;
