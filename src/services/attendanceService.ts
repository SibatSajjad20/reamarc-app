import { apiClient } from './apiClient';
import { isBootstrapMissing } from '../utils/bootstrapCompat';
import { detectPublicIp } from '../utils/publicIp';
import { emitInvalidation, registerCacheClearer } from '../utils/cacheBus';
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
  ShiftChangePreviewResponse,
} from '../types/attendance';

export interface AttendanceCacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/**
 * Bounded LRU Cache to store session data in memory without causing memory leaks or pressure.
 */
class BoundedCache<T> {
  private map = new Map<string, AttendanceCacheEntry<T>>();
  private maxEntries: number;

  constructor(maxEntries: number = 30) {
    this.maxEntries = maxEntries;
  }

  public get(key: string): AttendanceCacheEntry<T> | undefined {
    const entry = this.map.get(key);
    if (entry) {
      this.map.delete(key);
      this.map.set(key, entry);
    }
    return entry;
  }

  public set(key: string, data: T): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, { data, fetchedAt: Date.now() });
  }

  public delete(key: string): void {
    this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }
}

class AttendanceService {
  private companyScope = 'unknown';
  private bootstrapMissing = false;
  private bootstrapRevalidating = false;
  private bootstrapCache = new BoundedCache<{
    kind: 'management' | 'employee';
    matrix: DailyMatrixResponse | null;
    timesheet: PersonalTimesheetResponse | null;
    config: AttendanceConfig;
    meta: { company_id: string; date: string };
  }>(4);
  private monthlySummaryCache = new BoundedCache<MonthlyPunctualityResponse>(24);
  private matrixCache = new BoundedCache<DailyMatrixResponse>(30);
  private employeeTimesheetCache = new BoundedCache<PersonalTimesheetResponse>(50);
  private myTimesheetCache = new BoundedCache<PersonalTimesheetResponse>(24);

  public setCompanyScope(companyId?: string | null): void {
    this.companyScope = companyId || 'unknown';
  }

  private key(value: string): string {
    return `${this.companyScope}:${value}`;
  }

  public getCachedMonthlySummary(year: number, month: number, department?: string): AttendanceCacheEntry<MonthlyPunctualityResponse> | undefined {
    const deptKey = department && department !== 'All' ? department.toLowerCase() : 'all';
    return this.monthlySummaryCache.get(this.key(`${year}-${month}-${deptKey}`));
  }

  public setCachedMonthlySummary(year: number, month: number, data: MonthlyPunctualityResponse, department?: string): void {
    const deptKey = department && department !== 'All' ? department.toLowerCase() : 'all';
    this.monthlySummaryCache.set(this.key(`${year}-${month}-${deptKey}`), data);
  }

  public getCachedDailyMatrix(date: string, department?: string): AttendanceCacheEntry<DailyMatrixResponse> | undefined {
    const deptKey = department && department !== 'All' ? department.toLowerCase() : 'all';
    return this.matrixCache.get(this.key(`${date}-${deptKey}`));
  }

  public setCachedDailyMatrix(date: string, data: DailyMatrixResponse, department?: string): void {
    const deptKey = department && department !== 'All' ? department.toLowerCase() : 'all';
    this.matrixCache.set(this.key(`${date}-${deptKey}`), data);
  }

  public getCachedEmployeeTimesheet(userId: string, year: number, month: number): AttendanceCacheEntry<PersonalTimesheetResponse> | undefined {
    return this.employeeTimesheetCache.get(this.key(`${userId}-${year}-${month}`));
  }

  public setCachedEmployeeTimesheet(userId: string, year: number, month: number, data: PersonalTimesheetResponse): void {
    this.employeeTimesheetCache.set(this.key(`${userId}-${year}-${month}`), data);
  }

  public getCachedMyTimesheet(year: number, month: number): AttendanceCacheEntry<PersonalTimesheetResponse> | undefined {
    return this.myTimesheetCache.get(this.key(`${year}-${month}`));
  }

  public setCachedMyTimesheet(year: number, month: number, data: PersonalTimesheetResponse): void {
    this.myTimesheetCache.set(this.key(`${year}-${month}`), data);
  }

