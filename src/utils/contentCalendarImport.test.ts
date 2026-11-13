import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  applyColumnMapping,
  defaultSelectedFields,
  parseSpreadsheetBuffer,
  prepareItems,
  suggestFieldForHeader,
} from './contentCalendarImport';

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Production & Approval');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('content calendar import mapping', () => {
  it('maps export headers including Record ID', () => {
    expect(suggestFieldForHeader('Serial')).toBe('serial');
    expect(suggestFieldForHeader('Record ID')).toBe('id');
    expect(suggestFieldForHeader('Publish Date')).toBe('publish_date');
    expect(suggestFieldForHeader('Design Due')).toBe('design_due');
  });

  it('parses grouped export sheet and keeps serial for update mapping', () => {
    const buf = workbookBuffer([
      ['DEFINITION', 'DEFINITION', 'PRODUCTION', 'PRODUCTION'],
      ['Serial', 'Record ID', 'Publish Date', 'Design Due'],
      ['CZB-018', 'cc_keep', '2026-11-20', '2026-11-18'],
    ]);
    const parsed = parseSpreadsheetBuffer(buf);
    expect(parsed.mapping[0]).toBe('serial');
    expect(parsed.mapping[1]).toBe('id');
    expect(parsed.mapping[2]).toBe('publish_date');
    const rows = applyColumnMapping(parsed, parsed.mapping);
    expect(rows[0].values.serial).toBe('CZB-018');
    expect(rows[0].values.id).toBe('cc_keep');
    expect(rows[0].values.publish_date).toBe('2026-11-20');
    expect(defaultSelectedFields('update', parsed.mapping)).toEqual(['design_due', 'publish_date']);
  });

  it('prepareItems still strips excel serials for create', () => {
    const prepared = prepareItems(
      [
        {
          sheetRef: 'ZEM-NOV26-01',
          detectedClient: 'ZEM Builders',
          item: { serial: 'ZEM-NOV26-01', client_name: 'ZEM Builders', content_concept: 'One' },
        },
      ],
      'ZEM Builders',
      true,
      [{ id: 'ws-zem', name: 'ZEM Builders' }],
    );
    expect(prepared[0].serial).toBeUndefined();
    expect(prepared[0].content_concept).toBe('One');
  });
});
