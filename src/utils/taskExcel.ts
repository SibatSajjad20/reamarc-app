/**
 * Excel export, import parser, and template for Task Manager.
 * Same client-side SheetJS approach as Content Calendar: filtered rows only + formula safety.
 * Styled with xlsx-js-style so Excel keeps bold headers and colored group labels.
 */
import * as XLSX from 'xlsx';
import XLSXStyle from 'xlsx-js-style';
import type { Task, TaskPriority, TaskStatus } from '../types/task';
import { excelSafeCell } from './safeHttpUrl';

export const TASK_EXCEL_COLUMNS = [
  { key: 'serial', header: 'Task ID', group: 'IDENTITY', width: 12 },
  { key: 'title', header: 'Task Name', group: 'IDENTITY', width: 36 },
  { key: 'status', header: 'Status', group: 'WORKFLOW', width: 14 },
  { key: 'priority', header: 'Priority', group: 'WORKFLOW', width: 12 },
  { key: 'progress', header: 'Progress', group: 'WORKFLOW', width: 12 },
  { key: 'assignee_name', header: 'Assignee', group: 'ASSIGNMENT', width: 22 },
  { key: 'department', header: 'Department', group: 'ASSIGNMENT', width: 18 },
  { key: 'client_name', header: 'Project Name', group: 'ASSIGNMENT', width: 24 },
  { key: 'start_date', header: 'Start Date', group: 'SCHEDULE', width: 14 },
  { key: 'due_date', header: 'Deadline', group: 'SCHEDULE', width: 14 },
  { key: 'due_time', header: 'Due Time', group: 'SCHEDULE', width: 12 },
  { key: 'estimate_hours', header: 'Estimate Hours', group: 'SCHEDULE', width: 16 },
  { key: 'description', header: 'Description', group: 'DETAILS', width: 42 },
  { key: 'blocked', header: 'Blocked', group: 'DETAILS', width: 12 },
  { key: 'blocked_reason', header: 'Blocked Reason', group: 'DETAILS', width: 28 },
] as const;

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export interface ParsedTaskRow {
  serial?: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  progress?: number | null;
  assignee_name?: string;
  client_name?: string;
  start_date?: string;
  due_date?: string;
  due_time?: string;
  estimate_hours?: number | null;
  blocked?: boolean;
  blocked_reason?: string;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function formatTaskSerial(raw: unknown, fallbackNum?: number): string {
  const s = String(raw ?? '').trim();
  if (!s || s.toUpperCase() === 'AUTO') {
    return fallbackNum && fallbackNum > 0 ? `T-${String(fallbackNum).padStart(4, '0')}` : '';
  }
  const match = s.match(/(\d+)/);
  if (!match) {
    return fallbackNum && fallbackNum > 0 ? `T-${String(fallbackNum).padStart(4, '0')}` : '';
  }
  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `T-${String(n).padStart(4, '0')}`;
}

export function parseTaskStatus(raw: unknown): TaskStatus | undefined {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!s) return undefined;
  if (s === 'todo' || s === 'to do' || s === 'open') return 'todo';
  if (s === 'in progress' || s === 'inprogress' || s === 'progress') return 'in_progress';
  if (s === 'in review' || s === 'inreview' || s === 'review') return 'in_review';
  if (s === 'completed' || s === 'complete' || s === 'done') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return undefined;
}

export function parseTaskPriority(raw: unknown): TaskPriority | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (s === 'low') return 'low';
  if (s === 'medium' || s === 'normal' || s === 'med') return 'medium';
  if (s === 'high') return 'high';
  if (s === 'urgent' || s === 'critical') return 'urgent';
  return undefined;
}

export function sanitizeImportCell(val: unknown): string {
  if (val === undefined || val === null) return '';
  let strVal = String(val).trim();
  if (!strVal) return '';
  if (strVal.startsWith('=') || strVal.startsWith('+') || strVal.startsWith('-') || strVal.startsWith('@')) {
    strVal = `'${strVal}`;
  }
  return strVal;
}

