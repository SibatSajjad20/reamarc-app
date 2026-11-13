import * as XLSX from 'xlsx';
import type { ContentCalendarItem } from '../types/contentCalendar';
import { PIPELINE_STAGES } from '../types/contentCalendar';
import { EXCEL_COLUMNS } from './contentCalendarExcel';

function findMatchingClient(
  clientName: string | undefined | null,
  clients: Array<{ id: string; name: string }> = [],
): { id: string; name: string } | undefined {
  if (!clientName || !clients.length) return undefined;
  const target = clientName.trim().toLowerCase();
  const exact = clients.find((c) => c.name.toLowerCase() === target);
  if (exact) return exact;
  const cleanTarget = target.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const c of clients) {
    const cleanC = c.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanC === cleanTarget) return c;
  }
  const words = cleanTarget.split(' ').filter((w) => w.length > 2);
  return clients.find((c) => {
    const cleanC = c.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanC.includes(cleanTarget) || cleanTarget.includes(cleanC)) return true;
    return words.length >= 2 && words.every((w) => cleanC.includes(w));
  });
}

export type ImportMode = 'create' | 'update' | 'mixed';
export type MergePolicy = 'overwrite' | 'fill_blanks';
export type UnmatchedPolicy = 'skip' | 'insert';
export type FieldRole = 'match' | 'data' | 'locked' | 'create_only';

export interface ImportFieldDef {
  key: string;
  label: string;
  role: FieldRole;
  defaultUpdate?: boolean;
}

export const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'id', label: 'Record ID', role: 'match' },
  { key: 'serial', label: 'Serial', role: 'match' },
  { key: 'client_name', label: 'Client', role: 'create_only' },
  { key: 'campaign_type', label: 'Campaign Type', role: 'data' },
  { key: 'creative_type', label: 'Creative Type', role: 'data' },
  { key: 'content_type', label: 'Content Type', role: 'data' },
  { key: 'creative_category', label: 'Creative Category', role: 'data' },
  { key: 'content_pillar', label: 'Content Pillar', role: 'data' },
  { key: 'content_concept', label: 'Content Concept', role: 'data' },
  { key: 'offer', label: 'Offer', role: 'data' },
  { key: 'production_direction', label: 'Production Direction', role: 'data' },
  { key: 'primary_text', label: 'Primary Text (Ad Copy)', role: 'data' },
  { key: 'headlines_hooks', label: 'Headlines / Hooks', role: 'data' },
  { key: 'content_on_creative', label: 'Content On Creative', role: 'data' },
  { key: 'cta', label: 'CTA', role: 'data' },
  { key: 'captions_hashtags', label: 'Captions / Hashtags', role: 'data' },
  { key: 'design_due', label: 'Design Due', role: 'data', defaultUpdate: true },
  { key: 'publish_date', label: 'Publish Date', role: 'data', defaultUpdate: true },
  { key: 'draft_preview_link', label: 'Draft Preview Link', role: 'data' },
  { key: 'final_asset_link', label: 'Final Asset Link', role: 'data' },
  { key: 'setup_status', label: 'Setup Status', role: 'data' },
  { key: 'notes', label: 'Notes', role: 'data' },
  { key: 'channels', label: 'Channels', role: 'data' },
  { key: 'stage', label: 'Pipeline Stage', role: 'locked' },
  { key: 'approval_status', label: 'Approval Status', role: 'locked' },
  { key: 'design_owner', label: 'Owner', role: 'locked' },
];

const SKIP_VALUE = '__skip__';

export const SKIP_FIELD = SKIP_VALUE;

