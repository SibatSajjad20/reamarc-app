/**
 * Excel export and template generator for Content Calendar.
 * Uses SheetJS (xlsx) for 100% client-side operation with zero server load.
 */
import * as XLSX from 'xlsx';
import type { ContentCalendarItem, ContentCalendarConstants } from '../types/contentCalendar';
import { PIPELINE_STAGES } from '../types/contentCalendar';
import { excelSafeCell } from './safeHttpUrl';

export const EXCEL_COLUMNS = [
  { key: 'serial', header: 'Serial', group: 'DEFINITION', width: 12 },
  { key: 'client_name', header: 'Client', group: 'DEFINITION', width: 22 },
  { key: 'campaign_type', header: 'Campaign Type', group: 'DEFINITION', width: 32 },
  { key: 'creative_type', header: 'Creative Type', group: 'DEFINITION', width: 16 },
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

/**
 * Exports strictly the currently visible/filtered rows to an Excel workbook.
 * Runs instantly in-browser without any server API calls.
 */
export function exportFilteredContentCalendarToExcel(
  items: ContentCalendarItem[],
  clientNameFilter?: string
): void {
  const wb = XLSX.utils.book_new();

  // Row 1: Section Category Groups
  const row1 = EXCEL_COLUMNS.map((col) => col.group);

  // Row 2: Standard Header Labels
  const row2 = EXCEL_COLUMNS.map((col) => col.header);

  // Rows 3+: Data Rows
  const dataRows = items.map((item) => {
    return EXCEL_COLUMNS.map((col) => {
      const val = (item as any)[col.key];
      return excelSafeCell(val);
    });
  });

  const fullSheetData = [row1, row2, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(fullSheetData);

  // Column widths configuration
  ws['!cols'] = EXCEL_COLUMNS.map((col, idx) => {
    let maxLen = col.header.length;
    dataRows.forEach((r) => {
      const cellLen = (r[idx] || '').length;
      if (cellLen > maxLen) {
        maxLen = Math.min(cellLen, 60); // Cap width at 60 for readability
      }
    });
    return { wch: Math.max(col.width, maxLen + 2) };
  });

  XLSX.utils.book_append_sheet(wb, ws, 'Production & Approval');

  // Intelligent naming
  const dateStr = new Date().toISOString().split('T')[0];
  let fileName = '';
  if (clientNameFilter && clientNameFilter !== 'all') {
    const cleanClient = clientNameFilter.replace(/[^a-zA-Z0-9_-]/g, '_');
    fileName = `Campaign_Content_Plan_${cleanClient}_${dateStr}.xlsx`;
  } else {
    fileName = `Campaign_Content_Plan_Export_${items.length}_items_${dateStr}.xlsx`;
  }

  XLSX.writeFile(wb, fileName);
}

/**
 * Downloads a pre-formatted template with sample row and an allowed values reference sheet.
 */
export function downloadContentCalendarTemplate(constants?: ContentCalendarConstants | null): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Production & Approval
  const row1 = EXCEL_COLUMNS.map((col) => col.group);
  const row2 = EXCEL_COLUMNS.map((col) => col.header);
  const sampleRow = [
    'AC-SAMPLE-01',
    'Apex Transfers LLC',
    'Acquire – Cold Audience Awareness',
    'Video',
    'Production Advantage',
    'The Hidden Cost of an Unreliable Production Partner',
    'Sample Pack',
    'Content',
    'Your ad copy text version A and B goes here...',
    'Hook 1: How much has your supplier actually cost your business this year?',
    'Visual description: Macro DTF / Screen Print / UV DTF closeups',
    'Request Your Sample Pack',
    '#dtftransfers #screenprinting #apparelprinting',
    'Content',
    'Wk 2',
    new Date().toISOString().split('T')[0],
    'https://drive.google.com/sample-draft',
    'https://drive.google.com/sample-final',
    'Review Content',
    'Not Started',
    'Sample campaign demonstration row. You can remove or replace this row.',
  ];

  const templateSheet = XLSX.utils.aoa_to_sheet([row1, row2, sampleRow]);
  templateSheet['!cols'] = EXCEL_COLUMNS.map((col) => ({ wch: col.width }));
  XLSX.utils.book_append_sheet(wb, templateSheet, 'Production & Approval');

  // Sheet 2: Allowed Values Reference
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
    setupStatuses.length
  );

  const refHeaders = [
    'Campaign Types',
    'Creative Types',
    'Content Pillars',
    'Pipeline Stages',
    'Approval Statuses',
    'Setup Statuses',
  ];
  const refRows: any[][] = [refHeaders];

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

  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet['!cols'] = [
    { wch: 38 },
    { wch: 18 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, refSheet, 'Allowed Values Reference');

  XLSX.writeFile(wb, 'Content_Calendar_Import_Template.xlsx');
}
