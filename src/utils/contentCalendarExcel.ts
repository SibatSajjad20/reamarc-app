/**
 * Excel export and template generator for Content Calendar.
 * Client-side SheetJS + xlsx-js-style so Excel keeps bold headers and colored group labels.
 */
import XLSXStyle from 'xlsx-js-style';
import type { ContentCalendarItem, ContentCalendarConstants } from '../types/contentCalendar';
import { PIPELINE_STAGES } from '../types/contentCalendar';
import { excelSafeCell } from './safeHttpUrl';

export const EXCEL_COLUMNS = [
  { key: 'serial', header: 'Serial', group: 'DEFINITION', width: 12 },
  { key: 'id', header: 'Record ID', group: 'DEFINITION', width: 18 },
  { key: 'client_name', header: 'Client', group: 'DEFINITION', width: 22 },
  { key: 'campaign_type', header: 'Campaign Type', group: 'DEFINITION', width: 32 },
  { key: 'creative_type', header: 'Creative Type', group: 'DEFINITION', width: 16 },
  { key: 'content_type', header: 'Content Type', group: 'DEFINITION', width: 16 },
  { key: 'creative_category', header: 'Creative Category', group: 'DEFINITION', width: 20 },
  { key: 'content_pillar', header: 'Content Pillar', group: 'DEFINITION', width: 24 },
  { key: 'content_concept', header: 'Content Concept', group: 'DEFINITION', width: 36 },
  { key: 'offer', header: 'Offer', group: 'DEFINITION', width: 24 },
  { key: 'stage', header: 'Pipeline Stage', group: 'PRODUCTION', width: 20 },
  { key: 'primary_text', header: 'Primary Text (Ad Copy)', group: 'PRODUCTION', width: 45 },
  { key: 'headlines_hooks', header: 'Headlines / Hooks', group: 'PRODUCTION', width: 40 },
  { key: 'content_on_creative', header: 'Content On Creative', group: 'PRODUCTION', width: 40 },
  { key: 'cta', header: 'CTA', group: 'PRODUCTION', width: 28 },
  { key: 'captions_hashtags', header: 'Captions / Hashtags', group: 'PRODUCTION', width: 30 },
  { key: 'design_owner', header: 'Owner', group: 'PRODUCTION', width: 18 },
  { key: 'design_due', header: 'Design Due', group: 'PRODUCTION', width: 15 },
  { key: 'publish_date', header: 'Publish Date', group: 'PRODUCTION', width: 16 },
  { key: 'draft_preview_link', header: 'Draft Preview Link', group: 'ASSETS', width: 28 },
  { key: 'final_asset_link', header: 'Final Asset Link', group: 'ASSETS', width: 28 },
  { key: 'approval_status', header: 'Approval Status', group: 'APPROVAL', width: 22 },
  { key: 'setup_status', header: 'Setup Status', group: 'SETUP', width: 16 },
  { key: 'notes', header: 'Notes', group: 'SETUP', width: 30 },
];

const GROUP_THEME: Record<string, { bar: string; header: string; text: string }> = {
  DEFINITION: { bar: '1D4ED8', header: 'DBEAFE', text: '1E3A8A' },
  PRODUCTION: { bar: '0F766E', header: 'CCFBF1', text: '115E59' },
  ASSETS: { bar: '6D28D9', header: 'EDE9FE', text: '5B21B6' },
  APPROVAL: { bar: 'C2410C', header: 'FFEDD5', text: '9A3412' },
  SETUP: { bar: '334155', header: 'E2E8F0', text: '1E293B' },
};

const THIN = { style: 'thin' as const, color: { rgb: 'CBD5E1' } };
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const WRAP_KEYS = new Set([
  'content_concept',
  'primary_text',
  'headlines_hooks',
  'content_on_creative',
  'captions_hashtags',
  'notes',
  'offer',
  'campaign_type',
]);
const CENTER_KEYS = new Set([
  'serial',
  'creative_type',
  'content_type',
  'stage',
  'design_due',
  'publish_date',
  'approval_status',
  'setup_status',
]);

