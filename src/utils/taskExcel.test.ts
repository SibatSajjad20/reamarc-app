import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { Task } from '../types/task';
import {
  buildTaskWorkbook,
  formatTaskSerial,
  parseTaskPriority,
  parseTaskSheet,
  parseTaskStatus,
  sanitizeImportCell,
} from './taskExcel';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title' | 'serial'>): Task {
  return {
    status: 'todo',
    priority: 'medium',
    progress: 0,
    ...partial,
  };
}

describe('taskExcel', () => {
  it('formats T-NNNN serials from numbers, T-12, and AUTO', () => {
    expect(formatTaskSerial('T-28')).toBe('T-0028');
    expect(formatTaskSerial('28')).toBe('T-0028');
    expect(formatTaskSerial('AUTO')).toBe('');
    expect(formatTaskSerial('', 3)).toBe('T-0003');
  });

  it('maps list-view status and priority labels', () => {
    expect(parseTaskStatus('In Review')).toBe('in_review');
    expect(parseTaskStatus('To Do')).toBe('todo');
    expect(parseTaskPriority('Urgent')).toBe('urgent');
  });

  it('neutralizes formula injection like content calendar', () => {
    expect(sanitizeImportCell('=cmd|calc')).toBe("'=cmd|calc");
    expect(sanitizeImportCell('Normal')).toBe('Normal');
  });

  it('exports only the provided filtered rows', () => {
    const visible = [
      task({ id: '1', serial: 'T-0028', title: 'task 1', status: 'todo', assignee_name: 'admin rm', related: { client_name: 'Management' } }),
      task({ id: '2', serial: 'T-0027', title: 'FIX4 live video', status: 'in_progress' }),
    ];
    const { sheetData, filename } = buildTaskWorkbook(visible);
    expect(filename).toContain('Tasks_Export_2_items_');
    expect(String(sheetData[0][0])).toContain('TASKS EXPORT');
    expect(sheetData[1][0]).toBe('IDENTITY');
    expect(sheetData[2][0]).toBe('Task ID');
    expect(sheetData[3][0]).toBe('T-0028');
    expect(sheetData[3][1]).toBe('task 1');
    expect(sheetData[3][7]).toBe('Management');
    expect(sheetData).toHaveLength(5);
  });

  it('applies bold colored headers and group labels', () => {
    const { workbook } = buildTaskWorkbook([
      task({ id: '1', serial: 'T-0001', title: 'Alpha', status: 'completed', priority: 'urgent' }),
    ]);
    const ws = workbook.Sheets.Tasks;
    expect(ws.A1.s.font.bold).toBe(true);
    expect(ws.A1.s.font.color.rgb).toBe('FFFFFF');
    expect(ws.A1.s.fill.fgColor.rgb).toBe('0F172A');
    expect(ws.A2.s.font.bold).toBe(true);
    expect(ws.A2.s.fill.fgColor.rgb).toBe('1D4ED8');
    expect(ws.C2.s.fill.fgColor.rgb).toBe('0F766E');
    expect(ws.A3.s.font.bold).toBe(true);
    expect(ws.A3.s.fill.fgColor.rgb).toBe('DBEAFE');
    expect(ws.C4.s.font.color.rgb).toBe('15803D');
    expect(ws.D4.s.font.color.rgb).toBe('DC2626');
  });

  it('round-trips Task ID through the import parser', () => {
    const visible = [task({ id: '9', serial: 'T-0009', title: 'Keep mapping', status: 'in_review', priority: 'urgent' })];
    const { workbook } = buildTaskWorkbook(visible);
    const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets.Tasks, { header: 1, defval: '' });
    const parsed = parseTaskSheet(rows);
    expect(parsed[0].serial).toBe('T-0009');
    expect(parsed[0].title).toBe('Keep mapping');
    expect(parsed[0].status).toBe('in_review');
    expect(parsed[0].priority).toBe('urgent');
  });
});