export function normalizeHeader(h: string): string {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const ALIAS_TO_FIELD: Record<string, string> = {
  serial: 'serial',
  serialid: 'serial',
  sr: 'serial',
  sno: 'serial',
  recordid: 'id',
  itemid: 'id',
  campaignid: 'id',
  id: 'id',
  client: 'client_name',
  clientname: 'client_name',
  campaigntype: 'campaign_type',
  campaign: 'campaign_type',
  creativetype: 'creative_type',
  format: 'creative_type',
  contenttype: 'content_type',
  scheduledruntime: 'content_type',
  scheduletype: 'content_type',
  creativecategory: 'creative_category',
  postingtype: 'creative_category',
  contentpillar: 'content_pillar',
  pillar: 'content_pillar',
  contentconcept: 'content_concept',
  concept: 'content_concept',
  topictheme: 'content_concept',
  topic: 'content_concept',
  title: 'content_concept',
  offer: 'offer',
  productiondirection: 'production_direction',
  idea: 'production_direction',
  direction: 'production_direction',
  designdue: 'design_due',
  designcompletion: 'design_due',
  due: 'design_due',
  primarytext: 'primary_text',
  adcopy: 'primary_text',
  copy: 'primary_text',
  postdescription: 'primary_text',
  description: 'primary_text',
  headlineshooks: 'headlines_hooks',
  headlines: 'headlines_hooks',
  hooks: 'headlines_hooks',
  contentoncreative: 'content_on_creative',
  copyoncreative: 'content_on_creative',
  cta: 'cta',
  postcta: 'cta',
  calltoaction: 'cta',
  captionshashtags: 'captions_hashtags',
  captions: 'captions_hashtags',
  hashtags: 'captions_hashtags',
  keywords: 'captions_hashtags',
  postingdate: 'publish_date',
  publishdate: 'publish_date',
  postdate: 'publish_date',
  scheduledate: 'publish_date',
  date: 'publish_date',
  draftpreviewlink: 'draft_preview_link',
  previewlink: 'draft_preview_link',
  draft: 'draft_preview_link',
  finalassetlink: 'final_asset_link',
  assetlink: 'final_asset_link',
  pipelinestage: 'stage',
  stage: 'stage',
  approvalstatus: 'approval_status',
  approval: 'approval_status',
  setupstatus: 'setup_status',
  setup: 'setup_status',
  notes: 'notes',
  note: 'notes',
};

for (const col of EXCEL_COLUMNS) {
  ALIAS_TO_FIELD[normalizeHeader(col.header)] = col.key;
  ALIAS_TO_FIELD[normalizeHeader(col.key)] = col.key;
}

export function suggestFieldForHeader(header: string): string | null {
  const norm = normalizeHeader(header);
  if (!norm) return null;
  if (ALIAS_TO_FIELD[norm]) return ALIAS_TO_FIELD[norm];
  if (norm.includes('designdue') || (norm.includes('design') && norm.includes('date'))) {
    return 'design_due';
  }
  if (norm.includes('publish') || norm.includes('postingdate')) return 'publish_date';
  if (norm.includes('recordid')) return 'id';
  for (const [alias, field] of Object.entries(ALIAS_TO_FIELD)) {
    if (alias.length >= 5 && (norm.includes(alias) || alias.includes(norm))) {
      return field;
    }
  }
  return null;
}

export function parseDateValue(val: unknown): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }
  const str = String(val).trim();
  if (!str) return null;
  const num = Number(str);
  if (!Number.isNaN(num) && num > 30000 && num < 60000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    return d.toISOString().split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return d.toISOString().split('T')[0];
  }
  return str;
}

function rowHasValues(row: unknown[]): boolean {
  return row.some((c) => String(c ?? '').trim() !== '');
}

function looksLikeGroupRow(row: unknown[]): boolean {
  const cells = row.map((c) => String(c ?? '').trim()).filter(Boolean);
  if (cells.length === 0) return false;
  const groups = new Set(['DEFINITION', 'PRODUCTION', 'ASSETS', 'APPROVAL', 'SETUP']);
  const hits = cells.filter((c) => groups.has(c.toUpperCase())).length;
  return hits >= 2;
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  const norms = row.map((c) => normalizeHeader(String(c ?? '')));
  const hasSerial = norms.some((n) => n === 'serial' || n === 'serialid' || n === 'recordid' || n === 'id');
  const hasConcept = norms.some(
    (n) =>
      n.includes('creative') ||
      n.includes('concept') ||
      n.includes('campaign') ||
      n.includes('topic') ||
      n.includes('publish') ||
      n.includes('date') ||
      n.includes('status'),
  );
  return hasSerial && hasConcept;
}

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: unknown[][];
  mapping: Record<number, string | null>;
}

export function parseSpreadsheetBuffer(buffer: ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames.includes('Production & Approval')
    ? 'Production & Approval'
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error('Worksheet is empty or could not be found.');
  }
  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (grid.length < 2) {
    throw new Error('File does not contain enough data rows.');
  }

  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    if (looksLikeGroupRow(grid[i])) continue;
    if (looksLikeHeaderRow(grid[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    headerIdx = looksLikeGroupRow(grid[0]) ? 1 : 0;
  }

  const headerRow = grid[headerIdx] || [];
  const headers = headerRow.map((c, idx) => {
    const raw = String(c ?? '').trim();
    return raw || `Column ${idx + 1}`;
  });
  while (headers.length && !String(headerRow[headers.length - 1] ?? '').trim()) {
    headers.pop();
  }

  const used = new Set<string>();
  const mapping: Record<number, string | null> = {};
  headers.forEach((h, idx) => {
    const suggested = suggestFieldForHeader(h);
    if (suggested && !used.has(suggested)) {
      mapping[idx] = suggested;
      used.add(suggested);
    } else {
      mapping[idx] = null;
    }
  });

  const rows = grid
    .slice(headerIdx + 1)
    .filter((row) => rowHasValues(row))
    .filter((row) => !looksLikeHeaderRow(row) && !looksLikeGroupRow(row));

  if (rows.length === 0) {
    throw new Error('No valid campaign records found in file. Please verify column headers.');
  }
  if (rows.length > 10000) {
    throw new Error('This file has more than 10,000 campaigns. Split it into smaller workbooks and import those.');
  }

  return { sheetName, headers, rows, mapping };
}

export interface MappedImportRow {
  row: number;
  values: Record<string, string | null>;
}

function coerceCell(field: string, raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  let str = String(raw).trim();
  if (!str) return null;
  if (str.includes('||')) {
    str = str.split('||')[0].trim();
  }
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    str = `'${str}`;
  }
  if (field === 'publish_date' || field === 'design_due') {
    return parseDateValue(str);
  }
  return str;
}

