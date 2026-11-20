/**
 * Overview tab aggregations (staff only), computed from the items the calendar already loaded.
 * No AI, no extra requests: counting and grouping only.
 */
import type { ContentCalendarItem } from '../types/contentCalendar';
import type { ContentExpectations } from '../types';
import {
  calculateClientExpectationSummary,
  itemBelongsToClient,
  normalizeCreativeType,
} from './contentCalendarExpectations';
import { canonicalCreativeTypeLabel } from './contentCalendarOverview';
import { getContentCalendarBucket, getContentCalendarTargetDate } from './contentCalendarWorkflow';

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------
export type OverviewPeriod = 'all' | 'this_month' | 'last_month' | 'last_30' | 'next_30' | 'custom';

export interface DateRange {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
}

export const PERIOD_LABELS: Record<OverviewPeriod, string> = {
  all: 'All time',
  this_month: 'This month',
  last_month: 'Last month',
  last_30: 'Last 30 days',
  next_30: 'Next 30 days',
  custom: 'Custom',
};

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function periodRange(period: OverviewPeriod, now: Date = new Date(), custom?: DateRange | null): DateRange | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case 'this_month':
      return { start: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), end: ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
    case 'last_month':
      return { start: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), end: ymd(new Date(today.getFullYear(), today.getMonth(), 0)) };
    case 'last_30':
      return { start: ymd(addDays(today, -30)), end: ymd(today) };
    case 'next_30':
      return { start: ymd(today), end: ymd(addDays(today, 30)) };
    case 'custom':
      if (custom && custom.start && custom.end) {
        return custom.start <= custom.end ? custom : { start: custom.end, end: custom.start };
      }
      return null;
    default:
      return null;
  }
}

/** The single calendar month a range covers ("YYYY-MM"), or null when it spans months. */
export function singleMonthOf(range: DateRange | null): string | null {
  if (!range) return null;
  const a = range.start.slice(0, 7);
  return a === range.end.slice(0, 7) ? a : null;
}

/** Same month placement as the expectations banner: publish date, else design due, else created. */
export function effectiveDate(item: ContentCalendarItem): string {
  const raw = item.publish_date || item.design_due || item.created_at || '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw).trim());
  return m ? m[1] : '';
}

export function inRange(item: ContentCalendarItem, range: DateRange | null): boolean {
  if (!range) return true;
  const d = effectiveDate(item);
  return Boolean(d) && d >= range.start && d <= range.end;
}

// ---------------------------------------------------------------------------
// Stage buckets
// ---------------------------------------------------------------------------
export type StageBucket = 'content' | 'review' | 'revision' | 'production' | 'ready' | 'posted' | 'rejected';

export const STAGE_BUCKETS: { key: StageBucket; label: string; color: string }[] = [
  { key: 'content', label: 'Content', color: 'var(--chart-2)' },
  { key: 'review', label: 'In review', color: 'var(--chart-5)' },
  { key: 'revision', label: 'Revision', color: 'var(--danger-dot)' },
  { key: 'production', label: 'Production', color: 'var(--chart-1)' },
  { key: 'ready', label: 'Ready', color: 'var(--chart-3)' },
  { key: 'posted', label: 'Posted', color: 'var(--chart-4)' },
  { key: 'rejected', label: 'Rejected', color: 'var(--text-muted)' },
];

const STAGE_TO_BUCKET: Record<string, StageBucket> = {
  Content: 'content',
  'Content Internal Review': 'review',
  'Content Client Review': 'review',
  'Creative Internal Review': 'review',
  'Creative Client Review': 'review',
  'Content Revision': 'revision',
  'Creative Revision': 'revision',
  'Creative Production': 'production',
  'Ready to Post': 'ready',
  Posted: 'posted',
  Rejected: 'rejected',
};

export function stageBucket(stage?: string | null): StageBucket {
  return STAGE_TO_BUCKET[(stage || '').trim()] || 'content';
}

export function isClientReviewStage(stage?: string | null): boolean {
  return stage === 'Content Client Review' || stage === 'Creative Client Review';
}

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------
export type OverviewDimension =
  | 'creative_type'
  | 'channel'
  | 'pillar'
  | 'category'
  | 'content_type'
  | 'campaign'
  | 'offer'
  | 'assignee';