function fill(rgb: string) {
  return { patternType: 'solid' as const, fgColor: { rgb } };
}

function font(opts: { bold?: boolean; color?: string; sz?: number; italic?: boolean; underline?: boolean }) {
  return {
    name: 'Calibri',
    bold: Boolean(opts.bold),
    italic: Boolean(opts.italic),
    underline: Boolean(opts.underline),
    sz: opts.sz || 10,
    color: { rgb: opts.color || '0F172A' },
  };
}

function stageFont(label: string) {
  const s = label.toLowerCase();
  if (s.includes('rejected')) return font({ bold: true, color: 'DC2626' });
  if (s.includes('posted')) return font({ bold: true, color: '15803D' });
  if (s.includes('ready')) return font({ bold: true, color: '0F766E' });
  if (s.includes('revision')) return font({ bold: true, color: 'C2410C' });
  if (s.includes('client review')) return font({ bold: true, color: '7C3AED' });
  if (s.includes('internal review')) return font({ bold: true, color: '1D4ED8' });
  if (s.includes('production')) return font({ bold: true, color: '6D28D9' });
  return font({ bold: true, color: '334155' });
}

function approvalFont(label: string) {
  const s = label.toLowerCase();
  if (s.includes('approved')) return font({ bold: true, color: '15803D' });
  if (s.includes('changes')) return font({ bold: true, color: 'C2410C' });
  if (s.includes('review')) return font({ bold: true, color: '7C3AED' });
  if (s.includes('start')) return font({ bold: true, color: '1D4ED8' });
  return font({ bold: true, color: '334155' });
}