export function parseExcelDateValue(val: unknown): string | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const str = String(val).trim();
  if (!str) return undefined;
  const num = Number(str);
  if (!Number.isNaN(num) && num > 30000 && num < 60000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().split('T')[0];
  return undefined;
}

export function parseDueTime(val: unknown): string | undefined {
  const str = String(val ?? '').trim();
  if (!str) return undefined;
  const match = str.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  return `${String(Math.min(23, Number(match[1]))).padStart(2, '0')}:${String(Math.min(59, Number(match[2]))).padStart(2, '0')}`;
}

function clientNameOf(task: Task): string {
  return task.related?.client_name || '';
}

function cellForExport(task: Task, key: string): string {
  if (key === 'status') return TASK_STATUS_LABELS[task.status] || task.status;
  if (key === 'priority') return TASK_PRIORITY_LABELS[task.priority] || task.priority;
  if (key === 'client_name') return excelSafeCell(clientNameOf(task));
  if (key === 'progress') return task.progress == null ? '0%' : `${task.progress}%`;
  if (key === 'blocked') return task.blocked ? 'Yes' : '';
  if (key === 'estimate_hours') return task.estimate_hours == null ? '' : String(task.estimate_hours);
  const val = (task as unknown as Record<string, unknown>)[key];
  return excelSafeCell(val);
}

const GROUP_THEME: Record<string, { bar: string; header: string; text: string }> = {
  IDENTITY: { bar: '1D4ED8', header: 'DBEAFE', text: '1E3A8A' },
  WORKFLOW: { bar: '0F766E', header: 'CCFBF1', text: '115E59' },
  ASSIGNMENT: { bar: '6D28D9', header: 'EDE9FE', text: '5B21B6' },
  SCHEDULE: { bar: 'C2410C', header: 'FFEDD5', text: '9A3412' },
  DETAILS: { bar: '334155', header: 'E2E8F0', text: '1E293B' },
};

const THIN = { style: 'thin' as const, color: { rgb: 'CBD5E1' } };
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };

function fill(rgb: string) {
  return { patternType: 'solid' as const, fgColor: { rgb } };
}

function font(opts: { bold?: boolean; color?: string; sz?: number; italic?: boolean; name?: string }) {
  return {
    name: opts.name || 'Calibri',
    bold: Boolean(opts.bold),
    italic: Boolean(opts.italic),
    sz: opts.sz || 10,
    color: { rgb: opts.color || '0F172A' },
  };
}

function statusFont(label: string) {
  const s = label.toLowerCase();
  if (s === 'completed') return font({ bold: true, color: '15803D' });
  if (s === 'in progress') return font({ bold: true, color: '1D4ED8' });
  if (s === 'in review') return font({ bold: true, color: '7C3AED' });
  if (s === 'cancelled') return font({ bold: true, color: '64748B', italic: true });
  return font({ bold: true, color: '475569' });
}

function priorityFont(label: string) {
  const s = label.toLowerCase();
  if (s === 'urgent') return font({ bold: true, color: 'DC2626' });
  if (s === 'high') return font({ bold: true, color: 'EA580C' });
  if (s === 'low') return font({ color: '64748B' });
  return font({ color: '334155' });
}

function encodeCell(r: number, c: number) {
  return XLSXStyle.utils.encode_cell({ r, c });
}

function setStyledCell(ws: any, r: number, c: number, value: string | number, style: Record<string, unknown>) {
  const addr = encodeCell(r, c);
  const existing = ws[addr] || { t: typeof value === 'number' ? 'n' : 's', v: value };
  ws[addr] = { ...existing, v: value, t: typeof value === 'number' ? 'n' : 's', s: style };
}

