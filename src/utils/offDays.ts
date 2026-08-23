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