function setupFont(label: string) {
  const s = label.toLowerCase();
  if (s === 'live') return font({ bold: true, color: '15803D' });
  if (s === 'paused') return font({ bold: true, color: 'C2410C' });
  if (s.includes('setup')) return font({ bold: true, color: '1D4ED8' });
  return font({ bold: true, color: '64748B' });
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
  let current = EXCEL_COLUMNS[0].group;
  for (let i = 1; i <= EXCEL_COLUMNS.length; i++) {
    const next = EXCEL_COLUMNS[i]?.group;
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

function cellForExport(item: ContentCalendarItem, key: string): string {
  return excelSafeCell((item as Record<string, unknown>)[key]);
}

export function styleContentCalendarSheet(ws: any, sheetData: string[][], dataRowCount: number) {
  const lastCol = EXCEL_COLUMNS.length - 1;
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
    ...Array.from({ length: Math.max(dataRowCount, 1) }, () => ({ hpt: 20 })),
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
    const group = EXCEL_COLUMNS[c].group;
    const theme = GROUP_THEME[group] || GROUP_THEME.SETUP;
    setStyledCell(ws, groupRow, c, sheetData[groupRow]?.[c] || group, {
      font: font({ bold: true, color: 'FFFFFF', sz: 9 }),
      fill: fill(theme.bar),
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    });
    setStyledCell(ws, headerRow, c, sheetData[headerRow]?.[c] || EXCEL_COLUMNS[c].header, {
      font: font({ bold: true, color: theme.text, sz: 10 }),
      fill: fill(theme.header),
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    });
  }

  for (let r = firstData; r < firstData + dataRowCount; r++) {
    const zebra = r % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
    const row = sheetData[r] || [];
    EXCEL_COLUMNS.forEach((col, c) => {
      const raw = row[c] ?? '';
      let cellFont = font({ color: '0F172A' });
      if (col.key === 'serial') cellFont = font({ bold: true, color: '1D4ED8' });
      if (col.key === 'content_concept' || col.key === 'client_name') cellFont = font({ bold: true, color: '0F172A' });
      if (col.key === 'stage') cellFont = stageFont(String(raw));
      if (col.key === 'approval_status') cellFont = approvalFont(String(raw));
      if (col.key === 'setup_status') cellFont = setupFont(String(raw));
      if (col.key === 'draft_preview_link' || col.key === 'final_asset_link') {
        cellFont = font({ color: '1D4ED8', underline: true });
      }
      setStyledCell(ws, r, c, raw, {
        font: cellFont,
        fill: fill(zebra),
        alignment: {
          horizontal: CENTER_KEYS.has(col.key) ? 'center' : 'left',
          vertical: 'center',
          wrapText: WRAP_KEYS.has(col.key),
        },
        border: BORDER,
      });
    });
  }
}

function styleReferenceSheet(ws: any, headerCount: number, rowCount: number) {
  const headerFills = ['1D4ED8', '0F766E', '6D28D9', 'C2410C', '9A3412', '334155'];
  for (let c = 0; c < headerCount; c++) {
    const addr = encodeCell(0, c);
    setStyledCell(ws, 0, c, ws[addr]?.v ?? '', {
      font: font({ bold: true, color: 'FFFFFF', sz: 11 }),
      fill: fill(headerFills[c] || '0F172A'),
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
      border: BORDER,
    });
  }
  for (let r = 1; r < rowCount; r++) {
    for (let c = 0; c < headerCount; c++) {
      const addr = encodeCell(r, c);
      const val = ws[addr]?.v ?? '';
      let cellFont = font({ color: '0F172A' });
      if (c === 3) cellFont = stageFont(String(val));
      if (c === 4) cellFont = approvalFont(String(val));
      if (c === 5) cellFont = setupFont(String(val));
      setStyledCell(ws, r, c, val, {
        font: cellFont,
        fill: fill(r % 2 === 0 ? 'F8FAFC' : 'FFFFFF'),
        border: BORDER,
        alignment: { vertical: 'center', wrapText: true },
      });
    }
  }
  ws['!rows'] = [{ hpt: 22 }, ...Array.from({ length: Math.max(rowCount - 1, 0) }, () => ({ hpt: 18 }))];
}

export function buildContentCalendarWorkbook(
  items: ContentCalendarItem[],
  opts?: { clientNameFilter?: string; titleSuffix?: string },
) {
  const dateLabel = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const clientBit =
    opts?.clientNameFilter && opts.clientNameFilter !== 'all' ? `  ·  ${opts.clientNameFilter}` : '';
  const title = `CONTENT CALENDAR EXPORT  ·  ${items.length} ${items.length === 1 ? 'campaign' : 'campaigns'}  ·  ${dateLabel}${clientBit}${opts?.titleSuffix ? `  ·  ${opts.titleSuffix}` : ''}`;
  const groupRow = EXCEL_COLUMNS.map((c) => c.group);
  const headerRow = EXCEL_COLUMNS.map((c) => c.header);
  const dataRows = items.map((item) => EXCEL_COLUMNS.map((col) => cellForExport(item, col.key)));
  const sheetData = [[title, ...Array(EXCEL_COLUMNS.length - 1).fill('')], groupRow, headerRow, ...dataRows];
  const ws = XLSXStyle.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = EXCEL_COLUMNS.map((col, idx) => {
    let maxLen = col.header.length;
    dataRows.forEach((r) => {
      maxLen = Math.max(maxLen, Math.min((r[idx] || '').length, 60));
    });
    return { wch: Math.max(col.width, maxLen + 2) };
  });
  styleContentCalendarSheet(ws, sheetData, dataRows.length);
  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, 'Production & Approval');

  const dateStr = new Date().toISOString().split('T')[0];
  let filename = '';
  if (opts?.clientNameFilter && opts.clientNameFilter !== 'all') {
    const cleanClient = opts.clientNameFilter.replace(/[^a-zA-Z0-9_-]/g, '_');
    filename = `Campaign_Content_Plan_${cleanClient}_${dateStr}.xlsx`;
  } else {
    filename = `Campaign_Content_Plan_Export_${items.length}_items_${dateStr}.xlsx`;
  }
  return { filename, sheetData, workbook: wb };
}

export function exportFilteredContentCalendarToExcel(
  items: ContentCalendarItem[],
  clientNameFilter?: string,
): void {
  const { filename, workbook } = buildContentCalendarWorkbook(items, { clientNameFilter });
  XLSXStyle.writeFile(workbook, filename);
}

