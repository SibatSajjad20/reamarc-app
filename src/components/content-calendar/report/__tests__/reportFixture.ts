import type { ContentCalendarReport } from '../../../../types/contentCalendarReport';

export function makeReport(overrides: Partial<ContentCalendarReport> = {}): ContentCalendarReport {
  return {
    audience: 'client',
    workspace: { id: 'ws_sp', name: 'SP Builders', initials: 'SP', logo_url: null },
    period: { month: '2026-11', start: '2026-11-01', end: '2026-11-30', today: '2026-11-20' },
    generated_at: '2026-11-20T10:00:00+00:00',
    has_plan: true,
    summary: {
      planned: 5, delivered: 3, left: 2, posted: 3, approved_scheduled: 1, awaiting_review: 1,
      in_revision: 1, in_production: 2, rejected: 0, total: 8, percent: 60,
    },
    by_type: [
      { creative_type: 'Video', expected: 2, posted: 1, in_progress: 1, gap: 1, extra: 0, status: 'on_track' },
      { creative_type: 'Static', expected: 3, posted: 2, in_progress: 0, gap: 1, extra: 0, status: 'at_risk' },
      { creative_type: 'Carousel', expected: null, posted: 0, in_progress: 1, gap: 0, extra: 0, status: 'no_plan' },
    ],
    pipeline: [
      { key: 'posted', label: 'Posted', count: 3 },
      { key: 'approved_scheduled', label: 'Approved & scheduled', count: 1 },
      { key: 'awaiting_review', label: 'Awaiting your review', count: 1 },
      { key: 'in_revision', label: 'In revision', count: 1 },
      { key: 'in_production', label: 'In production', count: 2 },
    ],
    breakdown: {
      total: 8,
      channels: [{ label: 'Instagram', count: 6 }, { label: 'Facebook', count: 2 }],
      content_pillars: [{ label: 'Product', count: 5 }, { label: 'Educational', count: 3 }],
      creative_categories: [{ label: 'Organic Creative', count: 6 }, { label: 'Ad Creative', count: 2 }],
      content_types: [{ label: 'Scheduled', count: 7 }, { label: 'Runtime', count: 1 }],
    },
    calendar: [
      { date: '2026-11-03', creative_type: 'Video', status: 'posted' },
      { date: '2026-11-05', creative_type: 'Static', status: 'posted' },
      { date: '2026-11-25', creative_type: 'Video', status: 'approved_scheduled' },
    ],
    posted_items: [
      { id: 'p1', serial: 'SP-1', title: 'Behind the Factory Floor', creative_type: 'Video', channels: ['Instagram'], date: '2026-11-03',
        thumb: { kind: 'image', url: '/uploads/content_calendar/p1/a.jpg', thumbnail_url: null } },
      { id: 'p2', serial: 'SP-2', title: 'New Colorways Are Live', creative_type: 'Static', channels: ['Facebook'], date: '2026-11-05', thumb: null },
    ],
    action_needed: {
      awaiting_review: [
        { id: 'r1', serial: 'SP-4', title: 'November Product Spotlight', creative_type: 'Static', channels: ['LinkedIn'],
          date: '2026-11-22', thumb: null, review_kind: 'Content review', days_waiting: 4 },
      ],
      at_risk: [
        { id: 'r2', serial: 'SP-5', title: 'Black Friday Teaser Reel', creative_type: 'Reel', channels: [], date: '2026-11-22',
          thumb: null, days_until: 2, status: 'in_revision', status_label: 'In revision' },
      ],
      at_risk_days: 7,
    },
    next_month: { month: '2026-12', total: 3, by_type: [{ creative_type: 'Video', count: 2 }, { creative_type: 'Carousel', count: 1 }] },
    ...overrides,
  };
}