  private requestsCache = new BoundedCache<AttendanceRequest[]>(5);
  private todayStatusCache = new BoundedCache<TodayAttendanceResponse>(2);

  public getCachedRequests(): AttendanceCacheEntry<AttendanceRequest[]> | undefined {
    return this.requestsCache.get(this.key('requests'));
  }

  public setCachedRequests(data: AttendanceRequest[]): void {
    this.requestsCache.set(this.key('requests'), data);
  }

  public getCachedTodayStatus(): AttendanceCacheEntry<TodayAttendanceResponse> | undefined {
    return this.todayStatusCache.get(this.key('today'));
  }

  public setCachedTodayStatus(data: TodayAttendanceResponse): void {
    this.todayStatusCache.set(this.key('today'), data);
  }

  public clearAllCaches(): void {
    this.monthlySummaryCache.clear();
    this.matrixCache.clear();
    this.employeeTimesheetCache.clear();
    this.myTimesheetCache.clear();
    this.requestsCache.clear();
    this.todayStatusCache.clear();
    this.bootstrapCache.clear();
    this.bootstrapMissing = false;
    this.bootstrapRevalidating = false;
  }

  public getCachedBootstrap(): AttendanceCacheEntry<{
    kind: 'management' | 'employee';
    matrix: DailyMatrixResponse | null;
    timesheet: PersonalTimesheetResponse | null;
    config: AttendanceConfig;
    meta: { company_id: string; date: string };
  }> | undefined {
    return this.bootstrapCache.get(this.key('bootstrap'));
  }
  /**
   * Fetch current user's today attendance status, assigned shift, and WFH state
   */
  public async getTodayStatus(): Promise<TodayAttendanceResponse> {
    const res = await apiClient.get<TodayAttendanceResponse>('/attendance/today');
    if (res) {
      this.setCachedTodayStatus(res);
    }
    return res;
  }