export const DIMENSIONS: { key: OverviewDimension; label: string }[] = [
  { key: 'creative_type', label: 'Creative type' },
  { key: 'channel', label: 'Channel' },
  { key: 'pillar', label: 'Pillar' },
  { key: 'category', label: 'Organic vs ad' },
  { key: 'content_type', label: 'Scheduled vs runtime' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'offer', label: 'Offer' },
  { key: 'assignee', label: 'Assignee' },
];

export const NOT_SET = 'Not set';

function clean(v?: string | null): string {
  return (v || '').replace(/\s+/g, ' ').trim();
}

function titleChannel(v: string): string {
  const k = v.toLowerCase();
  const known: Record<string, string> = {
    instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', tiktok: 'TikTok',
    youtube: 'YouTube', meta: 'Meta', google: 'Google', x: 'X', twitter: 'X',
  };
  return known[k] || v;
}

/** Row value(s) an item falls under. Channel is multi-valued (one item can post to several). */
export function dimensionValues(item: ContentCalendarItem, dim: OverviewDimension): string[] {
  switch (dim) {
    case 'creative_type': {
      const raw = clean(item.creative_type);
      return [raw ? canonicalCreativeTypeLabel(raw) : NOT_SET];
    }
    case 'channel': {
      const chans = Array.from(
        new Set((item.channels || []).map((c) => clean(c)).filter(Boolean).map(titleChannel)),
      );
      return chans.length ? chans : [NOT_SET];
    }
    case 'pillar':
      return [clean(item.content_pillar) || NOT_SET];
    case 'category': {
      const cat = clean(item.creative_category || item.posting_type) || 'Organic Creative';
      return [/\b(ad(\s+creative)?|performance)\b/i.test(cat) ? 'Ad creative' : 'Organic creative'];
    }
    case 'content_type': {
      const ct = clean(item.content_type) || 'Scheduled';
      return [/runtime/i.test(ct) ? 'Runtime' : /scheduled/i.test(ct) ? 'Scheduled' : ct];
    }
    case 'campaign':
      return [clean(item.campaign_type) || NOT_SET];
    case 'offer':
      return [clean(item.offer) || NOT_SET];
    case 'assignee':
      return [clean(item.assignee_name) || 'Unassigned'];
    default:
      return [NOT_SET];
  }
}

// ---------------------------------------------------------------------------
// Expectations (plan) for a month
// ---------------------------------------------------------------------------
export interface OverviewClient {
  id: string;
  name: string;
  content_expectations?: ContentExpectations | null;
}

function monthRef(month: string): Date {
  const [y, m] = month.split('-').map((v) => parseInt(v, 10));
  return new Date(y, m - 1, 15);
}

