export interface DateRangeInfo {
  start: string;
  end: string;
  today_included: boolean;
  today?: string;
}

export interface LiveHours {
  worked: number;
  logged: number;
}

export interface LogVarianceThresholds {
  under_target_min: number;
  large_variance_min: number;
  over_logged_min: number;
  late_hours: number;
  coverage_target_pct: number;
}

export interface DailyTaskDetail {
  id?: string;
  task_description: string;
  client_project?: string | null;
  task_type?: string | null;
  task_status?: string | null;
  hours_utilized: number;
  progress_percentage?: number | null;
  blockers?: string | null;
}

export interface LogVarianceDay {
  date: string;
  status:
    | 'present'
    | 'half_day'
    | 'wfh'
    | 'leave'
    | 'off'
    | 'holiday'
    | 'absent'
    | 'not_employed'
    | 'live'
    | 'missing_checkout'
    | string;
  status_label?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  worked: number; // minutes
  pending_ot: number; // minutes
  expected: number; // minutes
  logged: number; // minutes
  variance: number; // minutes
  coverage_pct?: number | null;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  flags: string[];
  entries_count: number;
  compare_ready: boolean;
  tasks: DailyTaskDetail[];
}

export interface LogVarianceAggregates {
  days_scheduled: number;
  days_present: number;
  days_logged: number;
  days_missing: number;
  days_under_target: number;
  days_absent: number;
  days_leave: number;
  days_off: number;
  days_missing_checkout: number;
  worked: number; // minutes
  logged: number; // minutes
  expected: number; // minutes
  variance: number; // minutes
  pending_ot?: number;
  scheduled_complete_logged?: number;
  scheduled_complete_days?: number;
  tasks_completed?: number;
  coverage_pct?: number | null;
  avg_logged_per_day?: number | null; // minutes
  avg_worked_per_day?: number | null; // minutes
  avg_logged_per_scheduled_day?: number | null; // minutes
  submission_pct?: number | null;
  attendance_vs_plan_pct?: number | null;
  logged_outside: number; // minutes
}

export interface LogVarianceSummary extends LogVarianceAggregates {
  people: number;
  open_exceptions: number;
  today_live: LiveHours;
}

export interface DepartmentSummary {
  department: string;
  people: number;
  coverage_pct?: number | null;
  avg_logged_per_day?: number | null; // minutes
  days_missing: number;
  days_present: number;
  worked: number; // minutes
  logged: number; // minutes
}

export interface EmployeeRow extends LogVarianceAggregates {
  user_id: string;
  name: string;
  avatar?: string | null;
  department?: string | null;
  role: string;
  inactive: boolean;
  joining_date?: string | null;
  flags: string[];
  open_exceptions: number;
  today_live?: LiveHours | null;
}

export interface LogVarianceResponse {
  range: DateRangeInfo;
  generated_at: string;
  summary: LogVarianceSummary;
  departments: DepartmentSummary[];
  rows: EmployeeRow[];
  thresholds: LogVarianceThresholds;
}

export interface EmployeeDetailUser {
  user_id: string;
  name: string;
  avatar?: string | null;
  department?: string | null;
  role: string;
  email?: string | null;
  inactive: boolean;
  joining_date?: string | null;
  deactivation_date?: string | null;
}

export interface EmployeeDetailResponse {
  user: EmployeeDetailUser;
  summary: LogVarianceAggregates;
  days: LogVarianceDay[];
  range?: DateRangeInfo;
}

export interface ExceptionItem {
  id: string;
  user_id: string;
  user_name: string;
  avatar?: string | null;
  department?: string | null;
  role: string;
  date: string;
  type: string;
  type_label: string;
  detail: string;
  review_state: string;
  worked: number;
  logged: number;
  variance: number;
  expected: number;
  has_checkin: boolean;
  has_checkout: boolean;
  is_wfh: boolean;
  action_status: string;
  member_reason?: string | null;
  reopen_note?: string | null;
}

export interface ExceptionGroup {
  key: string;
  label: string;
  count: number;
  user_id?: string | null;
  avatar?: string | null;
  department?: string | null;
  role?: string | null;
  flags: string[];
  items: ExceptionItem[];
}

export interface ExceptionsTotalsByType {
  all: number;
  no_log: number;
  over_logged: number;
  missing_checkout: number;
  large_variance: number;
  logged_on_leave_or_off: number;
  logged_without_attendance: number;
  logged_late: number;
}

export interface ExceptionsResponse {
  groups: ExceptionGroup[];
  totals_by_type: ExceptionsTotalsByType;
  reviewed_count?: number;
  range?: DateRangeInfo;
}
