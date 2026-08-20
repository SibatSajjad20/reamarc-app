/** Official live attendance start (PKT). */
export const ATTENDANCE_GO_LIVE_DATE = '2026-08-21';

/** Dates allowed only while testing before midnight on go-live day. */
export const ATTENDANCE_TEST_START_DATE = '2026-08-19';

export function toIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 19 Aug until the local calendar hits 21 Aug; 21 Aug afterwards.
 * Prefer the value from GET /attendance/config when the API is available.
 */
export function getAttendanceMinDate(now: Date = new Date()): string {
  const today = toIsoDate(now);
  return today >= ATTENDANCE_GO_LIVE_DATE ? ATTENDANCE_GO_LIVE_DATE : ATTENDANCE_TEST_START_DATE;
}

export function getAugust2026StartDay(now: Date = new Date()): number {
  return Number(getAttendanceMinDate(now).slice(-2));
}