export function applyColumnMapping(
  parsed: ParsedSheet,
  mapping: Record<number, string | null>,
): MappedImportRow[] {
  return parsed.rows.map((row, idx) => {
    const values: Record<string, string | null> = {};
    Object.entries(mapping).forEach(([colIdxStr, field]) => {
      if (!field) return;
      const colIdx = Number(colIdxStr);
      const coerced = coerceCell(field, row[colIdx]);
      if (coerced !== null) values[field] = coerced;
    });
    return { row: idx + 1, values };
  }).filter((r) => Object.keys(r.values).length > 0);
}

export function defaultSelectedFields(
  mode: ImportMode,
  mapping: Record<number, string | null>,
): string[] {
  const mapped = new Set(Object.values(mapping).filter(Boolean) as string[]);
  return IMPORT_FIELDS.filter((f) => {
    if (!mapped.has(f.key)) return false;
    if (f.role === 'locked' || f.role === 'match') return false;
    if (mode === 'create') return f.role === 'data' || f.role === 'create_only';
    if (f.role === 'create_only') return false;
    return Boolean(f.defaultUpdate);
  }).map((f) => f.key);
}

export function transferableFieldsForMode(mode: ImportMode): ImportFieldDef[] {
  return IMPORT_FIELDS.filter((f) => {
    if (f.role === 'locked' || f.role === 'match') return false;
    if (mode === 'update' && f.role === 'create_only') return false;
    return true;
  });
}

interface RawImportItem {
  sheetRef?: string;
  detectedClient?: string;
  item: Partial<ContentCalendarItem>;
}

/** Create-mode sanitizer: Excel serials are never reused. */
export const prepareItems = (
  rawList: RawImportItem[],
  selectedClient: string,
  forceSelectedClient: boolean,
  activeClients: Array<{ id: string; name: string }> = [],
): Partial<ContentCalendarItem>[] => {
  const limits: Partial<Record<keyof ContentCalendarItem, number>> = {
    content_concept: 300,
    primary_text: 8000,
    headlines_hooks: 4000,
    content_on_creative: 4000,
    production_direction: 4000,
    captions_hashtags: 2000,
    notes: 8000,
    client_name: 160,
  };
  const knownStages = new Set<string>(PIPELINE_STAGES);

  return rawList.map((raw, idx) => {
    const next = { ...raw.item };
    const effectiveClient = (forceSelectedClient || !raw.detectedClient)
      ? selectedClient
      : raw.detectedClient;

    const matchedWs = findMatchingClient(effectiveClient, activeClients) || findMatchingClient(selectedClient, activeClients);
    if (matchedWs) {
      next.client_name = matchedWs.name;
      next.workspace_id = matchedWs.id;
    } else {
      next.client_name = effectiveClient;
    }

    delete next.serial;
    delete (next as { id?: string }).id;

    if (!next.content_concept) {
      next.content_concept =
        next.content_on_creative?.slice(0, 100) ||
        next.production_direction?.slice(0, 100) ||
        next.primary_text?.split('\n')[0]?.slice(0, 100) ||
        `Asset ${idx + 1}`;
    }

    (Object.keys(limits) as (keyof ContentCalendarItem)[]).forEach((field) => {
      const rawVal = next[field];
      const limit = limits[field];
      if (typeof rawVal === 'string' && limit && rawVal.length > limit) {
        (next as Record<string, string>)[field] = rawVal.slice(0, limit);
      }
    });

    for (const field of ['draft_preview_link', 'final_asset_link'] as const) {
      const link = String(next[field] || '').trim();
      if (!link) continue;
      try {
        const url = new URL(link);
        if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username) {
          delete next[field];
        }
      } catch {
        delete next[field];
      }
    }

    if (next.stage && !knownStages.has(next.stage)) {
      next.stage = 'Content';
    }

    if (!next.content_type) {
      next.content_type = 'Scheduled';
    }
    if (!next.creative_category) {
      next.creative_category = 'Organic Creative';
    }

    return next;
  });
};

export function mappedRowsToCreatePayload(
  rows: MappedImportRow[],
  selectedClient: string,
  forceSelectedClient: boolean,
  activeClients: Array<{ id: string; name: string }>,
): Partial<ContentCalendarItem>[] {
  const raw: RawImportItem[] = rows.map((r) => ({
    sheetRef: r.values.serial || undefined,
    detectedClient: r.values.client_name || undefined,
    item: { ...r.values } as Partial<ContentCalendarItem>,
  }));
  return prepareItems(raw, selectedClient, forceSelectedClient, activeClients);
}