  public async getBootstrap(): Promise<{
    kind: 'management' | 'employee';
    matrix: DailyMatrixResponse | null;
    timesheet: PersonalTimesheetResponse | null;
    config: AttendanceConfig;
    meta: { company_id: string; date: string };
  }> {
    const key = this.key('bootstrap');
    const cached = this.bootstrapCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < 60_000) {
      if (!this.bootstrapRevalidating) {
        this.bootstrapRevalidating = true;
        window.setTimeout(() => {
          void this.fetchBootstrap()
            .catch(() => undefined)
            .finally(() => {
              this.bootstrapRevalidating = false;
            });
        }, 2500);
      }
      return cached.data;
    }
    return this.fetchBootstrap();
  }

  private async fetchBootstrap(): Promise<{
    kind: 'management' | 'employee';
    matrix: DailyMatrixResponse | null;
    timesheet: PersonalTimesheetResponse | null;
    config: AttendanceConfig;
    meta: { company_id: string; date: string };
  }> {
    const key = this.key('bootstrap');
    if (this.bootstrapMissing) {
      const data = await this.legacyBootstrap();
      this.bootstrapCache.set(key, data);
      return data;
    }
    try {
      const data = await apiClient.get<{
        kind: 'management' | 'employee';
        matrix: DailyMatrixResponse | null;
        timesheet: PersonalTimesheetResponse | null;
        config: AttendanceConfig;
        meta: { company_id: string; date: string };
      }>('/attendance/bootstrap');
      this.bootstrapCache.set(key, { ...data, matrix: data.kind === 'management' ? null : data.matrix });
      return this.bootstrapCache.get(key)!.data;
    } catch (error) {
      if (isBootstrapMissing(error) && !this.bootstrapMissing) {
        this.bootstrapMissing = true;
        const data = await this.legacyBootstrap();
        this.bootstrapCache.set(key, data);
        return data;
      }
      throw error;
    }
  }

  private async legacyBootstrap(): Promise<{
    kind: 'management' | 'employee';
    matrix: DailyMatrixResponse | null;
    timesheet: PersonalTimesheetResponse | null;
    config: AttendanceConfig;
    meta: { company_id: string; date: string };
  }> {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const config = await this.getAttendanceConfig();
    return {
      kind: 'employee',
      matrix: null,
      timesheet: await this.getMyTimesheet(now.getFullYear(), now.getMonth() + 1).catch(() => null),
      config,
      meta: { company_id: this.companyScope, date },
    };
  }

  /**
   * Submit Check-In punch with optional GPS coordinates and notes
   */
  public async checkIn(payload: CheckInPayload): Promise<AttendanceRecord> {
    const publicIp = payload.detected_public_ip || (await detectPublicIp()) || undefined;
    const res = await apiClient.post<AttendanceRecord>('/attendance/check-in', {
      ...payload,
      detected_public_ip: publicIp,
    });
    this.todayStatusCache.clear();
    this.myTimesheetCache.clear();
    this.bootstrapCache.clear();
    emitInvalidation(['attendance', 'dashboard', 'daily-log']);
    return res;
  }

  /**
   * Submit Check-Out punch with optional GPS (same office proof as check-in) and notes
   */
  public async checkOut(payload: CheckOutPayload = {}): Promise<AttendanceRecord> {
    const publicIp = payload.detected_public_ip || (await detectPublicIp()) || undefined;
    const res = await apiClient.post<AttendanceRecord>('/attendance/check-out', {
      ...payload,
      detected_public_ip: publicIp,
    });
    this.todayStatusCache.clear();
    this.myTimesheetCache.clear();
    this.bootstrapCache.clear();
    emitInvalidation(['attendance', 'dashboard', 'daily-log']);
    return res;
  }

  /**
   * Start or end break interval
   */
  public async toggleBreak(payload: BreakActionPayload): Promise<AttendanceRecord> {
    const res = await apiClient.post<AttendanceRecord>('/attendance/break', payload);
    this.todayStatusCache.clear();
    this.myTimesheetCache.clear();
    this.bootstrapCache.clear();
    emitInvalidation(['attendance', 'dashboard', 'daily-log']);
    return res;
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
  public async getDailyMatrix(
    date: string,
    department?: string,
    options?: RequestInit
  ): Promise<DailyMatrixResponse> {
    const deptQuery = department && department !== 'All' ? `&department=${encodeURIComponent(department)}` : '';
    return apiClient.get<DailyMatrixResponse>(`/attendance/matrix?date=${date}${deptQuery}`, options);
  }

  /**
   * Fetch company-wide monthly punctuality command center summary
   */
  public async getMonthlySummary(
    year: number,
    month: number,
    department?: string,
    options?: RequestInit
  ): Promise<MonthlyPunctualityResponse> {
    const deptQuery = department && department !== 'All' ? `&department=${encodeURIComponent(department)}` : '';
    return apiClient.get<MonthlyPunctualityResponse>(
      `/attendance/monthly-summary?year=${year}&month=${month}${deptQuery}`,
      options
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
    const res = await apiClient.get<AttendanceRequest[]>(`/leaves/requests${queryString}`);
    if (res && queryParts.length === 0) {
      this.setCachedRequests(res);
    }
    return res;
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
    const res = await apiClient.post<AttendanceRequest>('/leaves/requests', payload);
    this.requestsCache.clear();
    emitInvalidation(['requests', 'approvals', 'attendance', 'dashboard', 'notifications']);
    return res;
  }

  /**
   * Review (Approve / Reject / Request Clarification) an attendance request with audit comment
   */
  public async reviewRequest(requestId: string, payload: ReviewLeavePayload): Promise<AttendanceRequest> {
    const res = await apiClient.patch<AttendanceRequest>(`/leaves/requests/${requestId}/status`, payload);
    this.requestsCache.clear();
    this.matrixCache.clear();
    this.monthlySummaryCache.clear();
    this.employeeTimesheetCache.clear();
    emitInvalidation(['requests', 'approvals', 'attendance', 'dashboard', 'notifications']);
    return res;
  }

  /**
   * Submit employee clarification for a request with 'needs_info' status
   */
  public async clarifyRequest(requestId: string, payload: ClarifyLeavePayload): Promise<AttendanceRequest> {
    const res = await apiClient.post<AttendanceRequest>(`/leaves/requests/${requestId}/clarify`, payload);
    this.requestsCache.clear();
    emitInvalidation(['requests', 'approvals', 'attendance', 'dashboard', 'notifications']);
    return res;
  }

  /**
   * Submit single-use appeal for a rejected request
   */
  public async appealRequest(requestId: string, payload: AppealLeavePayload): Promise<AttendanceRequest> {
    const res = await apiClient.post<AttendanceRequest>(`/leaves/requests/${requestId}/appeal`, payload);
    this.requestsCache.clear();
    emitInvalidation(['requests', 'approvals', 'attendance', 'dashboard', 'notifications']);
    return res;
  }

  /**
   * Edit or reverse the status of an already resolved request
   */
  public async editRequestStatus(requestId: string, payload: EditLeaveStatusPayload): Promise<AttendanceRequest> {
    const res = await apiClient.post<AttendanceRequest>(`/leaves/requests/${requestId}/edit-status`, payload);
    this.requestsCache.clear();
    this.matrixCache.clear();
    this.monthlySummaryCache.clear();
    this.employeeTimesheetCache.clear();
    emitInvalidation(['requests', 'approvals', 'attendance', 'dashboard', 'notifications']);
    return res;
  }

  /**
   * Delete an accidental or incorrect attendance request
   */
  public async deleteRequest(requestId: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.delete<{ success: boolean; message: string }>(`/leaves/requests/${requestId}`);
    this.requestsCache.clear();
    emitInvalidation(['requests', 'approvals', 'attendance', 'dashboard', 'notifications']);
    return res;
  }

  /**
   * Preview a Shift Change request before submission
   */
  public async getShiftChangePreview(params: {
    dates: string[];
    shift_id?: string;
    location?: string;
    custom_start?: string;
    custom_end?: string;
    overnight?: boolean;
  }): Promise<ShiftChangePreviewResponse> {
    const query = new URLSearchParams();
    query.set('dates', params.dates.join(','));
    if (params.shift_id) query.set('shift_id', params.shift_id);
    if (params.location) query.set('location', params.location);
    if (params.custom_start) query.set('custom_start', params.custom_start);
    if (params.custom_end) query.set('custom_end', params.custom_end);
    if (params.overnight) query.set('overnight', 'true');
    return apiClient.get<ShiftChangePreviewResponse>(`/leaves/shift-change/preview?${query.toString()}`);
  }

  /**
   * Cancel an approved or pending shift change request (or specific dates)
   */
  public async cancelShiftChange(requestId: string, dates?: string[]): Promise<boolean> {
    const query = dates && dates.length > 0 ? `?dates=${dates.join(',')}` : '';
    const res = await apiClient.delete<{ success: boolean }>(`/leaves/requests/${requestId}${query}`);
    this.requestsCache.clear();
    this.matrixCache.clear();
    this.monthlySummaryCache.clear();
    this.employeeTimesheetCache.clear();
    emitInvalidation(['requests', 'approvals', 'attendance', 'dashboard', 'notifications']);
    return res.success;
  }

  /**
   * Get the current user's approved working-day override dates (ISO strings)
   */
  public async getMyWorkingOverrides(): Promise<string[]> {
    try {
      const res = await apiClient.get<string[]>('/attendance/my-working-overrides');
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
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
    const res = await apiClient.post<ShiftAssignment>('/shifts/assignments', payload);
    emitInvalidation(['attendance', 'settings', 'dashboard']);
    return res;
  }

  /**
   * Create a new shift template (HR / Admin)
   */
  public async createShift(shift: Partial<ShiftTemplate>): Promise<ShiftTemplate> {
    const res = await apiClient.post<ShiftTemplate>('/shifts', shift);
    emitInvalidation(['attendance', 'settings', 'dashboard']);
    return res;
  }

  /**
   * Update an existing shift template (HR / Admin)
   */
  public async updateShift(id: string, shift: Partial<ShiftTemplate>): Promise<ShiftTemplate> {
    const res = await apiClient.put<ShiftTemplate>(`/shifts/${id}`, shift);
    emitInvalidation(['attendance', 'settings', 'dashboard']);
    return res;
  }

  /**
   * Delete a shift template (HR / Admin)
   */
  public async deleteShift(id: string): Promise<{ message: string; id: string }> {
    const res = await apiClient.delete<{ message: string; id: string }>(`/shifts/${id}`);
    emitInvalidation(['attendance', 'settings', 'dashboard']);
    return res;
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
    const res = await apiClient.put<SecuritySettings>('/attendance/settings', settings);
    emitInvalidation(['attendance', 'settings', 'dashboard']);
    return res;
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
   * Fetch calendar month (or full year if month omitted) with events, holidays, and working saturdays
   */
  public async getCalendarMonth(year: number, month?: number): Promise<{ events: CompanyCalendarEvent[]; holidays: string[]; working_saturdays: string[] }> {
    const q = month !== undefined ? `&month=${month}` : '';
    return apiClient.get<{ events: CompanyCalendarEvent[]; holidays: string[]; working_saturdays: string[] }>(`/company-calendar?year=${year}${q}`);
  }

  /**
   * Create a new company calendar event / holiday (HR / Admin)
   */
  public async createCalendarEvent(payload: Partial<CompanyCalendarEvent>): Promise<CompanyCalendarEvent> {
    const res = await apiClient.post<CompanyCalendarEvent>('/company-calendar', payload);
    emitInvalidation(['attendance', 'settings', 'dashboard']);
    return res;
  }

  /**
   * Delete a company calendar event (HR / Admin)
   */
  public async deleteCalendarEvent(id: string): Promise<{ message: string; id: string }> {
    const res = await apiClient.delete<{ message: string; id: string }>(`/company-calendar/${id}`);
    emitInvalidation(['attendance', 'settings', 'dashboard']);
    return res;
  }

  /**
   * HR Manual override for an attendance record with reason audit
   */
  public async overrideAttendance(
    recordId: string,
    payload: OverrideAttendancePayload
  ): Promise<AttendanceRecord> {
    const res = await apiClient.patch<AttendanceRecord>(`/attendance/records/${recordId}/override`, payload);
    this.matrixCache.clear();
    this.monthlySummaryCache.clear();
    this.employeeTimesheetCache.clear();
    this.myTimesheetCache.clear();
    emitInvalidation(['attendance', 'dashboard', 'daily-log']);
    return res;
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
    return apiClient.get<LeaveBalance[]>(`/leaves/balances${q}`, { timeout: 30000 });
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
    const res = await apiClient.put<LeaveBalance>(`/leaves/balances/${encodeURIComponent(userId)}`, payload);
    emitInvalidation(['attendance', 'settings', 'dashboard']);
    return res;
  }

  /**
   * HR dispatches an inquiry asking an employee for their missed checkout time
   */
  public async createMissedPunchInquiry(payload: {
    user_id: string;
    date: string;
    note?: string;
  }): Promise<import('../types/attendance').MissedPunchInquiry> {
    const res = await apiClient.post<import('../types/attendance').MissedPunchInquiry>('/attendance/missed-punch-inquiries', payload);
    emitInvalidation(['attendance', 'dashboard']);
    return res;
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
    const res = await apiClient.post<{ message: string; attendance_record: AttendanceRecord }>(
      `/attendance/missed-punch-inquiries/${inquiryId}/respond`,
      payload
    );
    this.matrixCache.clear();
    this.myTimesheetCache.clear();
    this.todayStatusCache.clear();
    emitInvalidation(['attendance', 'dashboard', 'daily-log']);
    return res;
  }

  /**
   * Download official multi-tab Excel (.xlsx) workbook from backend
   */
  public async exportAttendanceExcel(
    year: number,
    month: number,
    department?: string
  ): Promise<Blob> {
    const deptQuery = department && department !== 'All' ? `&department=${encodeURIComponent(department)}` : '';
    return apiClient.getBlob(`/attendance/export/excel?year=${year}&month=${month}${deptQuery}`);
  }
}

export const attendanceService = new AttendanceService();

// Register for app-wide cache sweep on logout and user switch
registerCacheClearer(() => attendanceService.clearAllCaches());

