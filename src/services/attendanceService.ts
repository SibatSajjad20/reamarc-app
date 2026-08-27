import { apiClient } from './apiClient';
import { detectPublicIp } from '../utils/publicIp';
import type {
  TodayAttendanceResponse,
  AttendanceRecord,
  CheckInPayload,
  CheckOutPayload,
  BreakActionPayload,
  PersonalTimesheetResponse,
  DailyMatrixResponse,
  MonthlyPunctualityResponse,
  AttendanceRequest,
  CreateLeavePayload,
  ReviewLeavePayload,
  ClarifyLeavePayload,
  AppealLeavePayload,
  EditLeaveStatusPayload,
  ShiftTemplate,
  SecuritySettings,
  CompanyCalendarEvent,
  OverrideAttendancePayload,
  LeaveBalance,
  AttendanceConfig,
  ShiftAssignment,
} from '../types/attendance';

class AttendanceService {
  /**
   * Fetch current user's today attendance status, assigned shift, and WFH state
   */
  public async getTodayStatus(): Promise<TodayAttendanceResponse> {
    return apiClient.get<TodayAttendanceResponse>('/attendance/today');
  }

  /**
   * Submit Check-In punch with optional GPS coordinates and notes
   */
  public async checkIn(payload: CheckInPayload): Promise<AttendanceRecord> {
    const publicIp = payload.detected_public_ip || (await detectPublicIp()) || undefined;
    return apiClient.post<AttendanceRecord>('/attendance/check-in', {
      ...payload,
      detected_public_ip: publicIp,
    });
  }

  /**
   * Submit Check-Out punch with optional notes
   */
  public async checkOut(payload: CheckOutPayload = {}): Promise<AttendanceRecord> {
    return apiClient.post<AttendanceRecord>('/attendance/check-out', payload);
  }

  /**
   * Start or end break interval
   */
  public async toggleBreak(payload: BreakActionPayload): Promise<AttendanceRecord> {
    return apiClient.post<AttendanceRecord>('/attendance/break', payload);
  }

  /**
   * Fetch current user's personal monthly timesheet and aggregated summary
   */
  public async getMyTimesheet(year: number, month: number): Promise<PersonalTimesheetResponse> {
    return apiClient.get<PersonalTimesheetResponse>(
      `/attendance/my-timesheet?year=${year}&month=${month}`
    );
  }

  /**
   * Fetch another employee's monthly timesheet (Admin / HR / Operations)
   */
  public async getEmployeeTimesheet(
    userId: string,
    year: number,
    month: number,
    options?: { signal?: AbortSignal }
  ): Promise<PersonalTimesheetResponse> {
    return apiClient.get<PersonalTimesheetResponse>(
      `/attendance/timesheet/${encodeURIComponent(userId)}?year=${year}&month=${month}`,
      options
    );
  }

  /**
   * Fetch company-wide daily attendance matrix (register replica)
   */
  public async getDailyMatrix(date: string, department?: string): Promise<DailyMatrixResponse> {
    const deptQuery = department && department !== 'All' ? `&department=${encodeURIComponent(department)}` : '';
    return apiClient.get<DailyMatrixResponse>(`/attendance/matrix?date=${date}${deptQuery}`);
  }

  /**
   * Fetch company-wide monthly punctuality command center summary
   */
  public async getMonthlySummary(
    year: number,
    month: number,
    department?: string
  ): Promise<MonthlyPunctualityResponse> {
    const deptQuery = department && department !== 'All' ? `&department=${encodeURIComponent(department)}` : '';
    return apiClient.get<MonthlyPunctualityResponse>(
      `/attendance/monthly-summary?year=${year}&month=${month}${deptQuery}`
    );
  }

  /**
   * Fetch user's or department's attendance & leave requests
   */
  public async getRequests(params?: { status?: string; type?: string }): Promise<AttendanceRequest[]> {
    const queryParts: string[] = [];
    if (params?.status && params.status !== 'all') {
      queryParts.push(`status=${encodeURIComponent(params.status)}`);
    }
    if (params?.type && params.type !== 'all') {
      queryParts.push(`type=${encodeURIComponent(params.type)}`);
    }
    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return apiClient.get<AttendanceRequest[]>(`/leaves/requests${queryString}`);
  }

