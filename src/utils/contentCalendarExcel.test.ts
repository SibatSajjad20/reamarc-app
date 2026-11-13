import { describe, expect, it } from 'vitest';
import XLSXStyle from 'xlsx-js-style';
import type { ContentCalendarItem } from '../types/contentCalendar';
import { buildContentCalendarWorkbook } from './contentCalendarExcel';
import { parseSpreadsheetBuffer } from './contentCalendarImport';

function item(partial: Partial<ContentCalendarItem> & Pick<ContentCalendarItem, 'id' | 'serial' | 'content_concept'>): ContentCalendarItem {
  return {
    client_name: 'Apex',
    stage: 'Content',
    approval_status: 'Review Content',
    setup_status: 'Not Started',
    ...partial,
  } as ContentCalendarItem;
}

describe('contentCalendarExcel styling', () => {
  it('exports filtered rows with a title bar, group labels, and field headers', () => {
    const visible = [
      item({ id: 'cc_1', serial: 'CAT-001', content_concept: 'Hero reel', stage: 'Ready to Post', approval_status: 'Approved for Campaign' }),
      item({ id: 'cc_2', serial: 'CAT-002', content_concept: 'Carousel', stage: 'Content Revision' }),
    ];
    const { sheetData, filename, workbook } = buildContentCalendarWorkbook(visible, { clientNameFilter: 'Apex' });
    expect(filename).toContain('Campaign_Content_Plan_Apex_');
    expect(String(sheetData[0][0])).toContain('CONTENT CALENDAR EXPORT');
    expect(sheetData[1][0]).toBe('DEFINITION');
    expect(sheetData[2][0]).toBe('Serial');
    expect(sheetData[3][0]).toBe('CAT-001');
    expect(sheetData).toHaveLength(5);

    const ws = workbook.Sheets['Production & Approval'];
    expect(ws.A1.s.font.bold).toBe(true);
    expect(ws.A1.s.fill.fgColor.rgb).toBe('0F172A');
    expect(ws.A2.s.font.bold).toBe(true);
    expect(ws.A2.s.fill.fgColor.rgb).toBe('1D4ED8');
    expect(ws.K2.s.fill.fgColor.rgb).toBe('0F766E');
    expect(ws.A3.s.font.bold).toBe(true);
    expect(ws.K4.s.font.color.rgb).toBe('0F766E');
  });

  it('still maps Serial / Record ID after the styled title row', () => {
    const { workbook } = buildContentCalendarWorkbook([
      item({ id: 'cc_keep', serial: 'CZB-018', content_concept: 'Keep mapping', publish_date: '2026-11-20', design_due: '2026-11-18' }),
    ]);
    const buf = XLSXStyle.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const parsed = parseSpreadsheetBuffer(buf);
    expect(parsed.mapping[0]).toBe('serial');
    expect(parsed.mapping[1]).toBe('id');
  });
});
