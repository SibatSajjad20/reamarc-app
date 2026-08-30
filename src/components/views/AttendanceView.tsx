import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Grid,
  BarChart3,
  Inbox,
  Download,
  FilePlus,
  RefreshCw,
  Clock,
  Calendar,
  Users,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { attendanceService } from '../../services/attendanceService';
import { adminService } from '../../services/adminService';
import { getAttendanceMinDate } from '../../constants/attendance';

import type {
  PersonalTimesheetResponse,
  DailyMatrixResponse,
  MonthlyPunctualityResponse,
  AttendanceRequest,
  RequestType,
  AttendanceRecord,
  MissedPunchInquiry,
} from '../../types/attendance';
import type { AdminMember } from '../../types/admin';

import { PersonalTimesheetTable } from '../attendance/PersonalTimesheetTable';
import { DailyAttendanceMatrix } from '../attendance/DailyAttendanceMatrix';
import { MonthlyPunctualityCommandCenter } from '../attendance/MonthlyPunctualityCommandCenter';
import { RequestManagementModal } from '../attendance/RequestManagementModal';
import { ApprovalInboxSection } from '../attendance/ApprovalInboxSection';
import { MissedCheckoutResponseModal } from '../attendance/MissedCheckoutResponseModal';
type AdminAttendanceSubTab =
  | 'daily-matrix'
  | 'punctuality-hub'
  | 'employee-timesheets'
  | 'approvals';

type EmployeeAttendanceSubTab =
  | 'timesheet'
  | 'requests';