  /**
   * Fetch pending requests for HR / Lead approval inbox
   */
  public async getPendingRequests(): Promise<AttendanceRequest[]> {
    return apiClient.get<AttendanceRequest[]>('/leaves/pending');
  }

  /**
   * Submit a self-service request (Leave, Short Leave, WFH, Regularization)
   */
  public async createRequest(payload: CreateLeavePayload): Promise<AttendanceRequest> {
    return apiClient.post<AttendanceRequest>('/leaves/requests', payload);
  }

  /**
   * Review (Approve / Reject / Request Clarification) an attendance request with audit comment
   */
  public async reviewRequest(requestId: string, payload: ReviewLeavePayload): Promise<AttendanceRequest> {
    return apiClient.patch<AttendanceRequest>(`/leaves/requests/${requestId}/status`, payload);
  }

  /**
   * Submit employee clarification for a request with 'needs_info' status
   */
  public async clarifyRequest(requestId: string, payload: ClarifyLeavePayload): Promise<AttendanceRequest> {
    return apiClient.post<AttendanceRequest>(`/leaves/requests/${requestId}/clarify`, payload);
  }

  /**
   * Submit single-use appeal for a rejected request
   */
  public async appealRequest(requestId: string, payload: AppealLeavePayload): Promise<AttendanceRequest> {
    return apiClient.post<AttendanceRequest>(`/leaves/requests/${requestId}/appeal`, payload);
  }

  /**
   * Edit or reverse the status of an already resolved request
   */
  public async editRequestStatus(requestId: string, payload: EditLeaveStatusPayload): Promise<AttendanceRequest> {
    return apiClient.post<AttendanceRequest>(`/leaves/requests/${requestId}/edit-status`, payload);
  }

  /**
   * Delete an accidental or incorrect attendance request
   */
  public async deleteRequest(requestId: string): Promise<{ success: boolean; message: string }> {
    return apiClient.delete<{ success: boolean; message: string }>(`/leaves/requests/${requestId}`);
  }

  /**
   * Fetch all configured shift templates
   */
  public async getShifts(): Promise<ShiftTemplate[]> {
    return apiClient.get<ShiftTemplate[]>('/shifts');
  }

  /**
   * Fetch all user shift assignments
   */
  public async getShiftAssignments(): Promise<ShiftAssignment[]> {
    return apiClient.get<ShiftAssignment[]>('/shifts/assignments');
  }

  /**
   * Assign or update a user's designated shift template (HR / Admin only)
   */
  public async assignShift(payload: {
    user_id: string;
    shift_id: string;
    effective_from?: string;
    weekday_rules?: ShiftAssignment['weekday_rules'];
    date_overrides?: ShiftAssignment['date_overrides'];
  }): Promise<ShiftAssignment> {
    return apiClient.post<ShiftAssignment>('/shifts/assignments', payload);
  }

  /**
   * Create a new shift template (HR / Admin)
   */
  public async createShift(shift: Partial<ShiftTemplate>): Promise<ShiftTemplate> {
    return apiClient.post<ShiftTemplate>('/shifts', shift);
  }

  /**
   * Update an existing shift template (HR / Admin)
   */
  public async updateShift(id: string, shift: Partial<ShiftTemplate>): Promise<ShiftTemplate> {
    return apiClient.put<ShiftTemplate>(`/shifts/${id}`, shift);
  }

  /**
   * Delete a shift template (HR / Admin)
   */
  public async deleteShift(id: string): Promise<{ message: string; id: string }> {
    return apiClient.delete<{ message: string; id: string }>(`/shifts/${id}`);
  }

  /**
   * Fetch attendance security settings (Office IP, Coordinates, Geofencing radius)
   */
  public async getSecuritySettings(): Promise<SecuritySettings> {
    return apiClient.get<SecuritySettings>('/attendance/settings');
  }

  /**
   * Update attendance security settings (HR / Admin)
   */
  public async updateSecuritySettings(settings: Partial<SecuritySettings>): Promise<SecuritySettings> {
    return apiClient.put<SecuritySettings>('/attendance/settings', settings);
  }

  /**
   * Fetch company calendar events / holidays for a given month
   */
  public async getCompanyCalendar(year: number, month: number): Promise<CompanyCalendarEvent[]> {
    const data = await apiClient.get<{ events?: CompanyCalendarEvent[] } | CompanyCalendarEvent[]>(
      `/company-calendar?year=${year}&month=${month}`
    );
    if (Array.isArray(data)) {
      return data;
    }
    return data?.events || [];
  }

