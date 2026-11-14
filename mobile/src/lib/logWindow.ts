export function isLogDateExpired(
  targetDateStr: string,
  holidays: Set<string> = new Set(),
  workingSaturdays: Set<string> = new Set(),
  shiftStartTime: string = '09:30',
  now: Date = new Date(),
): boolean {
  if (!targetDateStr) return true;
  const [y, m, d] = targetDateStr.split('-').map(Number);
  if (!y || !m || !d) return true;

  const [sh, sm] = (shiftStartTime || '09:30').split(':').map(Number);
  const startHour = Number.isNaN(sh) ? 9 : sh;
  const startMin = Number.isNaN(sm) ? 30 : sm;

  let workingDaysCounted = 0;
  const checkDate = new Date(y, m - 1, d + 1);

  for (let i = 0; i < 14; i++) {
    const iso = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    const weekday = checkDate.getDay();
    const isSunday = weekday === 0;
    const isFirstSaturday = weekday === 6 && checkDate.getDate() <= 7 && !workingSaturdays.has(iso);
    const isHoliday = holidays.has(iso);
    const isOff = isSunday || isFirstSaturday || isHoliday;

    if (!isOff) {
      workingDaysCounted += 1;
      if (workingDaysCounted === 2) break;
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }

  const windowEndDate = new Date(
    checkDate.getFullYear(),
    checkDate.getMonth(),
    checkDate.getDate(),
    startHour,
    startMin,
    0,
    0,
  );

  return now.getTime() > windowEndDate.getTime();
}

export function isOwnDailyLogEntry(
  entry: { user_id?: string | null; resource_name?: string | null } | null | undefined,
  user: { id?: string | null; name?: string | null } | null | undefined,
): boolean {
  if (!entry || !user) return false;
  if (entry.user_id && user.id && String(entry.user_id) === String(user.id)) return true;
  const entryName = String(entry.resource_name || '').trim().toLowerCase();
  const userName = String(user.name || '').trim().toLowerCase();
  return Boolean(entryName && userName && entryName === userName);
}

export function canMutateDailyLogEntry(
  entry: { date?: string | null; user_id?: string | null; resource_name?: string | null } | null | undefined,
  user: { id?: string | null; name?: string | null } | null | undefined,
  holidays: Set<string> = new Set(),
  workingSaturdays: Set<string> = new Set(),
  now: Date = new Date(),
): boolean {
  if (!entry?.date || !isOwnDailyLogEntry(entry, user)) return false;
  return !isLogDateExpired(entry.date, holidays, workingSaturdays, '09:30', now);
}
