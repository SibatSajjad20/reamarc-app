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

export function getPktNowParts(now: Date = new Date()): { date: string; hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** True when `dateStr` + `HH:MM` is still ahead of current Pakistan time. */
export function isFuturePktClockTime(dateStr: string, timeHhmm: string, now: Date = new Date()): boolean {
  if (!dateStr || !/^\d{2}:\d{2}$/.test(timeHhmm)) return false;
  const pkt = getPktNowParts(now);
  if (dateStr > pkt.date) return true;
  if (dateStr < pkt.date) return false;
  const [h, m] = timeHhmm.split(':').map(Number);
  return h * 60 + m > pkt.hour * 60 + pkt.minute;
}