function groupMergeRanges(headerRow: number) {
  const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];
  let start = 0;
  let current = TASK_EXCEL_COLUMNS[0].group;
  for (let i = 1; i <= TASK_EXCEL_COLUMNS.length; i++) {
    const next = TASK_EXCEL_COLUMNS[i]?.group;
    if (next !== current) {
      if (i - 1 > start) {
        merges.push({ s: { r: headerRow, c: start }, e: { r: headerRow, c: i - 1 } });
      }
      start = i;
      current = next;
    }
  }
  return merges;
}

export function styleTaskSheet(ws: any, sheetData: string[][], dataRowCount: number) {
  const lastCol = TASK_EXCEL_COLUMNS.length - 1;
  const titleRow = 0;
  const groupRow = 1;
  const headerRow = 2;
  const firstData = 3;
  const lastData = firstData + Math.max(dataRowCount, 0) - 1;

  ws['!merges'] = [
    { s: { r: titleRow, c: 0 }, e: { r: titleRow, c: lastCol } },
    ...groupMergeRanges(groupRow),
  ];
  ws['!rows'] = [
    { hpt: 28 },
    { hpt: 22 },
    { hpt: 20 },
    ...Array.from({ length: Math.max(dataRowCount, 1) }, () => ({ hpt: 18 })),
  ];
  ws['!views'] = [{ state: 'frozen', ySplit: 3, topLeftCell: 'A4', activePane: 'bottomLeft' }];
  ws['!autofilter'] = {
    ref: XLSXStyle.utils.encode_range({
      s: { r: headerRow, c: 0 },
      e: { r: Math.max(lastData, headerRow), c: lastCol },
    }),
  };

  for (let c = 0; c <= lastCol; c++) {
    setStyledCell(ws, titleRow, c, c === 0 ? sheetData[titleRow]?.[0] || '' : '', {
      font: font({ bold: true, color: 'FFFFFF', sz: 14 }),
      fill: fill('0F172A'),
      alignment: { horizontal: 'left', vertical: 'center' },
    });
    const group = TASK_EXCEL_COLUMNS[c].group;
    const theme = GROUP_THEME[group] || GROUP_THEME.DETAILS;
    setStyledCell(ws, groupRow, c, sheetData[groupRow]?.[c] || group, {
      font: font({ bold: true, color: 'FFFFFF', sz: 9, name: 'Calibri' }),
      fill: fill(theme.bar),
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    });
    setStyledCell(ws, headerRow, c, sheetData[headerRow]?.[c] || TASK_EXCEL_COLUMNS[c].header, {
      font: font({ bold: true, color: theme.text, sz: 10 }),
      fill: fill(theme.header),
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    });
  }

  for (let r = firstData; r < firstData + dataRowCount; r++) {
    const zebra = r % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
    const row = sheetData[r] || [];
    TASK_EXCEL_COLUMNS.forEach((col, c) => {
      const raw = row[c] ?? '';
      const baseFill = col.key === 'blocked' && String(raw).toLowerCase() === 'yes' ? 'FECACA' : zebra;
      let cellFont = font({ color: '0F172A' });
      if (col.key === 'serial') cellFont = font({ bold: true, color: '1D4ED8' });
      if (col.key === 'title') cellFont = font({ bold: true, color: '0F172A' });
      if (col.key === 'status') cellFont = statusFont(String(raw));
      if (col.key === 'priority') cellFont = priorityFont(String(raw));
      if (col.key === 'blocked' && String(raw).toLowerCase() === 'yes') {
        cellFont = font({ bold: true, color: '991B1B' });
      }
      const centered = ['status', 'priority', 'progress', 'start_date', 'due_date', 'due_time', 'estimate_hours', 'blocked', 'serial'].includes(col.key);
      setStyledCell(ws, r, c, raw, {
        font: cellFont,
        fill: fill(baseFill),
        alignment: {
          horizontal: centered ? 'center' : 'left',
          vertical: 'center',
          wrapText: col.key === 'title' || col.key === 'description' || col.key === 'blocked_reason',
        },
        border: BORDER,
      });
    });
  }
}