export const AttendanceView: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();

  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';

  // Category 1: Admin, HR, Operations have company-wide management suite
  const isManagementRole = isAdmin || isHR || isOperations;

  // Active Sub-Tab for Management
  const [activeTab, setActiveTab] = useState<AdminAttendanceSubTab>('daily-matrix');

  // Active Sub-Tab for Employee (Team Lead, Team Member)
  const [employeeTab, setEmployeeTab] = useState<EmployeeAttendanceSubTab>('timesheet');

  // Date and Filter State
  const today = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1);

  const getTodayIso = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [matrixDate, setMatrixDate] = useState<string>(getTodayIso());
  const [attendanceMinDate, setAttendanceMinDate] = useState<string>(getAttendanceMinDate());
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');

  // Loading States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingTimesheet, setIsLoadingTimesheet] = useState<boolean>(false);
  useModuleLoadGate(isLoading);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Data States
  const [timesheetData, setTimesheetData] = useState<PersonalTimesheetResponse | null>(null);
  const [matrixData, setMatrixData] = useState<DailyMatrixResponse | null>(null);
  const [monthlySummaryData, setMonthlySummaryData] = useState<MonthlyPunctualityResponse | null>(null);
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [directoryMembers, setDirectoryMembers] = useState<AdminMember[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [employeeTimesheet, setEmployeeTimesheet] = useState<PersonalTimesheetResponse | null>(null);
  const timesheetAbortRef = useRef<AbortController | null>(null);
  const timesheetReqIdRef = useRef(0);
  const matrixAbortRef = useRef<AbortController | null>(null);
  const matrixReqIdRef = useRef(0);
  const [isLoadingMatrix, setIsLoadingMatrix] = useState<boolean>(false);

  // Modal States
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestDefaultTab, setRequestDefaultTab] = useState<RequestType>('leave');
  const [initialRecordForReq, setInitialRecordForReq] = useState<AttendanceRecord | null>(null);

  // Missed Punch Inquiries State (For Employee)
  const [pendingInquiries, setPendingInquiries] = useState<MissedPunchInquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<MissedPunchInquiry | null>(null);
  const [isResponseModalOpen, setIsResponseModalOpen] = useState(false);

  // ==========================================
  // DATA FETCHING & ORCHESTRATION
  // ==========================================

  const loadPendingInquiries = useCallback(async () => {
    try {
      const data = await attendanceService.getMyPendingMissedPunchInquiries();
      setPendingInquiries(data || []);
    } catch {
      setPendingInquiries([]);
    }
  }, []);

  const loadTimesheet = useCallback(async (y: number, m: number) => {
    try {
      const data = await attendanceService.getMyTimesheet(y, m);
      if (data) {
        setTimesheetData(data);
      }
    } catch (err: any) {
      console.error('Failed to load timesheet:', err);
    }
  }, []);

  const loadMatrix = useCallback(async (date: string, dept?: string) => {
    matrixAbortRef.current?.abort();
    const controller = new AbortController();
    matrixAbortRef.current = controller;
    const reqId = ++matrixReqIdRef.current;
    setIsLoadingMatrix(true);
    try {
      const data = await attendanceService.getDailyMatrix(date, dept, { signal: controller.signal });
      if (reqId !== matrixReqIdRef.current) return;
      if (data) {
        setMatrixData(data);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== matrixReqIdRef.current) return;
      console.error('Failed to load daily attendance matrix:', err);
    } finally {
      if (reqId === matrixReqIdRef.current) {
        setIsLoadingMatrix(false);
      }
    }
  }, []);

  const loadMonthlySummary = useCallback(async (y: number, m: number, dept?: string) => {
    try {
      const data = await attendanceService.getMonthlySummary(y, m, dept);
      if (data) {
        setMonthlySummaryData(data);
      }
    } catch (err: any) {
      console.error('Failed to load monthly punctuality summary:', err);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const data = await attendanceService.getRequests();
      setRequests(data || []);
    } catch (err: any) {
      console.error('Failed to load attendance requests:', err);
    }
  }, []);

  const loadDirectoryMembers = useCallback(async () => {
    try {
      const members = await adminService.getMembers({ is_active: true });
      const internal = (members || []).filter(
        (m) => m.role !== 'client' && m.role !== 'admin' && m.is_active !== false
      );
      setDirectoryMembers(internal);
      setSelectedEmployeeId((prev) => {
        if (prev && internal.some((m) => m.id === prev)) return prev;
        return internal[0]?.id || '';
      });
    } catch (err: any) {
      console.error('Failed to load team directory:', err);
    }
  }, []);

  const loadEmployeeTimesheet = useCallback(async (userId: string, y: number, m: number) => {
    if (!userId) {
      setEmployeeTimesheet(null);
      setIsLoadingTimesheet(false);
      return;
    }
    timesheetAbortRef.current?.abort();
    const controller = new AbortController();
    timesheetAbortRef.current = controller;
    const reqId = ++timesheetReqIdRef.current;
    setIsLoadingTimesheet(true);
    setEmployeeTimesheet(null);
    try {
      const data = await attendanceService.getEmployeeTimesheet(userId, y, m, { signal: controller.signal });
      if (reqId !== timesheetReqIdRef.current) return;
      setEmployeeTimesheet(data || null);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== timesheetReqIdRef.current) return;
      console.error('Failed to load employee timesheet:', err);
      setEmployeeTimesheet(null);
    } finally {
      if (reqId === timesheetReqIdRef.current) {
        setIsLoadingTimesheet(false);
      }
    }
  }, []);

  // Main refresh trigger
  const handleRefreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isManagementRole) {
        await Promise.allSettled([
          loadMatrix(matrixDate),
          loadMonthlySummary(selectedYear, selectedMonth),
          loadRequests(),
          loadDirectoryMembers(),
          loadPendingInquiries(),
        ]);
      } else {
        await Promise.allSettled([
          loadTimesheet(selectedYear, selectedMonth),
          loadRequests(),
          loadPendingInquiries(),
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    isManagementRole,
    loadTimesheet,
    loadMatrix,
    loadMonthlySummary,
    loadRequests,
    loadDirectoryMembers,
    loadPendingInquiries,
    selectedYear,
    selectedMonth,
    matrixDate,
  ]);

  // Initial load on mount
  useEffect(() => {
    handleRefreshAll();
  }, [isManagementRole]);

  useEffect(() => {
    attendanceService
      .getAttendanceConfig()
      .then((cfg) => {
        setAttendanceMinDate(cfg.effective_start_date);
        setMatrixDate((prev) => (prev < cfg.effective_start_date ? cfg.effective_start_date : prev));
      })
      .catch(() => {
        setAttendanceMinDate(getAttendanceMinDate());
      });
  }, []);

  useEffect(() => {
    if (!isManagementRole || !selectedEmployeeId) return;
    if (activeTab !== 'employee-timesheets') return;
    const timer = window.setTimeout(() => {
      void loadEmployeeTimesheet(selectedEmployeeId, selectedYear, selectedMonth);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [
    isManagementRole,
    activeTab,
    selectedEmployeeId,
    selectedYear,
    selectedMonth,
    loadEmployeeTimesheet,
  ]);

  // Year / Month Change Handler
  const handleYearMonthChange = (year: number, month: number) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    let nextYear = year;
    let nextMonth = month;
    if (nextYear < 2026 || (nextYear === 2026 && nextMonth < 8)) {
      nextYear = 2026;
      nextMonth = 8;
    }
    if (nextYear > currentYear || (nextYear === currentYear && nextMonth > currentMonth)) {
      nextYear = currentYear;
      nextMonth = currentMonth;
    }
    setSelectedYear(nextYear);
    setSelectedMonth(nextMonth);
    if (isManagementRole) {
      loadMonthlySummary(nextYear, nextMonth);
    } else {
      loadTimesheet(nextYear, nextMonth);
    }
  };

  // Open Request Modal Helper
  const handleOpenRequestModal = (
    defaultTab: RequestType = 'leave',
    record?: AttendanceRecord | null
  ) => {
    setRequestDefaultTab(defaultTab);
    setInitialRecordForReq(record || null);
    setIsRequestModalOpen(true);
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      addToast('Generating Excel Workbook 📊', 'Building multi-tab workbook with company summary & employee timesheets...', 'info');

      const blob = await attendanceService.exportAttendanceExcel(
        selectedYear,
        selectedMonth,
        selectedDepartment !== 'All' ? selectedDepartment : undefined
      );

      const filename = `Reamarc_Attendance_Summary_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      addToast('Export Completed 🎉', 'Excel workbook downloaded successfully.', 'success');
    } catch (err: any) {
      console.error('Export failed:', err);
      addToast('Export Failed', err.message || 'Could not generate Excel file.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Filter requests for non-admin to show only their own requests
  const myRequests = useMemo(() => {
    if (isManagementRole) return requests;
    return requests.filter((r) => r.user_id === user?.id);
  }, [requests, isManagementRole, user?.id]);

  const pendingRequestsCount = useMemo(() => {
    return requests.filter((r) => r.status === 'pending').length;
  }, [requests]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 bg-slate-50 dark:bg-[#09090b]">
      {/* ── Top View Header ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#11131a] border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-950 dark:text-zinc-50 tracking-tight flex items-center gap-2.5">
              <Clock className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              <span>
                {isManagementRole
                  ? 'Attendance Command Center'
                  : 'My Attendance & Monthly Timesheet'}
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {isManagementRole
                ? 'Company-wide live daily register, monthly punctuality command center, and leave approvals'
                : 'View your monthly attendance records, check overtime/undertime balance, and submit regularization appeals'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
              title="Refresh Module Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Management Actions */}
            {isManagementRole && (
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={isExporting}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] shadow-sm shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExporting ? 'Exporting...' : 'Export Excel (.xlsx)'}</span>
              </button>
            )}

            {/* Employee Self-Service Action */}
            {!isManagementRole && (
              <button
                type="button"
                onClick={() => handleOpenRequestModal('leave')}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] shadow-sm shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <FilePlus className="w-3.5 h-3.5" />
                <span>Submit Appeal / Request</span>
              </button>
            )}
          </div>
        </div>

        {/* Management Sub-Tabs (Daily Matrix, Punctuality Hub, Approvals) */}
        {isManagementRole ? (
          <div className="px-4 sm:px-6 lg:px-8 flex gap-2 overflow-x-auto pt-2">
            {/* Tab 1: Daily Matrix */}
            <button
              type="button"
              onClick={() => setActiveTab('daily-matrix')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'daily-matrix'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-[#09090b] shadow-2xs'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>Daily Matrix (Live Register)</span>
            </button>

            {/* Tab 2: Punctuality Hub */}
            <button
              type="button"
              onClick={() => setActiveTab('punctuality-hub')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'punctuality-hub'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-[#09090b] shadow-2xs'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Punctuality Command Center</span>
            </button>

            {/* Tab 3: Individual employee timesheets */}
            <button
              type="button"
              onClick={() => setActiveTab('employee-timesheets')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'employee-timesheets'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-[#09090b] shadow-2xs'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Employee Timesheets</span>
            </button>

            {/* Tab 4: Approvals & Requests */}
            <button
              type="button"
              onClick={() => setActiveTab('approvals')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'approvals'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-[#09090b] shadow-2xs'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>Approvals & Requests</span>
              {pendingRequestsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-500 text-white">
                  {pendingRequestsCount}
                </span>
              )}
            </button>
          </div>
        ) : (
          /* Employee Sub-Tabs (Timesheet, My Requests & Appeals) */
          <div className="px-4 sm:px-6 lg:px-8 flex gap-2 overflow-x-auto pt-2">
            {/* Tab 1: Monthly Attendance Timesheet */}
            <button
              type="button"
              onClick={() => setEmployeeTab('timesheet')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 whitespace-nowrap ${
                employeeTab === 'timesheet'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-[#09090b] shadow-2xs'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Monthly Attendance Timesheet</span>
            </button>

            {/* Tab 2: My Requests & Appeals */}
            <button
              type="button"
              onClick={() => setEmployeeTab('requests')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 whitespace-nowrap ${
                employeeTab === 'requests'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-[#09090b] shadow-2xs'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>My Requests & Appeals</span>
              {myRequests.filter((r) => r.status === 'pending').length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-500 text-white">
                  {myRequests.filter((r) => r.status === 'pending').length}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Scrollable Body ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Actionable Missed Punch Inquiry Banner */}
        {pendingInquiries.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Action Required: Missed Checkout Inquiry ({pendingInquiries.length})
                </h4>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  HR requested your check-out time for{' '}
                  <strong className="text-amber-700 dark:text-amber-300 font-mono">
                    {pendingInquiries.map((i) => i.date).join(', ')}
                  </strong>
                  . Submit your check-out time and reason to regularize the shift.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedInquiry(pendingInquiries[0]);
                setIsResponseModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              Submit Checkout
            </button>
          </div>
        )}

        {/* VIEW TYPE A: MANAGEMENT ROLE (Admin, HR, Operations) */}
        {isManagementRole ? (
          <>
            {/* SUB-TAB 1: DAILY MATRIX */}
            {activeTab === 'daily-matrix' && (
              <DailyAttendanceMatrix
                matrixData={matrixData}
                selectedDate={matrixDate}
                onDateChange={(d) => {
                  setMatrixDate(d);
                  loadMatrix(d, selectedDepartment);
                }}
                selectedDepartment={selectedDepartment}
                onDepartmentChange={(dept) => {
                  setSelectedDepartment(dept);
                  loadMatrix(matrixDate, dept);
                }}
                isLoading={isLoading || isLoadingMatrix}
                onRefresh={() => loadMatrix(matrixDate, selectedDepartment)}
                canEditOverride={isAdmin || isHR || isOperations || user?.role === 'team_lead'}
                minDate={attendanceMinDate}
                onSelectEmployee={(userId) => {
                  setSelectedEmployeeId(userId);
                  const [y, m] = matrixDate.split('-').map(Number);
                  if (y) setSelectedYear(y);
                  if (m) setSelectedMonth(m);
                  setActiveTab('employee-timesheets');
                }}
              />
            )}

            {/* SUB-TAB 2: PUNCTUALITY COMMAND CENTER */}
            {activeTab === 'punctuality-hub' && (
              <MonthlyPunctualityCommandCenter
                summaryData={monthlySummaryData}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                onYearMonthChange={handleYearMonthChange}
                selectedDepartment={selectedDepartment}
                onDepartmentChange={(dept) => {
                  setSelectedDepartment(dept);
                  loadMonthlySummary(selectedYear, selectedMonth, dept);
                }}
                isLoading={isLoading}
                onExportExcel={handleExportExcel}
                isExporting={isExporting}
                onSelectEmployee={(userId) => {
                  setSelectedEmployeeId(userId);
                  setActiveTab('employee-timesheets');
                }}
              />
            )}

            {/* SUB-TAB 3: INDIVIDUAL EMPLOYEE TIMESHEETS */}
            {activeTab === 'employee-timesheets' && (
              <div className="space-y-4">
                <div className="p-3 bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-xs">
                  <div className="overflow-x-auto custom-scrollbar">
                    <div className="flex flex-nowrap items-center gap-1.5 py-0.5">
                      {directoryMembers.length === 0 ? (
                        <p className="text-xs text-zinc-400 py-1.5 px-1 whitespace-nowrap">No internal employees found.</p>
                      ) : (
                        directoryMembers.map((m) => {
                          const selected = m.id === selectedEmployeeId;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setSelectedEmployeeId(m.id)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 ${
                                selected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/20'
                                  : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-indigo-400'
                              }`}
                              title={m.department ? `${m.full_name} · ${m.department}` : m.full_name}
                            >
                              {selected && isLoadingTimesheet && (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              )}
                              {m.full_name || m.email}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {selectedEmployeeId ? (
                  <PersonalTimesheetTable
                    records={employeeTimesheet?.records || []}
                    summary={employeeTimesheet?.summary || null}
                    selectedYear={selectedYear}
                    selectedMonth={selectedMonth}
                    onYearMonthChange={handleYearMonthChange}
                    isLoading={isLoadingTimesheet}
                    readOnly
                    allowHistoryMonths
                    employeeId={selectedEmployeeId}
                    canInquireMissedPunch={isAdmin || isHR || isOperations}
                    employeeName={
                      employeeTimesheet?.employee_name ||
                      directoryMembers.find((m) => m.id === selectedEmployeeId)?.full_name
                    }
                  />
                ) : (
                  <div className="py-16 text-center text-zinc-400 text-sm">
                    No internal employees found to display.
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 4: APPROVALS & REQUESTS */}
            {activeTab === 'approvals' && (
              <ApprovalInboxSection
                requests={requests}
                isLoading={isLoading}
                onRefresh={loadRequests}
                canReview={isAdmin || isHR || isOperations}
              />
            )}
          </>
        ) : (
          /* VIEW TYPE B: EMPLOYEE ROLE (Team Leads & Team Members) */
          <>
            {/* SUB-TAB 1: PERSONAL MONTHLY TIMESHEET */}
            {employeeTab === 'timesheet' && (
              <PersonalTimesheetTable
                records={timesheetData?.records || []}
                summary={timesheetData?.summary || null}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                onYearMonthChange={handleYearMonthChange}
                isLoading={isLoading}
                onOpenRegularizationModal={(record) =>
                  handleOpenRequestModal('regularization', record)
                }
              />
            )}

            {/* SUB-TAB 2: MY SUBMITTED REQUESTS & APPEALS */}
            {employeeTab === 'requests' && (
              <ApprovalInboxSection
                requests={myRequests}
                isLoading={isLoading}
                onRefresh={loadRequests}
                canReview={false}
              />
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <RequestManagementModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSuccess={() => {
          loadRequests();
          if (!isManagementRole) {
            loadTimesheet(selectedYear, selectedMonth);
          }
        }}
        defaultTab={requestDefaultTab}
        initialRecord={initialRecordForReq}
      />

      <MissedCheckoutResponseModal
        isOpen={isResponseModalOpen}
        inquiry={selectedInquiry}
        onClose={() => {
          setIsResponseModalOpen(false);
          setSelectedInquiry(null);
        }}
        onSuccess={() => {
          loadPendingInquiries();
          loadTimesheet(selectedYear, selectedMonth);
        }}
      />
    </div>
  );
};
