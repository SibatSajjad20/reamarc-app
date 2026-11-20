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
  internal?: {
    stage_counts: { stage: string; count: number }[];
    internal_review: number;
    workload_by_owner: ReportCount[];
    workload_by_assignee: ReportCount[];
  };
}
