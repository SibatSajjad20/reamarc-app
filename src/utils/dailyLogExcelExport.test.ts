import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildDailyLogWorkbook,
  buildDailyLogFilename,
} from './dailyLogExcelExport';
import type { DailyLogColumn, DailyLogEntry } from '../types/dailyLog';

const COLUMNS: DailyLogColumn[] = [
  { key: 'date', label: 'Date', type: 'date', editable: true },
  { key: 'resource_name', label: 'Resource Name', type: 'text', editable: true },
  { key: 'client_project', label: 'Client / Project', type: 'text', editable: true },
  { key: 'task_description', label: 'Task Description', type: 'text', editable: true },
  { key: 'task_status', label: 'Task Status', type: 'select', editable: true },
  { key: 'hours_utilized', label: 'Hours Utilized', type: 'number', editable: true },
];

function entry(partial: Partial<DailyLogEntry> & Pick<DailyLogEntry, 'date' | 'resource_name'>): DailyLogEntry {
  return {
    id: partial.id || `e_${Math.random().toString(36).slice(2, 8)}`,
    date: partial.date,
    resource_name: partial.resource_name,
    role: partial.role || 'Designer',
    department: partial.department || 'Creative',
    client_project: partial.client_project || 'Acme',
    task_description: partial.task_description || 'Design banner',
    task_type: partial.task_type || 'Scheduled Task',
    task_status: partial.task_status || 'Completed',
    revisions_done: partial.revisions_done || '',
    deliverables: partial.deliverables || '',
    hours_utilized: partial.hours_utilized ?? 2,
    remarks: partial.remarks || '',
    user_id: partial.user_id,
    month_sheet: partial.month_sheet || 'October - 2026',
    workspace_id: 'global',
    version: 1,
    custom_fields: partial.custom_fields,
  } as DailyLogEntry;
}

describe('dailyLogExcelExport', () => {
  it('builds filename from company, date range, and department', () => {
    const name = buildDailyLogFilename({
      periodLabel: 'Today',
      startDate: '2026-10-31',
      endDate: '2026-10-31',
      department: 'Creative',
      exportedBy: 'Ada',
      companyName: 'OneWorkLane',
    });
    expect(name).toBe('OneWorkLane_Daily_Log_2026-10-31_Creative.xlsx');
  });

  it('exports only the provided visible rows (filtered view), never invents extras', () => {
    const visible = [
      entry({ date: '2026-10-30', resource_name: 'Ada', user_id: 'u1', hours_utilized: 3, task_status: 'Completed' }),
      entry({ date: '2026-10-31', resource_name: 'Ada', user_id: 'u1', hours_utilized: 1.5, task_status: 'Incomplete', client_project: 'Beta' }),
    ];
    const { sheetData, filename, workbook } = buildDailyLogWorkbook(visible, COLUMNS, {
      periodLabel: 'This Week (Mon – Sat)',
      startDate: '2026-10-26',
      endDate: '2026-10-31',
      department: 'All',
      exportedBy: 'Ada Khan',
      exportedByRole: 'Team Member',
      companyName: 'Reamarc',
      filterSummary: 'Search: "banner"',
      viewMode: 'log',
    });

    expect(filename).toContain('Reamarc_Daily_Log_2026-10-26_to_2026-10-31');
    expect(sheetData[0][0]).toContain('REAMARC');
    expect(sheetData.some((row) => String(row[0] || '').startsWith('Filters:'))).toBe(true);

    const headerIdx = sheetData.findIndex((row) => row[0] === '#' && row[1] === 'Date');
    expect(headerIdx).toBeGreaterThan(0);
    expect(sheetData[headerIdx + 1][0]).toBe(1);
    expect(sheetData[headerIdx + 2][0]).toBe(2);
    expect(sheetData[headerIdx + 3]).toEqual([]);
    expect(sheetData[headerIdx + 4]).toContain('TOTAL');

    const sheet = workbook.Sheets['Daily Log'];
    expect(sheet).toBeTruthy();
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 }) as (string | number)[][];
    const dataRows = rows.filter((r) => typeof r[0] === 'number');
    expect(dataRows).toHaveLength(2);
  });

  it('formula-guards cell values like Content Calendar (excelSafeCell)', () => {
    const { sheetData } = buildDailyLogWorkbook(
      [
        entry({
          date: '2026-10-31',
          resource_name: 'Ada',
          task_description: '=cmd|"/c calc"!A0',
          deliverables: '+1-555',
        }),
      ],
      COLUMNS,
      {
        periodLabel: 'Today',
        startDate: '2026-10-31',
        endDate: '2026-10-31',
        department: 'All',
        exportedBy: 'Ada',
      },
    );
    const headerIdx = sheetData.findIndex((row) => row[0] === '#');
    const data = sheetData[headerIdx + 1];
    const taskDescIdx = COLUMNS.findIndex((c) => c.key === 'task_description') + 1;
    expect(String(data[taskDescIdx])).toMatch(/^'/);
  });

  it('buildDailyLogWorkbook returns a valid xlsx workbook buffer', () => {
    const { workbook, filename } = buildDailyLogWorkbook(
      [entry({ date: '2026-10-31', resource_name: 'Ada', user_id: 'u1' })],
      COLUMNS,
      {
        periodLabel: 'Today',
        startDate: '2026-10-31',
        endDate: '2026-10-31',
        department: 'All',
        exportedBy: 'Ada',
        companyName: 'Reamarc',
      },
    );
    expect(filename).toBe('Reamarc_Daily_Log_2026-10-31.xlsx');
    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    expect(Buffer.isBuffer(buf) || buf instanceof Uint8Array).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(500);
  });
});