/** Expected count per normalized creative type for the given clients and month. */
export function expectedByType(
  items: ContentCalendarItem[],
  clients: OverviewClient[],
  month: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of clients) {
    const summary = calculateClientExpectationSummary(items, c, monthRef(month));
    if (!summary) continue;
    for (const line of summary.lines) {
      if (line.expected == null) continue;
      const key = normalizeCreativeType(line.creative_type);
      out.set(key, (out.get(key) || 0) + line.expected);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------
export type PlanStatus = 'met' | 'on_track' | 'at_risk';

export interface MatrixRow {
  value: string;
  counts: Record<StageBucket, number>;
  total: number;
  posted: number;
  open: number;
  expected: number | null;
  pct: number;
  status: PlanStatus | null;
}

export interface OverviewMatrix {
  dimension: OverviewDimension;
  rows: MatrixRow[];
  totals: MatrixRow;
  /** Bucket columns that have at least one item (Rejected only when present). */
  columns: StageBucket[];
  hasExpected: boolean;
}

function emptyCounts(): Record<StageBucket, number> {
  return { content: 0, review: 0, revision: 0, production: 0, ready: 0, posted: 0, rejected: 0 };
}

export function planStatus(posted: number, open: number, expected: number | null): PlanStatus | null {
  if (expected == null || expected <= 0) return null;
  if (posted >= expected) return 'met';
  if (posted + open >= expected) return 'on_track';
  return 'at_risk';
}

function finishRow(value: string, counts: Record<StageBucket, number>, expected: number | null): MatrixRow {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const posted = counts.posted;
  const open = total - posted - counts.rejected;
  const base = expected != null && expected > 0 ? expected : total;
  return {
    value,
    counts,
    total,
    posted,
    open,
    expected,
    pct: base > 0 ? Math.round((posted / base) * 100) : 0,
    status: planStatus(posted, open, expected),
  };
}

export function buildOverviewMatrix(
  items: ContentCalendarItem[],
  dimension: OverviewDimension,
  expected?: Map<string, number> | null,
): OverviewMatrix {
  const byValue = new Map<string, Record<StageBucket, number>>();
  const totals = emptyCounts();
  for (const it of items) {
    const b = stageBucket(it.stage);
    totals[b] += 1;
    for (const v of dimensionValues(it, dimension)) {
      if (!byValue.has(v)) byValue.set(v, emptyCounts());
      byValue.get(v)![b] += 1;
    }
  }
  const useExpected = dimension === 'creative_type' && Boolean(expected && expected.size > 0);
  // Plan lines with nothing on the calendar still show up (0 posted, at risk).
  if (useExpected) {
    for (const [key, n] of expected!) {
      if (n <= 0 || key === 'story') continue;
      const label = canonicalCreativeTypeLabel(key);
      if (![...byValue.keys()].some((v) => normalizeCreativeType(v) === key)) byValue.set(label, emptyCounts());
    }
  }
  const rows = [...byValue.entries()].map(([value, counts]) => {
    const exp = useExpected ? expected!.get(normalizeCreativeType(value)) ?? null : null;
    return finishRow(value, counts, exp);
  });
  rows.sort((a, b) => {
    if (a.value === NOT_SET || a.value === 'Unassigned') return 1;
    if (b.value === NOT_SET || b.value === 'Unassigned') return -1;
    return b.total - a.total || (b.expected ?? 0) - (a.expected ?? 0) || a.value.localeCompare(b.value);
  });
  const expectedTotal = useExpected ? rows.reduce((s, r) => s + (r.expected ?? 0), 0) : null;
  // Totals count items once (channel rows can overlap).
  const totalRow = finishRow('Total', totals, expectedTotal);
  if (useExpected) {
    // Posted toward plan: count posted per plan line, capped at the line's expected.
    const delivered = rows.reduce((s, r) => s + (r.expected != null ? Math.min(r.posted, r.expected) : 0), 0);
    totalRow.pct = expectedTotal ? Math.round((delivered / expectedTotal) * 100) : 0;
  }
  const columns = STAGE_BUCKETS.map((c) => c.key).filter((k) => totals[k] > 0);
  return { dimension, rows, totals: totalRow, columns, hasExpected: useExpected };
}

// ---------------------------------------------------------------------------
// Drill-down from a matrix cell into the sheet
// ---------------------------------------------------------------------------
export interface OverviewDrill {
  dimension: OverviewDimension;
  value: string;
  bucket?: StageBucket | null;
  range?: DateRange | null;
  /** Human label for the filter chip. */
  label: string;
}

export function itemMatchesDrill(item: ContentCalendarItem, drill: OverviewDrill | null | undefined): boolean {
  if (!drill) return true;
  if (drill.bucket && stageBucket(item.stage) !== drill.bucket) return false;
  if (!inRange(item, drill.range || null)) return false;
  return dimensionValues(item, drill.dimension).includes(drill.value);
}

// ---------------------------------------------------------------------------
// KPIs, next 7 days, clients, attention, workload
// ---------------------------------------------------------------------------
function daysBetween(fromYmd: string, toYmd: string): number {
  const [a, b, c] = fromYmd.split('-').map((v) => parseInt(v, 10));
  const [d, e, f] = toYmd.split('-').map((v) => parseInt(v, 10));
  return Math.round((new Date(d, e - 1, f).getTime() - new Date(a, b - 1, c).getTime()) / 86_400_000);
}

/** Days since the item last changed (updated_at is the only timestamp we keep for stage moves). */
export function daysSinceUpdate(item: ContentCalendarItem, now: Date = new Date()): number | null {
  const raw = item.updated_at || item.created_at;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function overdueDays(item: ContentCalendarItem, now: Date = new Date()): number {
  const { dateStr } = getContentCalendarTargetDate(item);
  if (!dateStr) return 0;
  return Math.max(0, daysBetween(dateStr.slice(0, 10), ymd(now)));
}

export function isOverdue(item: ContentCalendarItem, now: Date = new Date()): boolean {
  return getContentCalendarBucket(item, now) === 'overdue';
}

export interface OverviewKpis {
  posted: number;
  planned: number | null;
  delivered: number | null;
  left: number | null;
  percent: number | null;
  total: number;
  awaitingClient: number;
  oldestWaitDays: number | null;
  inRevision: number;
  overdue: number;
  ready: number;
  inProduction: number;
}

export function calculateOverviewKpis(
  scoped: ContentCalendarItem[],
  plan: { planned: number; delivered: number; left: number } | null,
  now: Date = new Date(),
): OverviewKpis {
  let posted = 0, awaiting = 0, revision = 0, overdue = 0, ready = 0, production = 0;
  let oldest: number | null = null;
  for (const it of scoped) {
    const b = stageBucket(it.stage);
    if (b === 'posted') posted += 1;
    if (b === 'revision') revision += 1;
    if (b === 'ready') ready += 1;
    if (b === 'content' || b === 'production') production += 1;
    if (isClientReviewStage(it.stage)) {
      awaiting += 1;
      const w = daysSinceUpdate(it, now);
      if (w != null && (oldest == null || w > oldest)) oldest = w;
    }
    if (isOverdue(it, now)) overdue += 1;
  }
  return {
    posted,
    planned: plan ? plan.planned : null,
    delivered: plan ? plan.delivered : null,
    left: plan ? plan.left : null,
    percent: plan && plan.planned > 0 ? Math.round((plan.delivered / plan.planned) * 100) : null,
    total: scoped.length,
    awaitingClient: awaiting,
    oldestWaitDays: oldest,
    inRevision: revision,
    overdue,
    ready,
    inProduction: production,
  };
}

export interface PlanTotals {
  planned: number;
  delivered: number;
  left: number;
}

export function planTotals(items: ContentCalendarItem[], clients: OverviewClient[], month: string): PlanTotals | null {
  let planned = 0, delivered = 0, left = 0, any = false;
  for (const c of clients) {
    const s = calculateClientExpectationSummary(items, c, monthRef(month));
    if (!s) continue;
    any = true;
    planned += s.expectedTotal;
    delivered += s.deliveredTotal;
    left += s.leftoverTotal;
  }
  return any && planned > 0 ? { planned, delivered, left } : null;
}

export interface UpcomingDay {
  date: string;
  count: number;
  isToday: boolean;
}

export function nextSevenDays(items: ContentCalendarItem[], now: Date = new Date()): UpcomingDay[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days: UpcomingDay[] = [];
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it.stage === 'Posted' || it.stage === 'Rejected') continue;
    const d = (it.publish_date || '').slice(0, 10);
    if (d) counts.set(d, (counts.get(d) || 0) + 1);
  }
  for (let i = 0; i < 7; i += 1) {
    const d = ymd(addDays(today, i));
    days.push({ date: d, count: counts.get(d) || 0, isToday: i === 0 });
  }
  return days;
}

export interface ClientPlanRow {
  id: string;
  name: string;
  expected: number | null;
  posted: number;
  inProgress: number;
  gap: number | null;
  pct: number | null;
  status: PlanStatus | null;
  awaiting: number;
  overdue: number;
  typesShort: number;
}

export function clientPlanRows(
  items: ContentCalendarItem[],
  clients: OverviewClient[],
  month: string,
  now: Date = new Date(),
): ClientPlanRow[] {
  const range: DateRange = {
    start: `${month}-01`,
    end: ymd(new Date(parseInt(month.slice(0, 4), 10), parseInt(month.slice(5, 7), 10), 0)),
  };
  const rows: ClientPlanRow[] = [];
  for (const c of clients) {
    const own = items.filter((it) => itemBelongsToClient(it, c) && inRange(it, range));
    const summary = calculateClientExpectationSummary(items, c, monthRef(month));
    const inProgress = own.filter((it) => it.stage !== 'Posted' && it.stage !== 'Rejected').length;
    const postedAll = own.filter((it) => it.stage === 'Posted').length;
    if (!summary && own.length === 0) continue;
    const quota = summary ? summary.lines.filter((l) => l.expected != null) : [];
    const expected = summary && summary.expectedTotal > 0 ? summary.expectedTotal : null;
    const delivered = summary ? summary.deliveredTotal : postedAll;
    const typesShort = quota.filter((l) => {
      const key = normalizeCreativeType(l.creative_type);
      const open = own.filter(
        (it) => normalizeCreativeType(it.creative_type) === key && it.stage !== 'Posted' && it.stage !== 'Rejected',
      ).length;
      return (l.expected || 0) > l.posted + open;
    }).length;
    rows.push({
      id: c.id,
      name: c.name,
      expected,
      posted: expected != null ? delivered : postedAll,
      inProgress,
      gap: expected != null && summary ? summary.leftoverTotal : null,
      pct: expected != null ? Math.round((delivered / expected) * 100) : null,
      status: planStatus(delivered, inProgress, expected),
      awaiting: own.filter((it) => isClientReviewStage(it.stage)).length,
      overdue: own.filter((it) => isOverdue(it, now)).length,
      typesShort,
    });
  }
  const rank = (r: ClientPlanRow) => (r.status === 'at_risk' ? 0 : r.status === 'on_track' ? 1 : r.status === 'met' ? 2 : 3);
  rows.sort((a, b) => rank(a) - rank(b) || (a.pct ?? 101) - (b.pct ?? 101) || a.name.localeCompare(b.name));
  return rows;
}

export type AttentionKind = 'overdue' | 'awaiting' | 'revision_soon';

export interface AttentionItem {
  item: ContentCalendarItem;
  kind: AttentionKind;
  days: number;
}

export function needsAttention(items: ContentCalendarItem[], now: Date = new Date(), limit = 8): AttentionItem[] {
  const out: AttentionItem[] = [];
  const today = ymd(now);
  for (const it of items) {
    if (it.stage === 'Posted' || it.stage === 'Rejected') continue;
    if (isOverdue(it, now)) {
      out.push({ item: it, kind: 'overdue', days: overdueDays(it, now) });
      continue;
    }
    if (isClientReviewStage(it.stage)) {
      out.push({ item: it, kind: 'awaiting', days: daysSinceUpdate(it, now) ?? 0 });
      continue;
    }
    const pub = (it.publish_date || '').slice(0, 10);
    if (stageBucket(it.stage) === 'revision' && pub) {
      const until = daysBetween(today, pub);
      if (until >= 0 && until <= 3) out.push({ item: it, kind: 'revision_soon', days: until });
    }
  }
  const rank: Record<AttentionKind, number> = { overdue: 0, revision_soon: 1, awaiting: 2 };
  out.sort((a, b) =>
    rank[a.kind] - rank[b.kind] || (a.kind === 'revision_soon' ? a.days - b.days : b.days - a.days),
  );
  return out.slice(0, limit);
}

export interface WorkloadRow {
  name: string;
  active: number;
  inRevision: number;
  overdue: number;
  posted: number;
}

export function workloadByAssignee(items: ContentCalendarItem[], now: Date = new Date()): WorkloadRow[] {
  const map = new Map<string, WorkloadRow>();
  for (const it of items) {
    const name = clean(it.assignee_name) || 'Unassigned';
    if (!map.has(name)) map.set(name, { name, active: 0, inRevision: 0, overdue: 0, posted: 0 });
    const r = map.get(name)!;
    const b = stageBucket(it.stage);
    if (b === 'posted') r.posted += 1;
    else if (b !== 'rejected') {
      r.active += 1;
      if (b === 'revision') r.inRevision += 1;
      if (isOverdue(it, now)) r.overdue += 1;
    }
  }
  return [...map.values()]
    .filter((r) => r.active > 0 || r.posted > 0)
    .sort((a, b) => {
      if (a.name === 'Unassigned') return 1;
      if (b.name === 'Unassigned') return -1;
      return b.active - a.active || b.posted - a.posted || a.name.localeCompare(b.name);
    });
}
