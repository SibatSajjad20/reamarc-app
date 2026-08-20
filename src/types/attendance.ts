/**
 * TypeScript Definitions for Attendance, Shifts, Leaves & Punctuality Module
 */

export type ShiftType = 'standard' | 'hr' | 'afternoon' | 'night' | 'custom' | string;

export interface ShiftTemplate {
  id: string;
  name: string;
  code?: ShiftType;
  shift_type?: ShiftType;
  start_time: string;           // "09:30"
  end_time: string;             // "18:30"
  break_duration_minutes: number; // 60
  break_start_time?: string | null; // "13:00"
  break_end_time?: string | null;   // "14:00"
  grace_period_minutes: number;   // 30
  late_threshold_time?: string;    // "10:00"
  is_cross_midnight?: boolean;     // false
  is_night_shift?: boolean;
  expected_work_hours?: number;    // 8.0
  expected_hours?: number;
  description?: string;
  is_active?: boolean;
}

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'wfh'
  | 'awaiting_checkin'
  | 'short_leave'
  | 'sick_leave'
  | 'casual_leave'
  | 'annual_leave'
  | 'unpaid_leave'
  | 'first_saturday_off'
  | 'sunday_off'
  | 'holiday'
  | 'missed_punch'
  | 'absent';

export interface AttendanceRecord {
  id: string;
  user_id: string;
  employee_name: string;
  employee_code?: string;
  department: string;
  role?: string;
  date: string;                  // "YYYY-MM-DD"
  shift_id: string;
  shift_name: string;
  punch_in: string | null;       // "09:12:00" or formatted "09:12 AM"
  punch_out: string | null;      // "18:35:00" or formatted "06:35 PM"
  break_minutes: number;
  working_hours_minutes: number;
  overtime_minutes: number;
  undertime_minutes: number;
  status: AttendanceStatus;
  is_late: boolean;
  late_minutes: number;
  ip_address?: string;
  ip_verified: boolean;
  latitude?: number;
  longitude?: number;
  gps_verified: boolean;
  distance_meters?: number;
  is_wfh_approved: boolean;
  is_wfh?: boolean;
  check_in?: string | null;
  check_out?: string | null;
  is_on_break?: boolean;
  break_start_time?: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DailyMatrixEmployeeRow {
  user_id: string;
  employee_code: string;
  employee_name: string;
  department: string;
  role: string;
  shift_name: string;
  shift_timing?: string;
  punch_in: string | null;
  punch_out: string | null;
  check_in?: string | null;
  check_out?: string | null;
  break_minutes: number;
  effective_hours_minutes: number;
  status: AttendanceStatus;
  is_late: boolean;
  is_late_alert?: boolean;
  late_minutes: number;
  ip_verified: boolean;
  gps_verified: boolean;
  distance_meters?: number;
  is_wfh_approved: boolean;
  notes?: string;
  record_id?: string;
}

export interface DailyMatrixSummary {
  total_headcount: number;
  present: number;
  on_time: number;
  late: number;
  wfh: number;
  leaves: number;
  absent: number;
}

export interface DailyMatrixResponse {
  date: string;
  summary: DailyMatrixSummary;
  rows: DailyMatrixEmployeeRow[];
}

export type BonusRecommendation =
  | 'Eligible'
  | 'Under Review'
  | 'Not Eligible';

export interface MonthlyPunctualityRow {
  user_id: string;
  employee_name: string;
  employee_code?: string;
  department: string;
  shift_name: string;
  working_days?: number;
  total_working_days?: number;
  days_present: number;
  days_absent?: number;
  leaves_taken?: number;
  leave_count?: number;
  late_strikes?: number;
  late_count?: number;
  short_leaves_count: number;
  short_leaves_hours?: number;
  missed_punches?: number;
  total_expected_minutes?: number;
  total_actual_minutes?: number;
  overtime_minutes?: number;
  undertime_minutes?: number;
  net_variance_minutes?: number;
  total_work_hours?: number;
  total_work_hours_formatted?: string;
  expected_hours_formatted?: string;
  actual_hours_formatted?: string;
  overtime_hours?: number;
  overtime_formatted: string;
  undertime_hours?: number;
  undertime_formatted: string;
  net_variance_hours?: number;
  net_variance_formatted: string;
  punctuality_score_percent?: number;
  punctuality_percentage?: number;
  bonus_recommendation?: BonusRecommendation;
}

export interface MonthlyPunctualitySummary {
  average_punctuality_percent: number;
  total_overtime_formatted: string;
  total_undertime_formatted: string;
  total_late_strikes: number;
  bonus_eligible_count: number;
  total_employees: number;
}

export interface MonthlyPunctualityResponse {
  year: number;
  month: number;
  department?: string;
  summary: MonthlyPunctualitySummary;
  rows: MonthlyPunctualityRow[];
}

export interface PersonalTimesheetResponse {
  user_id: string;
  employee_name: string;
  year: number;
  month: number;
  records: AttendanceRecord[];
  summary: MonthlyPunctualityRow;
}

export type RequestType = 'leave' | 'short_leave' | 'wfh' | 'regularization';
export type LeaveCategory = 'sick' | 'casual' | 'annual' | 'unpaid';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface AttendanceRequest {
  id: string;
  user_id: string;
  user_name: string;
  department: string;
  request_type: RequestType;
  leave_category?: LeaveCategory;
  start_date: string;
  end_date: string;
  short_leave_start_time?: string;
  short_leave_duration_hours?: number;
  correction_target?: 'time_in' | 'time_out' | 'both';
  regularization_date?: string;
  regularization_punch_in?: string;
  regularization_punch_out?: string;
  regularization_check_in?: string;
  regularization_check_out?: string;
  reason: string;
  status: RequestStatus;
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  created_at: string;
}

export interface LeaveBalance {
  user_id: string;
  user_name?: string;
  department?: string;
  year: number;
  annual_entitled: number;
  sick_entitled: number;
  annual_used_opening: number;
  sick_used_opening: number;
  annual_used_in_app: number;
  sick_used_in_app: number;
  annual_pending: number;
  sick_pending: number;
  annual_remaining: number;
  sick_remaining: number;
  go_live_date: string;
}

export interface AttendanceConfig {
  go_live_date: string;
  test_start_date: string;
  effective_start_date: string;
  timezone: string;
  go_live_reached: boolean;
}

export interface SecuritySettings {
  office_public_ips: string[];
  office_subnets: string[];
  office_ip_whitelist?: string[];
  office_latitude: number;
  office_longitude: number;
  geofence_radius_meters: number;
  grace_period_minutes?: number;
  late_threshold_minutes?: number;
  enforce_ip_whitelist: boolean;
  enforce_gps_geofence: boolean;
  allow_wfh_bypass: boolean;
}

export interface TodayAttendanceResponse {
  record: AttendanceRecord | null;
  shift: ShiftTemplate;
  is_wfh_approved: boolean;
  punch_status?: {
    is_checked_in: boolean;
    check_in_time?: string | null;
    check_out_time?: string | null;
    active_duration_seconds?: number;
    can_check_in?: boolean;
    can_check_out?: boolean;
    current_status?: string;
  };
  has_active_break?: boolean;
  can_punch_in?: boolean;
  can_punch_out?: boolean;
  client_ip?: string;
  is_ip_verified?: boolean;
  office_latitude?: number;
  office_longitude?: number;
  geofence_radius_meters?: number;
  enforce_ip_whitelist?: boolean;
  enforce_gps_geofence?: boolean;
  shift_ended?: boolean;
}

export interface CheckInPayload {
  latitude?: number;
  longitude?: number;
  accuracy_meters?: number;
  gps_captured_at?: string;
  notes?: string;
  detected_public_ip?: string;
}

export interface CheckOutPayload {
  notes?: string;
}

export interface BreakActionPayload {
  action: 'start' | 'end';
  notes?: string;
}

export interface CreateLeavePayload {
  request_type?: RequestType;
  leave_type?: string;
  leave_category?: LeaveCategory;
  start_date: string;
  end_date: string;
  short_leave_start_time?: string;
  short_leave_duration_hours?: number;
  short_leave_hours?: number;
  correction_target?: 'time_in' | 'time_out' | 'both';
  regularization_date?: string;
  regularization_punch_in?: string;
  regularization_punch_out?: string;
  regularization_check_in?: string;
  regularization_check_out?: string;
  reason: string;
}

export interface ReviewLeavePayload {
  status: 'approved' | 'rejected';
  review_comments?: string;
}

export interface OverrideAttendancePayload {
  punch_in?: string | null;
  punch_out?: string | null;
  break_minutes?: number;
  status?: AttendanceStatus;
  notes?: string;
  reason?: string;
}

export interface CompanyCalendarEvent {
  id: string;
  title: string;
  date: string;
  event_type: 'holiday' | 'working_saturday' | 'special_event' | 'event';
  is_off_day?: boolean;
  is_workday_override?: boolean;
  description?: string;
}
