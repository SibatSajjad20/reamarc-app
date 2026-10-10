/**
 * PKT (Asia/Karachi) date and time formatting utilities.
 */

import type { AttendanceRequest } from '../types/attendance';

export function parseIsoUtc(iso: string): Date {
  let s = iso.trim();
  // If no timezone indicator, treat as UTC
  if (!s.endsWith('Z') && !/[+-]\d{2}(?::?\d{2})?$/.test(s)) {
    s += 'Z';
  }
  return new Date(s);
}

/**
 * Format ISO datetime string in Pakistan Standard Time (PKT).
 * Example: "Oct 9, 10:12 AM"
 */
export function formatPktDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = parseIsoUtc(iso);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Karachi',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Format relative elapsed time.
 * Examples: "just now", "15m ago", "8 hours ago", "1 day ago"
 */
export function formatRelative(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  try {
    const d = parseIsoUtc(iso);
    if (isNaN(d.getTime())) return '';
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return 'just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
  } catch {
    return '';
  }
}

/**
 * Format ISO datetime with relative elapsed note.
 * Example: "Oct 9, 10:12 AM · 8 hours ago"
 */
export function formatPktDateTimeWithRelative(iso?: string | null): string {
  if (!iso) return '—';
  const formatted = formatPktDateTime(iso);
  if (formatted === '—') return '—';
  const rel = formatRelative(iso);
  return rel ? `${formatted} · ${rel}` : formatted;
}

/**
 * Format date in PKT.
 * Example: "Mon, Oct 5"
 */
export function formatPktDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      const d = new Date(year, month, day);
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(d);
    }
    const d = parseIsoUtc(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Karachi',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Format date range in PKT.
 * Example: "Mon, Oct 12 – Wed, Oct 14" or "Mon, Oct 5"
 */
export function formatPktDateRange(startDate?: string | null, endDate?: string | null): string {
  if (!startDate && !endDate) return '—';
  const start = startDate ? formatPktDate(startDate) : '';
  const end = endDate ? formatPktDate(endDate) : '';
  if (start && end && startDate !== endDate) {
    return `${start} – ${end}`;
  }
  return start || end || '—';
}

/**
 * Format claimed overtime duration.
 * Example: 24 -> "24m", 65 -> "1h 05m"
 */
export function formatOvertimeMinutes(minutes?: number | null): string {
  if (minutes == null || isNaN(minutes) || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${m}m`;
}

/**
 * Format regularization punch correction details.
 */
export function formatCorrectionChange(req: AttendanceRequest): string {
  const parts: string[] = [];
  if (req.correction_target === 'time_in' || req.correction_target === 'both') {
    const orig = req.original_punch_in || req.original_check_in || '—';
    const reqVal = req.regularization_punch_in || req.regularization_check_in || '—';
    parts.push(`Check-in: ${orig} → ${reqVal}`);
  }
  if (req.correction_target === 'time_out' || req.correction_target === 'both') {
    const orig = req.original_punch_out || req.original_check_out || '—';
    const reqVal = req.regularization_punch_out || req.regularization_check_out || '—';
    parts.push(`Check-out: ${orig} → ${reqVal}`);
  }
  return parts.join(' | ') || 'Punch time correction';
}
