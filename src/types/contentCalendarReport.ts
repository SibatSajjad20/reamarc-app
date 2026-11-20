/** Shape of GET /content-calendar/report (see backend/app/services/content_calendar_report.py). */
export type ReportAudience = 'client' | 'internal';
export type ReportBucket =
  | 'posted'
  | 'approved_scheduled'
  | 'awaiting_review'
  | 'in_revision'
  | 'in_production'
  | 'rejected';
export type ReportRowStatus = 'met' | 'on_track' | 'at_risk' | 'paused' | 'no_plan';

export interface ReportThumb {
  kind: string;
  url: string;
  thumbnail_url?: string | null;
  google_drive_url?: string | null;
}

export interface ReportItemCard {
  id: string;
  serial: string;
  title: string;
  creative_type: string;
  channels: string[];
  date: string;
  thumb: ReportThumb | null;
  /** Internal version only. */
  stage?: string;
}

export interface ReportAwaitingCard extends ReportItemCard {
  review_kind: string;
  days_waiting: number | null;
}

export interface ReportRiskCard extends ReportItemCard {
  days_until: number;
  status: ReportBucket;
  status_label: string;
}

export interface ReportCount {
  label: string;
  count: number;
}

export interface ContentCalendarReport {
  audience: ReportAudience;
  workspace: { id: string; name: string; initials: string; logo_url: string | null };
  period: { month: string; start: string; end: string; today: string };
  generated_at: string;
  has_plan: boolean;
  summary: {
    planned: number;
    delivered: number;
    left: number;
    posted: number;
    approved_scheduled: number;
    awaiting_review: number;
    in_revision: number;
    in_production: number;
    rejected: number;
    total: number;
    percent: number | null;
  };
  by_type: {
    creative_type: string;
    expected: number | null;
    posted: number;
    in_progress: number;
    gap: number;
    extra: number;
    status: ReportRowStatus;
  }[];
  pipeline: { key: ReportBucket; label: string; count: number }[];
  breakdown: {
    total: number;
    channels: ReportCount[];
    content_pillars: ReportCount[];
    creative_categories: ReportCount[];
    content_types: ReportCount[];
  };
  calendar: { date: string; creative_type: string; status: ReportBucket }[];
  posted_items: ReportItemCard[];
  action_needed: {
    awaiting_review: ReportAwaitingCard[];
    at_risk: ReportRiskCard[];
    at_risk_days: number;
  };
  next_month: { month: string; total: number; by_type: { creative_type: string; count: number }[] };
  /** Staff only (audience=internal). Never present for clients. */
  internal?: ReportInternal;
}

export interface ReportInternalRow {
  id: string;
  serial: string;
  title: string;
  creative_type: string;
  category: string;
  content_type: string;
  channels: string[];
  /** Real internal pipeline stage. */
  stage: string;
  department: string;
  assignee: string;
  publish_date: string | null;
  design_due: string | null;
  target_date: string | null;
  target_label: 'Due' | 'Publish' | string;
  updated: string | null;
  days_since_update: number | null;
  days_overdue: number;
  approval_status: string | null;
}

export interface ReportInternalSplit {
  label: string;
  total: number;
  posted: number;
  open: number;
  rejected: number;
  overdue: number;
}

export interface ReportInternal {
  stage_counts: { stage: string; count: number }[];
  internal_review: number;
  workload_by_owner: ReportCount[];
  workload_by_assignee: ReportCount[];
  month?: string;
  stuck_days?: number;
  totals?: {
    total: number;
    open: number;
    posted: number;
    rejected: number;
    overdue: number;
    overdue_window: number;
    stuck: number;
    unassigned_open: number;
    internal_review: number;
    client_review: number;
    next_month: number;
  };
  stages?: {
    stage: string;
    department: string;
    count: number;
    oldest_days: number | null;
    avg_days: number | null;
    stuck: number;
    overdue: number;
  }[];
  assignees?: {
    name: string;
    assigned: number;
    open: number;
    done: number;
    overdue: number;
    in_revision: number;
    client_review: number;
    rejected: number;
  }[];
  overdue?: ReportInternalRow[];
  stuck?: ReportInternalRow[];
  by_type?: (ContentCalendarReport['by_type'][number] & { organic: number; ad: number })[];
  category_split?: ReportInternalSplit[];
  content_type_split?: ReportInternalSplit[];
  revisions?: {
    content_revision: number;
    creative_revision: number;
    changes_requested: number;
    with_revision_note: number;
    rejected: number;
  };
  items?: ReportInternalRow[];
  items_total?: number;
}
