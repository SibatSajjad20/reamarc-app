/**
 * Live / provisional net work hours — mirrors backend attendance_calculator
 * (early punch clipped to shift start; unpaid break overlap excluded).
 * Punch timestamps stay factual; only the duration is net.
 */

export function parseHhMmToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const s = String(value).trim();
  if (s.includes('T')) {
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return d.getHours() * 60 + d.getMinutes();
      }
    } catch {}
  }
  const ampmMatch = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (ampmMatch) {
    let h = Number(ampmMatch[1]);
    const m = Number(ampmMatch[2]);
    const ampm = ampmMatch[3]?.toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    if (Number.isFinite(h) && Number.isFinite(m) && m < 60 && h >= 0 && h < 24) {
      return h * 60 + m;
    }
  }
  const match = s.match(/^(\d{1,2}):(\d{2})/);
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
  /** Provisional or real check-out HH:MM */
  checkOut: string;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  breakDurationMinutes?: number | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  isNightShift?: boolean;
  /** Relaxed / cricket day: count time before shift start. */
  countFromActualCheckIn?: boolean;
}

/** Net work minutes between check-in and check-out with break overlap deducted (paused during break window). */
export function provisionalNetWorkMinutes(input: ProvisionalNetWorkHoursInput): number {
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

  const effectiveCheckIn = input.countFromActualCheckIn
    ? checkInAdjusted
    : Math.max(checkInAdjusted, shiftStartMins);
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

  return Math.max(0, gross - deducted);
}

/** Net work hours between check-in and check-out using attendance rules. */
export function provisionalNetWorkHours(input: ProvisionalNetWorkHoursInput): number {
  const netMins = provisionalNetWorkMinutes(input);
  return Math.round((netMins / 60) * 100) / 100;
}

/** Format current Date as HH:MM for provisional checkout. */
export function formatNowHhMm(now: Date = new Date()): string {
  const h = now.getHours();
  const m = now.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Signed gap: positive = over-logged, negative = under-logged. */
export function signedLogGapHours(loggedHours: number, timeAtWorkHours: number): number {
  return Math.round(((Number(loggedHours) || 0) - (Number(timeAtWorkHours) || 0)) * 100) / 100;
}

/** Tiny tolerance (~1.2 min) for "matched". */
export const LOG_GAP_MATCH_HOURS = 0.02;

export interface ComputeCheckoutGateInput {
  shiftStart?: string | null;
  shiftEnd?: string | null;
  breakDurationMinutes?: number | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  isNightShift?: boolean;
  overtimeBufferMinutes?: number | null;
  undertimeBufferMinutes?: number | null;
  punchIn?: string | null;
  currentTime?: string | null;
  isShortLeave?: boolean;
  countFromActualCheckIn?: boolean;
  skipUndertimeAfter?: string | null;
}

export type CheckoutGateType = 'none' | 'overtime' | 'undertime';

/**
 * Computes checkout gate type ('none' | 'overtime' | 'undertime')
 * Mirrors backend overtime_gate.classify_checkout_gate:
 * 1. Clock time must be past shift end by more than overtime buffer (delta > otBuf).
 * 2. Net effective working hours must exceed shift expected hours by more than the buffer (claimedOvertimeMinutes > otBuf).
 * 3. Make-up time for late arrival first covers the late deficit before counting as overtime.
 * 4. Minor overtime within buffer (e.g. <= 5m) is auto-credited without requiring a reason.
 */
export function computeCheckoutGateType(input: ComputeCheckoutGateInput): CheckoutGateType {
  const shiftEndMins = parseHhMmToMinutes(input.shiftEnd);
  if (shiftEndMins === null) return 'none';
  const nowMins = parseHhMmToMinutes(input.currentTime || formatNowHhMm());
  if (nowMins === null) return 'none';
  const shiftStartMins = parseHhMmToMinutes(input.shiftStart || '09:30') ?? 570;

  const otBuf = Number(input.overtimeBufferMinutes ?? 5);
  const utBuf = Number(input.undertimeBufferMinutes ?? 5);
  const isNight = Boolean(input.isNightShift);
  const crosses = isNight || shiftEndMins <= shiftStartMins;

  const inMins = parseHhMmToMinutes(input.punchIn);
  let endAdjusted = shiftEndMins;
  if (crosses) endAdjusted += 1440;

  let inAdjusted = inMins ?? shiftStartMins;
  if (crosses && inMins !== null && inMins < shiftStartMins - 360) {
    inAdjusted += 1440;
  }

  let outAdjusted = nowMins;
  if (crosses) {
    if (outAdjusted < inAdjusted) outAdjusted += 1440;
  } else {
    if (outAdjusted < inAdjusted) outAdjusted += 1440;
  }

  const delta = outAdjusted - endAdjusted;
  const span = endAdjusted - shiftStartMins;
  const unpaidBreak = Math.max(0, Math.floor(Number(input.breakDurationMinutes) || 0));
  const expectedWorkMinutes = Math.max(0, span - unpaidBreak);

  let claimedOvertimeMinutes = 0;
  let claimedUndertimeMinutes = 0;

  if (input.punchIn) {
    const netMinutes = provisionalNetWorkMinutes({
      checkIn: input.punchIn,
      checkOut: input.currentTime || formatNowHhMm(),
      shiftStart: input.shiftStart,
      shiftEnd: input.shiftEnd,
      breakDurationMinutes: unpaidBreak,
      breakStart: input.breakStart,
      breakEnd: input.breakEnd,
      isNightShift: isNight,
      countFromActualCheckIn: input.countFromActualCheckIn,
    });
    const workVariance = netMinutes - expectedWorkMinutes;
    if (delta > 0) {
      claimedOvertimeMinutes = Math.max(0, Math.min(delta, workVariance));
      claimedUndertimeMinutes = Math.max(0, expectedWorkMinutes - netMinutes);
    } else {
      claimedOvertimeMinutes = 0;
      claimedUndertimeMinutes = Math.max(0, expectedWorkMinutes - netMinutes);
    }
  }

  if (delta > otBuf && claimedOvertimeMinutes > otBuf) {
    return 'overtime';
  }
  const leaveFromMins = parseHhMmToMinutes(input.skipUndertimeAfter);
  if (leaveFromMins !== null && outAdjusted >= leaveFromMins) {
    claimedUndertimeMinutes = 0;
  }
  if (
    !input.isShortLeave
    && !(leaveFromMins !== null && outAdjusted >= leaveFromMins)
    && delta < -utBuf
    && claimedUndertimeMinutes > utBuf
  ) {
    return 'undertime';
  }
  return 'none';
}

