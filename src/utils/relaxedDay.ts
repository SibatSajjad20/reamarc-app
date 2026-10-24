export type CalendarEventKind = 'holiday' | 'working_saturday' | 'special_event' | 'event' | 'relaxed_day';

export const RELAXED_DAY_TYPE = 'relaxed_day';

export function isRelaxedDay(eventType?: string | null): boolean {
  return String(eventType || '').toLowerCase() === RELAXED_DAY_TYPE;
}

export function relaxedDayApplies(args: {
  excludeUserIds?: string[] | null;
  excludeWfh?: boolean | null;
  userId: string;
  isWfh: boolean;
}): boolean {
  const excluded = new Set((args.excludeUserIds || []).map(String));
  if (excluded.has(String(args.userId))) return false;
  if ((args.excludeWfh ?? true) && args.isWfh) return false;
  return true;
}
