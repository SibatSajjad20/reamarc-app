import { apiClient } from './apiClient';
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
  ShiftTemplate,
  SecuritySettings,
  CompanyCalendarEvent,
  OverrideAttendancePayload,
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
    return apiClient.post<AttendanceRecord>('/attendance/check-in', payload);
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
   * Review (Approve / Reject) an attendance request with audit comment
   */
  public async reviewRequest(requestId: string, payload: ReviewLeavePayload): Promise<AttendanceRequest> {
    return apiClient.patch<AttendanceRequest>(`/leaves/requests/${requestId}/status`, payload);
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
  public async getShiftAssignments(): Promise<Array<{ user_id: string; shift_id: string; shift_name: string; effective_from: string }>> {
    return apiClient.get<Array<{ user_id: string; shift_id: string; shift_name: string; effective_from: string }>>('/shifts/assignments');
  }

  /**
   * Assign or update a user's designated shift template (HR / Admin only)
   */
  public async assignShift(payload: { user_id: string; shift_id: string; effective_from?: string }): Promise<any> {
    return apiClient.post<any>('/shifts/assignments', payload);
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
}

export const attendanceService = new AttendanceService();