  /**
   * Fetch full calendar month with events, holidays, and working saturdays
   */
  public async getCalendarMonth(year: number, month: number): Promise<{ events: CompanyCalendarEvent[]; holidays: string[]; working_saturdays: string[] }> {
    return apiClient.get<{ events: CompanyCalendarEvent[]; holidays: string[]; working_saturdays: string[] }>(`/company-calendar?year=${year}&month=${month}`);
  }

  /**
   * Create a new company calendar event / holiday (HR / Admin)
   */
  public async createCalendarEvent(payload: Partial<CompanyCalendarEvent>): Promise<CompanyCalendarEvent> {
    return apiClient.post<CompanyCalendarEvent>('/company-calendar', payload);
  }

  /**
   * Delete a company calendar event (HR / Admin)
   */
  public async deleteCalendarEvent(id: string): Promise<{ message: string; id: string }> {
    return apiClient.delete<{ message: string; id: string }>(`/company-calendar/${id}`);
  }

  /**
   * HR Manual override for an attendance record with reason audit
   */
  public async overrideAttendance(
    recordId: string,
    payload: OverrideAttendancePayload
  ): Promise<AttendanceRecord> {
    return apiClient.patch<AttendanceRecord>(`/attendance/records/${recordId}/override`, payload);
  }

  public async getAttendanceConfig(): Promise<AttendanceConfig> {
    return apiClient.get<AttendanceConfig>('/attendance/config');
  }

  public async getMyLeaveBalance(year?: number): Promise<LeaveBalance> {
    const q = year ? `?year=${year}` : '';
    return apiClient.get<LeaveBalance>(`/leaves/balances/me${q}`);
  }

  public async getLeaveBalances(year?: number): Promise<LeaveBalance[]> {
    const q = year ? `?year=${year}` : '';
    return apiClient.get<LeaveBalance[]>(`/leaves/balances${q}`);
  }

  public async updateLeaveOpening(
    userId: string,
    payload: {
      year?: number;
      annual_used_opening?: number;
      sick_used_opening?: number;
      annual_entitled?: number;
      sick_entitled?: number;
    }
  ): Promise<LeaveBalance> {
    return apiClient.put<LeaveBalance>(`/leaves/balances/${encodeURIComponent(userId)}`, payload);
  }

  /**
   * HR dispatches an inquiry asking an employee for their missed checkout time
   */
  public async createMissedPunchInquiry(payload: {
    user_id: string;
    date: string;
    note?: string;
  }): Promise<import('../types/attendance').MissedPunchInquiry> {
    return apiClient.post<import('../types/attendance').MissedPunchInquiry>('/attendance/missed-punch-inquiries', payload);
  }

  /**
   * Retrieves pending missed punch inquiries for current user
   */
  public async getMyPendingMissedPunchInquiries(): Promise<import('../types/attendance').MissedPunchInquiry[]> {
    return apiClient.get<import('../types/attendance').MissedPunchInquiry[]>('/attendance/missed-punch-inquiries/pending');
  }

  /**
   * HR queries all missed punch inquiries
   */
  public async getMissedPunchInquiries(params?: {
    user_id?: string;
    date?: string;
    status?: string;
  }): Promise<import('../types/attendance').MissedPunchInquiry[]> {
    const query = new URLSearchParams();
    if (params?.user_id) query.append('user_id', params.user_id);
    if (params?.date) query.append('date', params.date);
    if (params?.status) query.append('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiClient.get<import('../types/attendance').MissedPunchInquiry[]>(`/attendance/missed-punch-inquiries${qs}`);
  }

  /**
   * Employee responds to missed punch inquiry with checkout time and explanation
   */
  public async respondToMissedPunchInquiry(
    inquiryId: string,
    payload: { check_out: string; reason: string }
  ): Promise<{ message: string; attendance_record: AttendanceRecord }> {
    return apiClient.post<{ message: string; attendance_record: AttendanceRecord }>(
      `/attendance/missed-punch-inquiries/${inquiryId}/respond`,
      payload
    );
  }
}

export const attendanceService = new AttendanceService();

