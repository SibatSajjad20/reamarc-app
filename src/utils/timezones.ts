export const DEFAULT_TIMEZONE = 'Asia/Karachi';

/** Used when `Intl.supportedValuesOf('timeZone')` is unavailable. */
export const FALLBACK_TIMEZONES: string[] = [
  'UTC',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Riyadh',
  'Asia/Tehran',
  'Asia/Kathmandu',
  'Asia/Dhaka',
  'Asia/Yangon',
  'Asia/Qatar',
  'Asia/Muscat',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Perth',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Europe/Warsaw',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'Pacific/Auckland',
  'Pacific/Honolulu',
];

export function getTimezoneIds(): string[] {
  try {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    const values = intl.supportedValuesOf?.('timeZone');
    if (Array.isArray(values) && values.length > 0) {
      return values;
    }
  } catch {
    // Fall through to the hard-coded list.
  }
  return FALLBACK_TIMEZONES;
}

export function formatTimezoneOffset(timeZone: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(date);
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
    if (raw === 'GMT' || raw === 'UTC') return 'UTC+00:00';
    return raw.replace(/^GMT/, 'UTC');
  } catch {
    return 'UTC';
  }
}

export function formatTimezoneLabel(timeZone: string): string {
  return `${timeZone} (${formatTimezoneOffset(timeZone)})`;
}

export function getTimezoneOptions(): { value: string; label: string }[] {
  return getTimezoneIds().map((id) => ({
    value: id,
    label: formatTimezoneLabel(id),
  }));
}
