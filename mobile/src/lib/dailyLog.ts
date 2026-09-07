export type TaskStatusOption = 'Completed' | 'Incomplete' | 'Blocker';

export interface DailyLogEntry {
  id: string;
  workspace_id?: string;
  user_id?: string;
  version?: number;
  date: string;
  resource_name: string;
  role: string;
  department?: string;
  client_project: string;
  task_description: string;
  task_type: string;
  task_status: TaskStatusOption | string;
  revisions_done?: string;
  deliverables?: string;
  hours_utilized: number | string;
  remarks?: string;
  start_time?: string | null;
  end_time?: string | null;
  estimated_hours?: number | null;
  variance_reason?: string | null;
  month_sheet?: string;
  custom_fields?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export type TaskStatusTone = {
  bg: string;
  fg: string;
  label: string;
};

export function parseHours(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (value == null) return 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return 0;
  const colon = raw.match(/^(\d+):(\d{1,2})$/);
  if (colon) {
    return Math.max(0, Number(colon[1]) + Number(colon[2]) / 60);
  }
  const num = Number(raw.replace(/hrs?|hours?/g, '').trim());
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

export function formatHoursShort(value: number | string | null | undefined): string {
  const hours = parseHours(value);
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function taskStatusTone(status?: string | null): TaskStatusTone {
  const value = String(status || '').toLowerCase();
  if (value === 'completed') {
    return { bg: '#ECFDF5', fg: '#059669', label: 'Completed' };
  }
  if (value === 'incomplete') {
    return { bg: '#FFFBEB', fg: '#D97706', label: 'Incomplete' };
  }
  if (value === 'blocker') {
    return { bg: '#FFF1F2', fg: '#E11D48', label: 'Blocker' };
  }
  return { bg: '#F4F4F5', fg: '#71717A', label: status || 'Unknown' };
}

export function splitDeliverables(raw?: string | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function deliverableLabel(url: string): string {
  const clean = url.split(/[?#]/)[0];
  const last = clean.split('/').pop() || url;
  return last.replace(/^[a-f0-9]{8,}_/i, '') || 'Attachment';
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function isUploadPath(value: string): boolean {
  const v = value.trim();
  return v.startsWith('/uploads/') || v.startsWith('uploads/') || v.includes('/uploads/');
}

export type PersonLogGroup = {
  key: string;
  userId?: string;
  name: string;
  department?: string;
  role?: string;
  totalHours: number;
  entries: DailyLogEntry[];
};

export function groupEntriesByPerson(entries: DailyLogEntry[]): PersonLogGroup[] {
  const map = new Map<string, PersonLogGroup>();
  for (const entry of entries) {
    const key = entry.user_id || `name:${entry.resource_name || 'Unknown'}`;
    const existing = map.get(key);
    const hours = parseHours(entry.hours_utilized);
    if (existing) {
      existing.entries.push(entry);
      existing.totalHours += hours;
      continue;
    }
    map.set(key, {
      key,
      userId: entry.user_id,
      name: entry.resource_name || 'Unknown',
      department: entry.department,
      role: entry.role,
      totalHours: hours,
      entries: [entry],
    });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function buildEntriesQuery(params: {
  startDate: string;
  endDate: string;
  userId?: string | null;
  resourceName?: string | null;
  department?: string | null;
  taskStatus?: string | null;
  limit?: number;
}): string {
  const search = new URLSearchParams();
  search.set('start_date', params.startDate);
  search.set('end_date', params.endDate);
  if (params.userId) search.set('user_id', params.userId);
  else if (params.resourceName) search.set('resource_name', params.resourceName);
  if (params.department && params.department.toLowerCase() !== 'all') {
    search.set('department', params.department);
  }
  if (params.taskStatus && params.taskStatus.toLowerCase() !== 'all') {
    search.set('task_status', params.taskStatus);
  }
  search.set('limit', String(params.limit ?? 300));
  return `?${search.toString()}`;
}

/** Mon–Sat work week containing `isoDate`, matching web Daily Log “This Week”. */
export function getMonSatWeekBounds(isoDate: string, maxEndIso?: string): { start: string; end: string } {
  const mondayIso = getMondayIso(isoDate);
  const monday = parseIsoLocal(mondayIso);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);

  let start = mondayIso;
  let end = toIsoLocal(saturday);
  if (maxEndIso && end > maxEndIso) end = maxEndIso;
  if (end < start) end = start;
  return { start, end };
}

/** Full Mon–Sat bounds for display (does not clip to today). */
export function getMonSatWeekDisplayBounds(isoDate: string): { start: string; end: string } {
  const mondayIso = getMondayIso(isoDate);
  const monday = parseIsoLocal(mondayIso);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  return { start: mondayIso, end: toIsoLocal(saturday) };
}

/** Shift by whole work weeks; returns Monday of the resulting week. */
export function shiftWeekMonday(isoDate: string, weekDelta: number): string {
  const monday = parseIsoLocal(getMondayIso(isoDate));
  monday.setDate(monday.getDate() + weekDelta * 7);
  return toIsoLocal(monday);
}

export function getMondayIso(isoDate: string): string {
  const d = parseIsoLocal(isoDate);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diffToMonday);
  return toIsoLocal(d);
}

function parseIsoLocal(isoDate: string): Date {
  const d = new Date();
  const parts = isoDate.split('-').map(Number);
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    d.setFullYear(parts[0], parts[1] - 1, parts[2]);
  }
  d.setHours(12, 0, 0, 0);
  return d;
}

function toIsoLocal(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const dayNum = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

export type DateLogGroup = {
  key: string;
  date: string;
  totalHours: number;
  entries: DailyLogEntry[];
};

export function groupEntriesByDate(entries: DailyLogEntry[]): DateLogGroup[] {
  const map = new Map<string, DateLogGroup>();
  for (const entry of entries) {
    const key = entry.date || 'unknown';
    const hours = parseHours(entry.hours_utilized);
    const existing = map.get(key);
    if (existing) {
      existing.entries.push(entry);
      existing.totalHours += hours;
      continue;
    }
    map.set(key, {
      key,
      date: key,
      totalHours: hours,
      entries: [entry],
    });
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/** Parse matrix `work_hours` values like `08:30` or numeric hours. */
export function parseWorkHoursValue(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const raw = String(value ?? '').trim();
  if (!raw || raw === '—' || raw === '-') return 0;
  const colon = raw.match(/^(\d+):(\d{1,2})$/);
  if (colon) return Math.max(0, Number(colon[1]) + Number(colon[2]) / 60);
  const num = Number(raw.replace(/hrs?|hours?/gi, '').trim());
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

export function enumerateDatesInclusive(startIso: string, endIso: string, hardCap = 31): string[] {
  const start = startIso <= endIso ? startIso : endIso;
  const end = startIso <= endIso ? endIso : startIso;
  const out: string[] = [];
  const cursor = new Date();
  const parts = start.split('-').map(Number);
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    cursor.setFullYear(parts[0], parts[1] - 1, parts[2]);
  }
  cursor.setHours(12, 0, 0, 0);
  while (out.length < hardCap) {
    const iso = toIsoLocal(cursor);
    out.push(iso);
    if (iso >= end) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
