import type { ReportRowStatus, ReportThumb } from '../../../types/contentCalendarReport';
import { safeHttpUrl } from '../../../utils/safeHttpUrl';
import { getBackendFileUrl, getThumbUrl, getVideoStillUrl, isRealThumbnailUrl } from '../../../utils/fileUrl';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11" -> "November 2026" (no timezone maths: these are calendar dates). */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map((v) => parseInt(v, 10));
  if (!y || !m) return month;
  return `${MONTHS[m - 1]} ${y}`;
}

/** "2026-11-05" -> "5 Nov". */
export function shortDate(iso: string): string {
  const [, m, d] = (iso || '').slice(0, 10).split('-').map((v) => parseInt(v, 10));
  if (!m || !d) return '';
  return `${d} ${SHORT[m - 1]}`;
}

/** "2026-11-05" -> "5 November 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = (iso || '').slice(0, 10).split('-').map((v) => parseInt(v, 10));
  if (!y || !m || !d) return '';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map((v) => parseInt(v, 10));
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function currentMonth(ref: Date = new Date()): string {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
}

const TYPE_COLORS: Record<string, string> = {
  video: 'var(--chart-1)',
  static: 'var(--text-2)',
  carousel: 'var(--chart-3)',
  'animated post': 'var(--chart-4)',
  reel: 'var(--chart-5)',
  'cover image': 'var(--chart-5)',
};
const EXTRA_COLORS = ['#0E9384', '#DD2590', '#7A5AF8', '#475467', '#C4320A', '#1570EF'];

export function typeColor(type: string): string {
  const key = (type || '').trim().toLowerCase();
  if (TYPE_COLORS[key]) return TYPE_COLORS[key];
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return EXTRA_COLORS[h % EXTRA_COLORS.length];
}

export const ROW_STATUS: Record<ReportRowStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  met: { label: 'Delivered', variant: 'success' },
  on_track: { label: 'On track', variant: 'warning' },
  at_risk: { label: 'At risk', variant: 'danger' },
  paused: { label: 'Paused this month', variant: 'neutral' },
  no_plan: { label: 'Not in plan', variant: 'neutral' },
};

export const REPORT_THUMB_WIDTH = 200;

/** Same authorized /thumbs and /uploads URLs the portal cards use, at the small size. */
export function reportThumbSrc(thumb: ReportThumb | null | undefined): string {
  if (!thumb) return '';
  const saved = isRealThumbnailUrl(thumb.thumbnail_url) ? thumb.thumbnail_url : null;
  if (!saved && thumb.kind === 'video') return getVideoStillUrl(thumb.url, REPORT_THUMB_WIDTH);
  const candidates = [saved, thumb.url, thumb.google_drive_url].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
  for (const c of candidates) {
    const backend = getThumbUrl(c, REPORT_THUMB_WIDTH) || getBackendFileUrl(c);
    if (backend) return backend;
  }
  // Same fallback as the portal cards (e.g. a Drive thumbnail link), https only.
  return candidates.map((c) => safeHttpUrl(c)).find((c) => c && c.startsWith('https://')) || '';
}
