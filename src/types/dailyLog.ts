export type TaskTypeOption = 'Scheduled Task' | 'Runtime Task';
export type TaskStatusOption = 'Completed' | 'Incomplete' | 'Blocker';

export interface DailyLogColumn {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'number';
  options?: string[];
  editable?: boolean;
  width?: string;
}

export interface DailyLogEntry {
  id: string;
  workspace_id: string;
  user_id?: string;
  version: number;
  date: string;
  resource_name: string;
  role: string;
  department?: string;
  client_project: string;
  task_description: string;
  task_type: TaskTypeOption | string;
  task_status: TaskStatusOption | string;
  revisions_done: string;
  deliverables: string;
  hours_utilized: number | string;
  remarks?: string;
  start_time?: string | null;
  end_time?: string | null;
  estimated_hours?: number | null;
  variance_reason?: string | null;
  month_sheet: string;
  custom_fields?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface CreateDailyLogEntryPayload {
  date: string;
  resource_name?: string;
  role?: string;
  department?: string;
  client_project?: string;
  task_description?: string;
  task_type?: string;
  task_status?: string;
  revisions_done?: string;
  deliverables?: string;
  hours_utilized?: number | string;
  remarks?: string;
  start_time?: string | null;
  end_time?: string | null;
  estimated_hours?: number | null;
  variance_reason?: string | null;
  month_sheet?: string;
  custom_fields?: Record<string, any>;
}

export interface UpdateDailyLogEntryPayload {
  version?: number;
  date?: string;
  resource_name?: string;
  role?: string;
  department?: string;
  client_project?: string;
  task_description?: string;
  task_type?: string;
  task_status?: string;
  revisions_done?: string;
  deliverables?: string;
  hours_utilized?: number | string;
  remarks?: string;
  start_time?: string | null;
  end_time?: string | null;
  estimated_hours?: number | null;
  variance_reason?: string | null;
  month_sheet?: string;
  custom_fields?: Record<string, any>;
}

export interface GetDailyLogEntriesParams {
  month_sheet?: string;
  start_date?: string;
  end_date?: string;
  department?: string;
  user_id?: string;
  resource_name?: string;
  client_project?: string;
  task_status?: string;
  task_type?: string;
  limit?: number;
  skip?: number;
}

export interface UserLogActivity {
  user_id: string;
  full_name: string;
  last_logged_date?: string | null;
  logged_today: boolean;
  missing_dates: string[];
}

export interface DayTargetFollowUp {
  date: string;
  id?: string;
  action_type?: string;
  action_status?: string;
  action_by_name?: string;
  member_reason?: string;
  logged_hours?: number;
  worked_hours?: number;
  signed_gap_hours?: number;
  is_missing_log?: boolean;
  can_send_reason?: boolean;
  message: string;
}

export interface DayTarget {
  date: string;
  expected_hours: number;
  worked_hours?: number;
  logged_hours: number;
  remaining_hours: number;
  has_checkin?: boolean;
  has_checkout?: boolean;
  compare_ready?: boolean;
  shift_name?: string;
  shift_start?: string;
  shift_end?: string;
  is_full_leave: boolean;
  is_wfh: boolean;
  status: 'green' | 'amber' | 'red' | string;
  pending_action?: string | null;
  pending_message?: string | null;
  follow_ups?: DayTargetFollowUp[];
}

export interface LogExceptionItem {
  id: string;
  user_id: string;
  date: string;
  full_name: string;
  department?: string;
  role: string;
  exception_type: string;
  message: string;
  hours: number;
  severity: string;
  required_action: string;
  status: string;
  action_status: string;
  action_type?: string | null;
  action_by_name?: string | null;
  action_by_role?: string | null;
  expected_hours: number;
  logged_hours: number;
  worked_hours?: number;
  gap_hours?: number;
  signed_gap_hours?: number;
  has_checkin?: boolean;
  has_checkout?: boolean;
  task_count?: number;
  is_missing_log: boolean;
  escalated?: boolean;
  employee_notified?: boolean;
  member_reason?: string | null;
  previously_accepted_signed_gap_hours?: number | null;
  reopen_note?: string | null;
}

export interface SnapshotHighlight {
  label: string;
  value: string;
  user_name?: string | null;
}

export interface SnapshotPerson {
  user_id: string;
  full_name: string;
  department?: string | null;
  role: string;
  logged: boolean;
  worked_hours: number;
  logged_hours: number;
  gap_hours: number;
  signed_gap_hours?: number;
  has_open_request: boolean;
  has_checkin?: boolean;
  has_checkout?: boolean;
  due?: boolean;
  is_full_leave?: boolean;
}

export interface SnapshotDepartment {
  name: string;
  total: number;
  logged: number;
  missing: number;
  worked_hours: number;
  logged_hours: number;
}

export interface OperatingSnapshot {
  date: string;
  range?: string;
  employees_expected: number;
  logs_submitted: number;
  compliance_pct: number;
  expected_hours: number;
  logged_hours: number;
  worked_hours?: number;
  unallocated_hours: number;
  tasks_completed: number;
  estimate_variance_hours: number;
  rework_hours: number;
  exception_count: number;
  summary?: string;
  missed_workdays?: number;
  highlights: SnapshotHighlight[];
  hr_exceptions: LogExceptionItem[];
  top_exceptions: LogExceptionItem[];
  departments?: SnapshotDepartment[];
  people?: SnapshotPerson[];
  open_request_user_ids?: string[];
}


