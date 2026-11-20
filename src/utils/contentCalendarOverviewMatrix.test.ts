import { describe, expect, it } from 'vitest';
import type { ContentCalendarItem } from '../types/contentCalendar';
import {
  buildOverviewMatrix,
  calculateOverviewKpis,
  clientPlanRows,
  dimensionValues,
  expectedByType,
  itemMatchesDrill,
  needsAttention,
  nextSevenDays,
  periodRange,
  planTotals,
  singleMonthOf,
  stageBucket,
  workloadByAssignee,
  DIMENSIONS,
  normalizeDimension,
  type OverviewDimension,
} from './contentCalendarOverviewMatrix';

const NOW = new Date(2026, 10, 20, 12); // 20 Nov 2026 local

let seq = 0;
function it_(stage: string, extra: Partial<ContentCalendarItem> = {}): ContentCalendarItem {
  seq += 1;
  return {
    id: `i${seq}`, serial: `S-${seq}`, client_name: 'Example Co', workspace_id: 'ws1', campaign_type: 'Launch',
    creative_type: 'Video', content_type: 'Scheduled', creative_category: 'Organic Creative', content_pillar: 'Product',
    content_concept: `Item ${seq}`, offer: 'Free trial', cta: '', approval_status: '', setup_status: '',
    stage: stage as ContentCalendarItem['stage'], publish_date: '2026-11-25', channels: ['instagram'],
    created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-16T12:00:00Z', ...extra,
  } as ContentCalendarItem;
}

const items: ContentCalendarItem[] = [
  it_('Posted', { publish_date: '2026-11-03', creative_type: 'Reels', channels: ['instagram', 'facebook'], assignee_name: 'Aisha' }),
  it_('Posted', { publish_date: '2026-11-05', creative_type: 'static post', creative_category: 'Ad Creative' }),
  it_('Posted', { publish_date: '2026-11-06' }),
  it_('Content', { publish_date: '2026-11-28', design_due: '2026-11-18', assignee_name: 'Aisha' }), // overdue (design due)
  it_('Content Client Review', { publish_date: '2026-11-22', creative_type: 'Static', updated_at: new Date(NOW.getTime() - 6 * 86400000 - 3600000).toISOString() }),
  it_('Creative Internal Review', { publish_date: '2026-11-26', content_pillar: '' }),
  it_('Creative Revision', { publish_date: '2026-11-22', creative_type: 'Reel', assignee_name: 'Omar' }),
  it_('Creative Production', { publish_date: '2026-11-27', content_type: 'Runtime', offer: '' }),
  it_('Ready to Post', { publish_date: '2026-11-21', channels: [] }),
  it_('Rejected', { publish_date: '2026-11-10' }),
  it_('Posted', { publish_date: '2026-10-30' }), // last month
  it_('Content', { publish_date: '2026-12-04' }), // next month
];

const client = {
  id: 'ws1',
  name: 'Example Co',
  content_expectations: {
    period: 'month',
    lines: [
      { creative_type: 'Video', expected: 3 },
      { creative_type: 'Static', expected: 2 },
      { creative_type: 'Reel', expected: 2 },
      { creative_type: 'Carousel', expected: 1 },
      { creative_type: 'Story', expected: 9 },
    ],
  },
};

describe('stage buckets', () => {
  it('maps every pipeline stage', () => {
    expect(stageBucket('Content')).toBe('content');
    for (const s of ['Content Internal Review', 'Content Client Review', 'Creative Internal Review', 'Creative Client Review']) {
      expect(stageBucket(s)).toBe('review');
    }
    expect(stageBucket('Content Revision')).toBe('revision');
    expect(stageBucket('Creative Revision')).toBe('revision');
    expect(stageBucket('Creative Production')).toBe('production');
    expect(stageBucket('Ready to Post')).toBe('ready');
    expect(stageBucket('Posted')).toBe('posted');
    expect(stageBucket('Rejected')).toBe('rejected');
  });
});