function referenceRows(constants?: ContentCalendarConstants | null): string[][] {
  const campaignTypes = constants?.campaign_types || [
    'Acquire – Cold Audience Awareness',
    'Acquire – Cold Audience Targeting',
    'Acquire – Warm Audience Retargeting',
    'Acquire – First Order Purchase Retargeting',
    'Expand – Repeat Purchase / Reorder',
    'Expand – Upsell / Cross-Sell',
    'Multiply – Referral / Ambassador',
  ];
  const creativeTypes = constants?.creative_types || [
    'Video',
    'Reel',
    'Carousel',
    'Static',
    'Story',
    'UGC',
    'Testimonial',
  ];
  const contentPillars = constants?.content_pillars || [
    'Industry Demand',
    'Production Advantage',
    'Business Growth',
    'Comparison',
    'Product',
    'Customer Success',
    'Educational',
    'Partnership',
  ];
  const stages = constants?.pipeline_stages || [...PIPELINE_STAGES];
  const approvalStatuses = constants?.approval_statuses || [
    'Review Content',
    'Content Approved',
    'Start Production',
    'Review Creative Draft',
    'Creative Approved',
    'Changes Requested',
    'Approved for Campaign',
  ];
  const setupStatuses = constants?.setup_statuses || ['Not Started', 'In Setup', 'Live', 'Paused'];
  const maxRows = Math.max(
    campaignTypes.length,
    creativeTypes.length,
    contentPillars.length,
    stages.length,
    approvalStatuses.length,
    setupStatuses.length,
  );
  const refRows: string[][] = [
    ['Campaign Types', 'Creative Types', 'Content Pillars', 'Pipeline Stages', 'Approval Statuses', 'Setup Statuses'],
  ];
  for (let i = 0; i < maxRows; i++) {
    refRows.push([
      campaignTypes[i] || '',
      creativeTypes[i] || '',
      contentPillars[i] || '',
      stages[i] || '',
      approvalStatuses[i] || '',
      setupStatuses[i] || '',
    ]);
  }
  return refRows;
}

export function downloadContentCalendarTemplate(constants?: ContentCalendarConstants | null): void {
  const sample = {
    serial: 'AC-SAMPLE-01',
    id: '',
    client_name: 'Apex Transfers LLC',
    campaign_type: 'Acquire – Cold Audience Awareness',
    creative_type: 'Video',
    content_type: 'Scheduled',
    creative_category: 'Organic Creative',
    content_pillar: 'Production Advantage',
    content_concept: 'The Hidden Cost of an Unreliable Production Partner',
    offer: 'Sample Pack',
    stage: 'Content',
    primary_text: 'Your ad copy text version A and B goes here...',
    headlines_hooks: 'Hook 1: How much has your supplier actually cost your business this year?',
    content_on_creative: 'Visual description: Macro DTF / Screen Print / UV DTF closeups',
    cta: 'Request Your Sample Pack',
    captions_hashtags: '#dtftransfers #screenprinting #apparelprinting',
    design_owner: 'Content',
    design_due: 'Wk 2',
    publish_date: new Date().toISOString().split('T')[0],
    draft_preview_link: 'https://drive.google.com/sample-draft',
    final_asset_link: 'https://drive.google.com/sample-final',
    approval_status: 'Review Content',
    setup_status: 'Not Started',
    notes: 'Sample campaign demonstration row. You can remove or replace this row.',
  } as ContentCalendarItem;

  const { workbook } = buildContentCalendarWorkbook([sample], { titleSuffix: 'TEMPLATE' });
  const ref = referenceRows(constants);
  const refSheet = XLSXStyle.utils.aoa_to_sheet(ref);
  refSheet['!cols'] = [
    { wch: 38 },
    { wch: 18 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 18 },
  ];
  styleReferenceSheet(refSheet, 6, ref.length);
  XLSXStyle.utils.book_append_sheet(workbook, refSheet, 'Allowed Values Reference');
  XLSXStyle.writeFile(workbook, 'Content_Calendar_Import_Template.xlsx');
}
