/**
 * Excel export for Daily Log — mirrors Content Calendar's approach:
 * export strictly the currently visible/filtered rows client-side (SheetJS),
 * with formula-injection safety via excelSafeCell.
 */
import * as XLSX from 'xlsx';
import type { DailyLogColumn, DailyLogEntry } from '../types/dailyLog';
import { formatHours } from './logTimeChecks';
import { excelSafeCell } from './safeHttpUrl';

export interface DailyLogExportMeta {
  periodLabel: string;
  startDate?: string;
  endDate?: string;
  department: string;
  exportedBy: string;
  exportedByRole?: string;
  companyName?: string;
  /** Active UI filters beyond date/dept (search, person, column filters). */
  filterSummary?: string;
  viewMode?: 'log' | 'sheet';
}

const STANDARD_COL_WIDTHS: Record<string, number> = {
  date: 12,
  resource_name: 22,
  role: 18,
  department: 22,
  client_project: 20,
  task_description: 48,
  task_type: 16,
  task_status: 14,
  revisions_done: 36,
  deliverables: 36,
  hours_utilized: 14,
  remarks: 28,
};

function getCellValue(entry: DailyLogEntry, key: string): string | number {
  const raw = (entry as unknown as Record<string, unknown>)[key] ?? entry.custom_fields?.[key];

  if (key === 'hours_utilized') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return '';
    return formatHours(n);
  }

  if (raw === undefined || raw === null) return '';

  if (key === 'deliverables') {
    const text = String(raw).trim();
    return excelSafeCell(
      text
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean)
        .join('\n'),
    );
  }

  return excelSafeCell(raw);
}

function compareEntries(a: DailyLogEntry, b: DailyLogEntry): number {
  const dateCmp = String(a.date || '').localeCompare(String(b.date || ''));
  if (dateCmp !== 0) return dateCmp;
  const nameCmp = String(a.resource_name || '').localeCompare(String(b.resource_name || ''));
  if (nameCmp !== 0) return nameCmp;
  return String(a.client_project || '').localeCompare(String(b.client_project || ''));
}

function safeFilenamePart(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').slice(0, 40);
}

export function buildDailyLogFilename(meta: DailyLogExportMeta): string {
  const prefix = safeFilenamePart(meta.companyName || 'Company');
  const range =
    meta.startDate && meta.endDate
      ? meta.startDate === meta.endDate
        ? meta.startDate
        : `${meta.startDate}_to_${meta.endDate}`
      : safeFilenamePart(meta.periodLabel);
  const dept =
    meta.department && meta.department !== 'All' ? `_${safeFilenamePart(meta.department)}` : '';
  return `${prefix}_Daily_Log_${range}${dept}.xlsx`;
}

export interface DailyLogWorkbookBuild {
  filename: string;
  sheetData: (string | number)[][];
  workbook: XLSX.WorkBook;
}

/**
 * Build a Daily Log workbook from the visible/filtered rows (no download).
 * Used by exportDailyLogWorkbook and by tests / sample generation.
 */
export function buildDailyLogWorkbook(
  entries: DailyLogEntry[],
  columns: DailyLogColumn[],
  meta: DailyLogExportMeta,
): DailyLogWorkbookBuild {
  const companyName = meta.companyName || '';
  const exportCols = columns.length > 0 ? columns : [];
  const sorted = [...entries].sort(compareEntries);

  const people = new Set(sorted.map((e) => e.resource_name).filter(Boolean));
  const projects = new Set(sorted.map((e) => e.client_project).filter(Boolean));
  const completed = sorted.filter((e) => e.task_status === 'Completed').length;
  const incomplete = sorted.filter((e) => e.task_status === 'Incomplete').length;
  const blockers = sorted.filter((e) => e.task_status === 'Blocker').length;
  const totalHours = sorted.reduce((sum, e) => {
    const n = Number(e.hours_utilized);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const periodRange =
    meta.startDate && meta.endDate
      ? meta.startDate === meta.endDate
        ? meta.startDate
        : `${meta.startDate} – ${meta.endDate}`
      : meta.periodLabel;

  const sheetData: (string | number)[][] = [];

  sheetData.push([companyName ? `${companyName.toUpperCase()} — DAILY LOG EXPORT` : 'DAILY LOG EXPORT']);
  sheetData.push([
    `Period: ${meta.periodLabel}`,
    `Dates: ${periodRange}`,
    `Department: ${meta.department || 'All'}`,
  ]);
  const generatedRow = [
    `Generated: ${new Date().toLocaleString()}`,
    `Exported by: ${meta.exportedBy}${meta.exportedByRole ? ` (${meta.exportedByRole})` : ''}`,
  ];
  if (meta.viewMode) {
    generatedRow.push(`View: ${meta.viewMode === 'sheet' ? 'Sheet' : 'Log'}`);
  }
  sheetData.push(generatedRow);
  if (meta.filterSummary) {
    sheetData.push([`Filters: ${meta.filterSummary}`]);
  }
  sheetData.push([
    `Entries: ${sorted.length}`,
    `People: ${people.size}`,
    `Projects: ${projects.size}`,
    `Hours: ${formatHours(totalHours)}`,
    `Completed: ${completed}`,
    `Incomplete: ${incomplete}`,
    `Blockers: ${blockers}`,
  ]);
  sheetData.push([]);

  const headerRowIndex = sheetData.length;
  const headers = ['#', ...exportCols.map((col) => col.label)];
  sheetData.push(headers);

  sorted.forEach((entry, idx) => {
    sheetData.push([
      idx + 1,
      ...exportCols.map((col) => getCellValue(entry, col.key)),
    ]);
  });

  sheetData.push([]);
  const totals: (string | number)[] = [''];
  exportCols.forEach((col, colIdx) => {
    if (col.key === 'hours_utilized') {
      totals.push(formatHours(totalHours));
    } else if (colIdx === 0) {
      totals.push('TOTAL');
    } else {
      totals.push('');
    }
  });
  sheetData.push(totals);

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const lastCol = headers.length - 1;

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(lastCol, 3) } },
  ];

  ws['!cols'] = [
    { wch: 5 },
    ...exportCols.map((col) => ({
      wch: STANDARD_COL_WIDTHS[col.key] || Math.min(Math.max(Number(col.width) / 8 || 18, 12), 48),
    })),
  ];

  ws['!views'] = [
    {
      state: 'frozen',
      ySplit: headerRowIndex + 1,
      topLeftCell: XLSX.utils.encode_cell({ r: headerRowIndex + 1, c: 0 }),
      activePane: 'bottomLeft',
    },
  ];
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRowIndex, c: 0 },
      e: { r: headerRowIndex + sorted.length, c: lastCol },
    }),
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Log');

  return {
    filename: buildDailyLogFilename(meta),
    sheetData,
    workbook: wb,
  };
}

/**
 * Exports strictly the currently visible/filtered Daily Log rows to Excel.
 * Runs in-browser (same pattern as Content Calendar export).
 */
export function exportDailyLogWorkbook(
  entries: DailyLogEntry[],
  columns: DailyLogColumn[],
  meta: DailyLogExportMeta,
): string {
  const { filename, workbook } = buildDailyLogWorkbook(entries, columns, meta);
  XLSX.writeFile(workbook, filename);
  return filename;
}