describe('periods', () => {
  it('builds ranges', () => {
    expect(periodRange('this_month', NOW)).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(periodRange('last_month', NOW)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(periodRange('last_30', NOW)).toEqual({ start: '2026-10-21', end: '2026-11-20' });
    expect(periodRange('next_30', NOW)).toEqual({ start: '2026-11-20', end: '2026-12-20' });
    expect(periodRange('all', NOW)).toBeNull();
    expect(periodRange('custom', NOW, { start: '2026-11-30', end: '2026-11-01' })).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(singleMonthOf(periodRange('this_month', NOW))).toBe('2026-11');
    expect(singleMonthOf(periodRange('last_30', NOW))).toBeNull();
  });
});

const nov = items.filter((i) => (i.publish_date || '').startsWith('2026-11'));

describe('matrix per dimension', () => {
  const exp = expectedByType(items, [client], '2026-11');

  it('creative type: canonical rows, plan rows with no items, statuses, totals', () => {
    expect(exp.get('story')).toBeUndefined();
    expect(exp.get('video')).toBe(3);
    const m = buildOverviewMatrix(nov, 'creative_type', exp);
    expect(m.hasExpected).toBe(true);
    const row = (v: string) => m.rows.find((r) => r.value === v)!;
    expect(row('Video').counts).toEqual({ content: 1, review: 1, revision: 0, production: 1, ready: 1, posted: 1, rejected: 1 });
    expect([row('Video').total, row('Video').open, row('Video').expected, row('Video').pct, row('Video').status]).toEqual([6, 4, 3, 33, 'on_track']);
    expect([row('Static').total, row('Static').expected, row('Static').status]).toEqual([2, 2, 'on_track']);
    expect([row('Reel').counts.posted, row('Reel').counts.revision, row('Reel').status]).toEqual([1, 1, 'on_track']);
    expect([row('Carousel').total, row('Carousel').expected, row('Carousel').status]).toEqual([0, 1, 'at_risk']);
    expect(m.totals.total).toBe(10);
    expect(m.totals.expected).toBe(8);
    expect(m.totals.pct).toBe(38); // 3 delivered toward plan of 8
    expect(m.totals.status).toBe('on_track');
    expect(m.columns).toEqual(['content', 'review', 'revision', 'production', 'ready', 'posted', 'rejected']);
  });

  it('hides empty stage columns and rejected when there is none', () => {
    const m = buildOverviewMatrix(nov.filter((i) => i.stage === 'Posted' || i.stage === 'Content'), 'creative_type', null);
    expect(m.columns).toEqual(['content', 'posted']);
    expect(m.hasExpected).toBe(false);
  });

  const cases: [OverviewDimension, Record<string, number>, string[]][] = [
    ['channel', { Instagram: 9, Facebook: 1, 'Not set': 1 }, ['Instagram', 'Facebook', 'Not set']],
    ['category', { 'Organic creative': 9, 'Ad creative': 1 }, ['Organic creative', 'Ad creative']],
    ['content_type', { Scheduled: 9, Runtime: 1 }, ['Scheduled', 'Runtime']],
    ['assignee', { Aisha: 2, Omar: 1, Unassigned: 7 }, ['Aisha', 'Omar', 'Unassigned']],
  ];
  for (const [dim, totals, order] of cases) {
    it(`groups by ${dim}`, () => {
      const m = buildOverviewMatrix(nov, dim, exp);
      expect(m.hasExpected).toBe(false); // plan only applies to creative type
      expect(Object.fromEntries(m.rows.map((r) => [r.value, r.total]))).toEqual(totals);
      expect(m.rows.map((r) => r.value)).toEqual(order);
      expect(m.totals.total).toBe(10); // items counted once even when channels overlap
    });
  }

  it('only the five kept dimensions, stale ones fall back to creative type', () => {
    expect(DIMENSIONS.map((d) => d.key)).toEqual(['creative_type', 'channel', 'category', 'content_type', 'assignee']);
    for (const stale of ['pillar', 'campaign', 'offer', '', null, undefined, 'nonsense']) {
      expect(normalizeDimension(stale)).toBe('creative_type');
    }
    expect(normalizeDimension('assignee')).toBe('assignee');
    const stale = buildOverviewMatrix(nov, 'pillar' as OverviewDimension, exp);
    expect(stale.dimension).toBe('creative_type');
    expect(stale.hasExpected).toBe(true);
  });

  it('dimension values', () => {
    expect(dimensionValues(items[0], 'channel')).toEqual(['Instagram', 'Facebook']);
    expect(dimensionValues(items[0], 'creative_type')).toEqual(['Reel']);
    expect(dimensionValues(items[1], 'creative_type')).toEqual(['Static']);
  });
});

describe('click-through to the sheet', () => {
  it('a cell drill matches exactly the items counted in that cell', () => {
    const range = periodRange('this_month', NOW);
    const m = buildOverviewMatrix(nov, 'creative_type', null);
    for (const r of m.rows) {
      for (const col of m.columns) {
        const drill = { dimension: 'creative_type' as const, value: r.value, bucket: col, range, label: '' };
        expect(items.filter((i) => itemMatchesDrill(i, drill)).length).toBe(r.counts[col]);
      }
    }
  });

  it('respects period and channel multi-values', () => {
    const drill = { dimension: 'creative_type' as const, value: 'Video', bucket: 'posted' as const, label: '' };
    expect(items.filter((i) => itemMatchesDrill(i, drill)).length).toBe(2);
    expect(items.filter((i) => itemMatchesDrill(i, { ...drill, range: periodRange('this_month', NOW) })).length).toBe(1);
    const fb = { dimension: 'channel' as const, value: 'Facebook', label: '' };
    expect(items.filter((i) => itemMatchesDrill(i, fb)).map((i) => i.id)).toEqual([items[0].id]);
    expect(itemMatchesDrill(items[0], null)).toBe(true);
  });

  it('a drill saved with a removed dimension filters by creative type', () => {
    const drill = { dimension: 'offer' as OverviewDimension, value: 'Video', bucket: 'posted' as const, label: '' };
    expect(items.filter((i) => itemMatchesDrill(i, drill)).length).toBe(2);
  });
});

describe('kpis, upcoming, clients, attention, workload', () => {
  it('kpis', () => {
    const plan = planTotals(items, [client], '2026-11');
    expect(plan).toEqual({ planned: 8, delivered: 3, left: 5 });
    const k = calculateOverviewKpis(nov, plan, NOW);
    expect(k).toMatchObject({ posted: 3, planned: 8, delivered: 3, percent: 38, awaitingClient: 1, oldestWaitDays: 6, inRevision: 1, overdue: 1, ready: 1, inProduction: 2 });
  });

  it('next seven days', () => {
    expect(nextSevenDays(items, NOW).map((d) => d.count)).toEqual([0, 1, 2, 0, 0, 0, 1]);
    expect(nextSevenDays(items, NOW)[0]).toMatchObject({ date: '2026-11-20', isToday: true });
  });

  it('client plan rows', () => {
    const [row] = clientPlanRows(items, [client], '2026-11', NOW);
    expect(row).toMatchObject({ expected: 8, posted: 3, inProgress: 6, gap: 5, pct: 38, status: 'on_track', awaiting: 1, overdue: 1, typesShort: 1 });
  });

  it('client plan rows break the plan down by creative type', () => {
    const [row] = clientPlanRows(items, [client], '2026-11', NOW);
    const byType = Object.fromEntries(row.types.map((t) => [t.type, t]));
    expect(row.types.map((t) => t.type)).toEqual(['Video', 'Static', 'Reel', 'Carousel']); // plan order, story excluded
    expect(byType.Video).toMatchObject({ expected: 3, posted: 1, inProgress: 4, gap: 2, pct: 33, status: 'on_track', unplanned: false });
    expect(byType.Static).toMatchObject({ expected: 2, posted: 1, inProgress: 1, gap: 1, pct: 50, status: 'on_track' });
    expect(byType.Reel).toMatchObject({ expected: 2, posted: 1, inProgress: 1, gap: 1, pct: 50 });
    expect(byType.Carousel).toMatchObject({ expected: 1, posted: 0, inProgress: 0, gap: 1, pct: 0, status: 'at_risk' });
    // Sub-rows add up to the client total.
    expect(row.types.reduce((s, t) => s + (t.expected ?? 0), 0)).toBe(row.expected);
    expect(row.types.reduce((s, t) => s + t.inProgress, 0)).toBe(row.inProgress);
    expect(row.types.reduce((s, t) => s + (t.gap ?? 0), 0)).toBe(row.gap);
  });

  it('paused lines, min-max ranges and types outside the plan', () => {
    const c2 = {
      id: 'ws1',
      name: 'Example Co',
      content_expectations: {
        period: 'month',
        lines: [
          { creative_type: 'Static', expected: 1, expected_max: 3 },
          { creative_type: 'Reel', expected: 4, skip_months: ['2026-11'] },
        ],
      },
    };
    const [row] = clientPlanRows(items, [c2], '2026-11', NOW);
    const byType = Object.fromEntries(row.types.map((t) => [t.type, t]));
    expect(byType.Static).toMatchObject({ expected: 1, expectedMax: 3, posted: 1, gap: 0, pct: 100, status: 'met' });
    expect(byType.Reel).toMatchObject({ paused: true, expected: null, gap: null, status: null, posted: 1 });
    expect(byType.Video).toMatchObject({ unplanned: true, expected: null, posted: 1, inProgress: 4 });
    expect(row.expected).toBe(1);
  });

  it('clients with no plan have no per-type breakdown', () => {
    const [row] = clientPlanRows(items, [{ id: 'ws1', name: 'Example Co', content_expectations: null }], '2026-11', NOW);
    expect(row.expected).toBeNull();
    expect(row.types).toEqual([]);
  });

  it('needs attention: overdue first, then revision due soon, then waiting', () => {
    const list = needsAttention(items, NOW);
    expect(list.map((a) => [a.kind, a.days])).toEqual([['overdue', 2], ['revision_soon', 2], ['awaiting', 6]]);
  });

  it('workload by assignee', () => {
    const w = workloadByAssignee(nov, NOW);
    expect(w.map((r) => r.name)).toEqual(['Aisha', 'Omar', 'Unassigned']);
    expect(w[0]).toMatchObject({ active: 1, overdue: 1, posted: 1 });
    expect(w[1]).toMatchObject({ active: 1, inRevision: 1 });
    expect(w[2]).toMatchObject({ active: 4, posted: 2 });
  });
});