export function buildTaskWorkbook(tasks: Task[], titleSuffix?: string) {
  const dateLabel = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const title = `TASKS EXPORT  ·  ${tasks.length} ${tasks.length === 1 ? 'item' : 'items'}  ·  ${dateLabel}${titleSuffix ? `  ·  ${titleSuffix}` : ''}`;
  const groupRow = TASK_EXCEL_COLUMNS.map((c) => c.group);
  const headerRow = TASK_EXCEL_COLUMNS.map((c) => c.header);
  const dataRows = tasks.map((task) => TASK_EXCEL_COLUMNS.map((c) => cellForExport(task, c.key)));
  const sheetData = [[title, ...Array(TASK_EXCEL_COLUMNS.length - 1).fill('')], groupRow, headerRow, ...dataRows];
  const ws = XLSXStyle.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = TASK_EXCEL_COLUMNS.map((col, idx) => {
    let maxLen = col.header.length;
    dataRows.forEach((r) => {
      maxLen = Math.max(maxLen, Math.min((r[idx] || '').length, 60));
    });
    return { wch: Math.max(col.width, maxLen + 2) };
  });
  styleTaskSheet(ws, sheetData, dataRows.length);
  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, 'Tasks');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Tasks_Export_${tasks.length}_items_${dateStr}.xlsx`;
  return { filename, sheetData, workbook: wb };
}

export function exportFilteredTasksToExcel(tasks: Task[]): string {
  const { filename, workbook } = buildTaskWorkbook(tasks);
  XLSXStyle.writeFile(workbook, filename);
  return filename;
}

function styleReferenceSheet(ws: any, rows: number) {
  const headers = ['Statuses', 'Priorities', 'Serial rules'];
  headers.forEach((h, c) => {
    setStyledCell(ws, 0, c, h, {
      font: font({ bold: true, color: 'FFFFFF', sz: 11 }),
      fill: fill('0F172A'),
      alignment: { horizontal: 'left', vertical: 'center' },
      border: BORDER,
    });
  });
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < 3; c++) {
      const addr = encodeCell(r, c);
      const val = ws[addr]?.v ?? '';
      setStyledCell(ws, r, c, val, {
        font: c === 0 ? statusFont(String(val)) : c === 1 ? priorityFont(String(val)) : font({ color: '334155' }),
        fill: fill(r % 2 === 0 ? 'F8FAFC' : 'FFFFFF'),
        border: BORDER,
        alignment: { vertical: 'center', wrapText: true },
      });
    }
  }
  ws['!rows'] = [{ hpt: 22 }, ...Array.from({ length: rows - 1 }, () => ({ hpt: 20 }))];
}

export function downloadTaskTemplate(): string {
  const sampleTask: Task = {
    id: 'sample',
    serial: '',
    title: 'Write landing page hero',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    start_date: new Date().toISOString().split('T')[0],
    estimate_hours: 4,
    description: 'Sample row — delete or replace. Leave Task ID blank to auto-assign T-NNNN.',
  };
  const { workbook } = buildTaskWorkbook([sampleTask], 'TEMPLATE');
  const ref = [
    ['Statuses', 'Priorities', 'Serial rules'],
    ['To Do', 'Low', 'Blank or AUTO → next T-NNNN'],
    ['In Progress', 'Medium', 'T-12 / 12 / T12 → T-0012'],
    ['In Review', 'High', 'Matching Task ID updates the existing task when Upsert is on'],
    ['Completed', 'Urgent', ''],
    ['Cancelled', '', ''],
  ];
  const refSheet = XLSXStyle.utils.aoa_to_sheet(ref);
  refSheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 64 }];
  styleReferenceSheet(refSheet, ref.length);
  XLSXStyle.utils.book_append_sheet(workbook, refSheet, 'Allowed Values Reference');
  const filename = 'Tasks_Import_Template.xlsx';
  XLSXStyle.writeFile(workbook, filename);
  return filename;
}

const HEADER_FIELD_MAP: Record<string, string> = {
  serial: 'serial',
  taskid: 'serial',
  id: 'serial',
  sr: 'serial',
  sno: 'serial',
  title: 'title',
  taskname: 'title',
  task: 'title',
  name: 'title',
  description: 'description',
  details: 'description',
  notes: 'description',
  status: 'status',
  stage: 'status',
  priority: 'priority',
  progress: 'progress',
  assignee: 'assignee_name',
  assigneename: 'assignee_name',
  assignedto: 'assignee_name',
  department: 'department',
  project: 'client_name',
  projectname: 'client_name',
  client: 'client_name',
  clientname: 'client_name',
  startdate: 'start_date',
  deadline: 'due_date',
  duedate: 'due_date',
  due: 'due_date',
  duetime: 'due_time',
  estimatehours: 'estimate_hours',
  estimate: 'estimate_hours',
  blocked: 'blocked',
  blockedreason: 'blocked_reason',
};

export function parseTaskSheet(rows: unknown[][]): ParsedTaskRow[] {
  let headerMap: Record<number, string> | null = null;
  const extracted: ParsedTaskRow[] = [];

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const rowJoined = row.map((c) => String(c ?? '').trim()).filter(Boolean);
    if (rowJoined.length === 0) continue;
    const rowNorms = row.map((c) => normalizeHeader(String(c ?? '')));
    const hasSerial = rowNorms.some((n) => ['serial', 'taskid', 'id', 'sr', 'sno'].includes(n));
    const hasTitle = rowNorms.some((n) => ['title', 'taskname', 'task', 'name'].includes(n));
    if (hasSerial && hasTitle) {
      headerMap = {};
      row.forEach((h, idx) => {
        const field = HEADER_FIELD_MAP[normalizeHeader(String(h ?? ''))];
        if (field) headerMap![idx] = field;
      });
      continue;
    }
    if (!headerMap) continue;

    const item: Record<string, string> = {};
    let hasAny = false;
    Object.entries(headerMap).forEach(([idx, field]) => {
      const rawVal = row[Number(idx)];
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') return;
      hasAny = true;
      item[field] = sanitizeImportCell(rawVal);
    });
    const title = (item.title || '').slice(0, 200).trim();
    if (!hasAny || !title || title.toLowerCase() === 'title' || title.toLowerCase() === 'task name') continue;

    const prog = item.progress ? Number(String(item.progress).replace(/[^0-9.]/g, '')) : NaN;
    const hours = item.estimate_hours ? Number(String(item.estimate_hours).replace(/[^0-9.]/g, '')) : NaN;
    const blockedRaw = (item.blocked || '').toLowerCase();
    extracted.push({
      serial: formatTaskSerial(item.serial) || undefined,
      title,
      description: (item.description || '').slice(0, 10000) || undefined,
      status: parseTaskStatus(item.status),
      priority: parseTaskPriority(item.priority),
      progress: Number.isFinite(prog) ? Math.min(100, Math.max(0, Math.round(prog))) : null,
      assignee_name: item.assignee_name || undefined,
      client_name: item.client_name || undefined,
      start_date: parseExcelDateValue(item.start_date),
      due_date: parseExcelDateValue(item.due_date),
      due_time: parseDueTime(item.due_time),
      estimate_hours: Number.isFinite(hours) && hours >= 0 ? hours : null,
      blocked: ['yes', 'true', '1', 'blocked', 'y'].includes(blockedRaw),
      blocked_reason: item.blocked_reason || undefined,
    });
  }
  return extracted;
}

export function parseTaskWorkbook(buffer: ArrayBuffer): ParsedTaskRow[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames.includes('Tasks') ? 'Tasks' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('Worksheet is empty or could not be found.');
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) throw new Error('File does not contain enough data rows.');
  const parsed = parseTaskSheet(rows);
  if (parsed.length === 0) {
    throw new Error('No valid task records found. Headers must include Task ID (or Serial) and Task Name (or Title).');
  }
  if (parsed.length > 10000) {
    throw new Error('This file has more than 10,000 tasks. Split it into smaller workbooks.');
  }
  return parsed;
}
