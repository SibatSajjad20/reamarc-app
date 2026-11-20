import type { ContentCalendarReport, ReportInternal, ReportInternalRow } from '../../../../types/contentCalendarReport';

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

function row(over: Partial<ReportInternalRow>): ReportInternalRow {
  return {
    id: 'x', serial: 'SP-0', title: 'Item', creative_type: 'Static', category: 'Organic creative', content_type: 'Scheduled',
    channels: ['Instagram'], stage: 'Content', department: 'Content', assignee: 'Unassigned', publish_date: '2026-11-25',
    design_due: null, target_date: '2026-11-25', target_label: 'Due', updated: '2026-11-16', days_since_update: 4,
    days_overdue: 0, approval_status: null, ...over,
  };
}

export function makeInternal(over: Partial<ReportInternal> = {}): ReportInternal {
  const ov = row({ id: 'ov', serial: 'SP-9', title: 'Diwali Offer Banner', stage: 'Creative Production', department: 'Creative',
    assignee: 'Sara Design', design_due: '2026-11-14', target_date: '2026-11-14', days_overdue: 6, category: 'Ad creative',
    updated: '2026-11-01', days_since_update: 19 });
  const rv = row({ id: 'r2', serial: 'SP-5', title: 'Black Friday Teaser Reel', creative_type: 'Reel', stage: 'Creative Revision',
    department: 'Creative', assignee: 'Ali Khan', publish_date: '2026-11-22', target_date: '2026-11-22' });
  return {
    month: '2026-11',
    stuck_days: 5,
    totals: { total: 9, open: 5, posted: 3, rejected: 1, overdue: 1, overdue_window: 1, stuck: 1, unassigned_open: 1,
      internal_review: 1, client_review: 1, next_month: 2 },
    stages: [
      { stage: 'Content', department: 'Content', count: 1, oldest_days: 4, avg_days: 4, stuck: 0, overdue: 0 },
      { stage: 'Content Internal Review', department: 'Content', count: 1, oldest_days: 2, avg_days: 2, stuck: 0, overdue: 0 },
      { stage: 'Creative Production', department: 'Creative', count: 1, oldest_days: 19, avg_days: 19, stuck: 1, overdue: 1 },
      { stage: 'Creative Revision', department: 'Creative', count: 1, oldest_days: 4, avg_days: 4, stuck: 0, overdue: 0 },
      { stage: 'Posted', department: 'Social / Performance', count: 3, oldest_days: null, avg_days: null, stuck: 0, overdue: 0 },
    ],
    stage_counts: [{ stage: 'Content Internal Review', count: 1 }],
    internal_review: 1,
    workload_by_owner: [{ label: 'Creative', count: 2 }],
    workload_by_assignee: [{ label: 'Ali Khan', count: 1 }],
    assignees: [
      { name: 'Ali Khan', assigned: 4, open: 1, done: 3, overdue: 0, in_revision: 1, client_review: 0, rejected: 0 },
      { name: 'Sara Design', assigned: 1, open: 1, done: 0, overdue: 1, in_revision: 0, client_review: 0, rejected: 0 },
      { name: 'Unassigned', assigned: 1, open: 1, done: 0, overdue: 0, in_revision: 0, client_review: 0, rejected: 0 },
    ],
    overdue: [ov],
    stuck: [ov],
    by_type: [
      { creative_type: 'Static', expected: 3, posted: 2, in_progress: 1, gap: 1, extra: 0, status: 'on_track', organic: 2, ad: 1 },
      { creative_type: 'Reel', expected: 1, posted: 0, in_progress: 1, gap: 1, extra: 0, status: 'on_track', organic: 1, ad: 0 },
    ],
    category_split: [
      { label: 'Organic creative', total: 8, posted: 3, open: 4, rejected: 1, overdue: 0 },
      { label: 'Ad creative', total: 1, posted: 0, open: 1, rejected: 0, overdue: 1 },
    ],
    content_type_split: [
      { label: 'Scheduled', total: 9, posted: 3, open: 5, rejected: 1, overdue: 1 },
      { label: 'Runtime', total: 0, posted: 0, open: 0, rejected: 0, overdue: 0 },
    ],
    revisions: { content_revision: 0, creative_revision: 1, changes_requested: 1, with_revision_note: 2, rejected: 1 },
    items: [ov, rv],
    items_total: 2,
    ...over,
  };
}
