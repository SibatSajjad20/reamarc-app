import type { ContentExpectationLine, ContentExpectations } from '../types';
import type { ContentCalendarItem } from '../types/contentCalendar';

export interface ExpectationClientRef {
  id?: string;
  name: string;
  content_expectations?: ContentExpectations | null;
}

export interface ExpectationLineProgress {
  creative_type: string;
  layout?: string | null;
  included: boolean;
  paused: boolean;
  expected: number | null;
  expectedMax: number | null;
  posted: number;
  delivered: number;
  leftover: number;
  extra: number;
}

export interface ClientExpectationSummary {
  clientName: string;
  workspaceId?: string;
  expectedTotal: number;
  deliveredTotal: number;
  leftoverTotal: number;
  extraTotal: number;
  lines: ExpectationLineProgress[];
}

const TYPE_ALIASES: Record<string, string> = {
  static: 'static',
  'static post': 'static',
  'static posts': 'static',
  'static image': 'static',
  'static images': 'static',
  reel: 'reel',
  reels: 'reel',
  story: 'story',
  stories: 'story',
  carousel: 'carousel',
  'grid/carousel': 'carousel',
  grid: 'carousel',
  animated: 'animated post',
  'animated post': 'animated post',
  'animated posts': 'animated post',
  'cover image': 'cover image',
  'cover images': 'cover image',
  cover: 'cover image',
};

function parseLocalMidnight(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const dateOnly = dateStr.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length < 3) {
    const fallback = new Date(dateStr);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    const fallback = new Date(dateStr);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return new Date(year, month, day);
}

export function normalizeCreativeType(value?: string | null): string {
  const key = (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!key) return '';
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  if (/\breels?\b/.test(key)) return 'reel';
  if (/\b(carousel|grid)\b/.test(key)) return 'carousel';
  if (/\bstor(y|ies)\b/.test(key)) return 'story';
  if (/\bcover\b/.test(key)) return 'cover image';
  if (/animat|aimat/.test(key)) return 'animated post';
  if (/\bstatic\b/.test(key)) return 'static';
  if (/\bugc\b/.test(key)) return 'ugc';
  return key;
}

export function monthKey(refDate: Date = new Date()): string {
  const month = String(refDate.getMonth() + 1).padStart(2, '0');
  return `${refDate.getFullYear()}-${month}`;
}

function isExcludedExpectationLine(line: ContentExpectationLine): boolean {
  return normalizeCreativeType(line.creative_type) === 'story';
}

export function hasContentExpectations(exp?: ContentExpectations | null): boolean {
  return Boolean(
    exp?.lines?.some(
      (line) =>
        !isExcludedExpectationLine(line) &&
        (line.included ||
          (line.expected != null && line.expected >= 0) ||
          (line.expected_max != null && line.expected_max >= 0))
    )
  );
}

function collapseName(value?: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function namesEqual(a?: string | null, b?: string | null): boolean {
  return collapseName(a) === collapseName(b);
}

export function itemBelongsToClient(
  item: ContentCalendarItem,
  client: ExpectationClientRef
): boolean {
  if (client.id && item.workspace_id && item.workspace_id === client.id) return true;
  return namesEqual(item.client_name, client.name);
}

function itemInCalendarMonth(item: ContentCalendarItem, refDate: Date): boolean {
  const rawDate = item.publish_date || item.design_due || item.created_at;
  const d = parseLocalMidnight(rawDate);
  if (!d) return false;
  return d.getFullYear() === refDate.getFullYear() && d.getMonth() === refDate.getMonth();
}

function isPosted(item: ContentCalendarItem): boolean {
  return (item.stage || '').trim() === 'Posted';
}

function lineIsPaused(line: ContentExpectationLine, refDate: Date): boolean {
  const skips = line.skip_months || [];
  return skips.includes(monthKey(refDate));
}

function progressForLine(
  line: ContentExpectationLine,
  posted: number,
  refDate: Date
): ExpectationLineProgress {
  const paused = lineIsPaused(line, refDate);
  const min = line.expected == null ? null : line.expected;
  const max = line.expected_max == null ? min : line.expected_max;
  const included = Boolean(line.included) || min == null;

  if (paused) {
    return {
      creative_type: line.creative_type,
      layout: line.layout,
      included: true,
      paused: true,
      expected: null,
      expectedMax: max,
      posted,
      delivered: 0,
      leftover: 0,
      extra: 0,
    };
  }

  if (min == null) {
    return {
      creative_type: line.creative_type,
      layout: line.layout,
      included: true,
      paused: false,
      expected: null,
      expectedMax: null,
      posted,
      delivered: posted,
      leftover: 0,
      extra: 0,
    };
  }

  const ceiling = max == null ? min : Math.max(min, max);
  const leftover = Math.max(0, min - posted);
  const extra = Math.max(0, posted - ceiling);
  return {
    creative_type: line.creative_type,
    layout: line.layout,
    included,
    paused: false,
    expected: min,
    expectedMax: ceiling,
    posted,
    delivered: Math.min(posted, min),
    leftover,
    extra,
  };
}

export function calculateClientExpectationSummary(
  items: ContentCalendarItem[],
  client: ExpectationClientRef,
  refDate: Date = new Date()
): ClientExpectationSummary | null {
  if (!hasContentExpectations(client.content_expectations)) return null;
  const lines = client.content_expectations!.lines.filter((line) => !isExcludedExpectationLine(line));
  if (!lines.length) return null;
  const clientItems = items.filter(
    (item) => itemBelongsToClient(item, client) && itemInCalendarMonth(item, refDate) && isPosted(item)
  );

  const progressLines = lines.map((line) => {
    const typeKey = normalizeCreativeType(line.creative_type);
    const posted = clientItems.filter(
      (item) => normalizeCreativeType(item.creative_type) === typeKey
    ).length;
    return progressForLine(line, posted, refDate);
  });

  const quotaLines = progressLines.filter((line) => line.expected != null);
  return {
    clientName: client.name,
    workspaceId: client.id,
    expectedTotal: quotaLines.reduce((sum, line) => sum + (line.expected || 0), 0),
    deliveredTotal: quotaLines.reduce((sum, line) => sum + line.delivered, 0),
    leftoverTotal: quotaLines.reduce((sum, line) => sum + line.leftover, 0),
    extraTotal: quotaLines.reduce((sum, line) => sum + line.extra, 0),
    lines: progressLines,
  };
}

export function calculateExpectationSummaries(
  items: ContentCalendarItem[],
  clients: ExpectationClientRef[],
  refDate: Date = new Date()
): ClientExpectationSummary[] {
  const summaries: ClientExpectationSummary[] = [];
  for (const client of clients) {
    const summary = calculateClientExpectationSummary(items, client, refDate);
    if (summary) summaries.push(summary);
  }
  return summaries;
}

export function findClientForFilter(
  clients: ExpectationClientRef[],
  clientFilter: string
): ExpectationClientRef | undefined {
  const name = (clientFilter || '').trim();
  if (!name || name === 'all') return undefined;
  return clients.find((client) => namesEqual(client.name, name));
}
