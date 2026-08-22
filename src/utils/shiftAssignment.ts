import type { DateShiftOverride, ShiftAssignment, ShiftTemplate, WeekdayShiftRule } from '../types/attendance';

export const WEEKDAY_ROWS = [
  { key: '0', label: 'Monday' },
  { key: '1', label: 'Tuesday' },
  { key: '2', label: 'Wednesday' },
  { key: '3', label: 'Thursday' },
  { key: '4', label: 'Friday' },
  { key: '5', label: 'Saturday' },
  { key: '6', label: 'Sunday' },
] as const;

export function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function weekdayKeyFromIso(dateStr: string): string {
  const parsed = new Date(`${dateStr}T12:00:00`);
  const jsDay = parsed.getDay();
  return jsDay === 0 ? '6' : String(jsDay - 1);
}

export function resolveAssignmentForDate(
  assignment: ShiftAssignment | undefined,
  dateStr: string,
): { shift_id?: string; auto_wfh: boolean } {
  if (!assignment) return { auto_wfh: false };

  let shiftId = assignment.shift_id;
  let autoWfh = false;
  const rule = assignment.weekday_rules?.[weekdayKeyFromIso(dateStr)];
  if (rule?.shift_id) shiftId = rule.shift_id;
  if (typeof rule?.auto_wfh === 'boolean') autoWfh = rule.auto_wfh;

  const override = (assignment.date_overrides || []).find((row) => row.date === dateStr);
  if (override?.shift_id) shiftId = override.shift_id;
  if (override && override.auto_wfh != null) autoWfh = Boolean(override.auto_wfh);

  return { shift_id: shiftId, auto_wfh: autoWfh };
}

export function hasWeekPattern(assignment?: ShiftAssignment): boolean {
  if (!assignment) return false;
  const rules = assignment.weekday_rules || {};
  return Object.values(rules).some((rule) => Boolean(rule?.shift_id) || Boolean(rule?.auto_wfh));
}

export function hybridWeekdayPreset(shifts: ShiftTemplate[]): Record<string, WeekdayShiftRule> {
  const evening =
    shifts.find((s) => s.id === 'shift_wfh_evening') ||
    shifts.find((s) => s.id === 'shift_wfh_night') ||
    shifts.find((s) => /wfh/i.test(s.name) && Boolean(s.is_night_shift || s.is_cross_midnight));
  const saturday =
    shifts.find((s) => s.id === 'shift_saturday_office') ||
    shifts.find((s) => /saturday/i.test(s.name)) ||
    shifts.find((s) => s.id === 'shift_standard' || /standard/i.test(s.name));

  const rules: Record<string, WeekdayShiftRule> = {};
  for (const key of ['0', '1', '2', '3', '4']) {
    rules[key] = { shift_id: evening?.id || '', auto_wfh: true };
  }
  rules['5'] = { shift_id: saturday?.id || '', auto_wfh: false };
  rules['6'] = { shift_id: '', auto_wfh: false };
  return rules;
}

export function emptyWeekdayRules(): Record<string, WeekdayShiftRule> {
  return Object.fromEntries(WEEKDAY_ROWS.map((row) => [row.key, { shift_id: '', auto_wfh: false }]));
}

export function normalizeDateOverrides(rows: DateShiftOverride[]): DateShiftOverride[] {
  const seen = new Set<string>();
  const out: DateShiftOverride[] = [];
  for (const row of rows) {
    if (!row.date || seen.has(row.date)) continue;
    seen.add(row.date);
    out.push({
      date: row.date,
      shift_id: row.shift_id || null,
      auto_wfh: row.auto_wfh ?? null,
    });
  }
  return out;
}
