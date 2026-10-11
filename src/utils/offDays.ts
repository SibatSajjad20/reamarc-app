export type OffDayKind = 'sunday' | 'first_saturday' | 'holiday';

export interface OffDayInfo {
  isOff: boolean;
  kind?: OffDayKind;
  label: string;
}

export const toIsoDate = (value: Date | string): string => {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseIsoDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const isSundayIso = (iso: string): boolean => parseIsoDate(iso).getDay() === 0;

export const isFirstSaturdayIso = (iso: string): boolean => {
  const d = parseIsoDate(iso);
  return d.getDay() === 6 && d.getDate() <= 7;
};

export const classifyOffDay = (
  iso: string,
  holidays: Set<string> | string[] = [],
  workingSaturdays: Set<string> | string[] = [],
  holidayTitles: Record<string, string> = {},
): OffDayInfo => {
  const holidaySet = holidays instanceof Set ? holidays : new Set(holidays);
  const workingSet = workingSaturdays instanceof Set ? workingSaturdays : new Set(workingSaturdays);

  if (holidaySet.has(iso)) {
    const title = (holidayTitles[iso] || 'Public Holiday').trim() || 'Public Holiday';
    return { isOff: true, kind: 'holiday', label: title };
  }
  if (workingSet.has(iso)) {
    return { isOff: false, label: 'Working day' };
  }
  if (isSundayIso(iso)) {
    return { isOff: true, kind: 'sunday', label: 'Sunday — Rest day' };
  }
  if (isFirstSaturdayIso(iso)) {
    return { isOff: true, kind: 'first_saturday', label: '1st Saturday — Rest day' };
  }
  return { isOff: false, label: 'Working day' };
};

export const isOffDayIso = (
  iso: string,
  holidays: Set<string> | string[] = [],
  workingSaturdays: Set<string> | string[] = [],
): boolean => classifyOffDay(iso, holidays, workingSaturdays).isOff;

export const nearestPastWorkdayIso = (
  fromIso: string,
  holidays: Set<string> | string[] = [],
  workingSaturdays: Set<string> | string[] = [],
  minIso?: string,
): string => {
  const cursor = parseIsoDate(fromIso);
  for (let i = 0; i < 31; i += 1) {
    const iso = toIsoDate(cursor);
    if (minIso && iso < minIso) return iso;
    if (!isOffDayIso(iso, holidays, workingSaturdays)) return iso;
    cursor.setDate(cursor.getDate() - 1);
  }
  return fromIso;
};

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatIsoDayMonth = (iso: string): string => {
  const d = parseIsoDate(iso);
  const dayName = DAYS_SHORT[d.getDay()];
  const monthName = MONTHS_SHORT[d.getMonth()];
  return `${dayName}, ${d.getDate()} ${monthName}`;
};

export const formatOffDayReason = (info: OffDayInfo, iso?: string): string => {
  if (info.kind === 'holiday') {
    const datePrefix = iso ? `${formatIsoDayMonth(iso)} is a company holiday` : 'This date is a company holiday';
    return `${datePrefix} (${info.label}). Logs can't be added on holidays.`;
  }
  if (info.kind === 'sunday') {
    return "Sunday is a rest day. Logs can't be added on rest days.";
  }
  if (info.kind === 'first_saturday') {
    return "The 1st Saturday is a rest day. Logs can't be added on rest days.";
  }
  return `${info.label}. Logs can't be added on rest days.`;
};

export const formatShiftDate = (isoDate?: string, offDay?: OffDayInfo): string => {
  if (!isoDate) return 'Today';
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3) return 'Today';
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const todayIso = toIsoDate(new Date());
  const prefix = isoDate === todayIso ? 'Today · ' : '';
  const dayName = dt.getDay() === 0 ? 'Sunday' : days[dt.getDay()];
  const baseDate = `${prefix}${dayName}, ${d} ${months[m - 1]}`;

  if (offDay?.isOff) {
    if (offDay.kind === 'holiday') {
      return `${baseDate} · Holiday: ${offDay.label}`;
    }
    return `${baseDate} · Off day`;
  }
  return `${prefix}${days[dt.getDay()]}, ${d} ${months[m - 1]}`;
};


