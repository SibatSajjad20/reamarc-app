import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Grid,
  BarChart3,
  Inbox,
  Download,
  FilePlus,
  RefreshCw,
  Clock,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { attendanceService } from '../../services/attendanceService';
import { exportMonthlyAttendanceWorkbook } from '../../utils/excelExport';

import type {
  PersonalTimesheetResponse,
  DailyMatrixResponse,
  MonthlyPunctualityResponse,
  AttendanceRequest,
  RequestType,
  AttendanceRecord,
} from '../../types/attendance';

import { PersonalTimesheetTable } from '../attendance/PersonalTimesheetTable';
import { DailyAttendanceMatrix } from '../attendance/DailyAttendanceMatrix';
import { MonthlyPunctualityCommandCenter } from '../attendance/MonthlyPunctualityCommandCenter';
import { RequestManagementModal } from '../attendance/RequestManagementModal';
import { ApprovalInboxSection } from '../attendance/ApprovalInboxSection';

type AdminAttendanceSubTab =
  | 'daily-matrix'
  | 'punctuality-hub'
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
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');

  // Loading States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Data States
  const [timesheetData, setTimesheetData] = useState<PersonalTimesheetResponse | null>(null);
  const [matrixData, setMatrixData] = useState<DailyMatrixResponse | null>(null);
  const [monthlySummaryData, setMonthlySummaryData] = useState<MonthlyPunctualityResponse | null>(null);
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);

  // Modal States
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestDefaultTab, setRequestDefaultTab] = useState<RequestType>('leave');
  const [initialRecordForReq, setInitialRecordForReq] = useState<AttendanceRecord | null>(null);

  // ==========================================
  // DATA FETCHING & ORCHESTRATION
  // ==========================================

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

  const loadMatrix = useCallback(async (date: string) => {
    try {
      const data = await attendanceService.getDailyMatrix(date);
      if (data) {
        setMatrixData(data);
      }
    } catch (err: any) {
      console.error('Failed to load daily attendance matrix:', err);
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

  // Main refresh trigger
  const handleRefreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isManagementRole) {
        await Promise.allSettled([
          loadMatrix(matrixDate),
          loadMonthlySummary(selectedYear, selectedMonth),
          loadRequests(),
        ]);
      } else {
        await Promise.allSettled([
          loadTimesheet(selectedYear, selectedMonth),
          loadRequests(),
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
    selectedYear,
    selectedMonth,
    matrixDate,
  ]);

  // Initial load on mount
  useEffect(() => {
    handleRefreshAll();
  }, [isManagementRole]);

  // Year / Month Change Handler
  const handleYearMonthChange = (year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    if (isManagementRole) {
      loadMonthlySummary(year, month);
    } else {
      loadTimesheet(year, month);
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
      addToast('Generating Excel Workbook 📊', 'Building multi-tab workbook with company summary & employee sheets...', 'info');

      let summaryRows = monthlySummaryData?.rows || [];
      let summaryStats = monthlySummaryData?.summary;

      if (!summaryStats) {
        summaryStats = {
          average_punctuality_percent: 100,
          total_overtime_formatted: '+00:00',
          total_undertime_formatted: '-00:00',
          total_late_strikes: 0,
          bonus_eligible_count: 0,
          total_employees: summaryRows.length,
        };
      }

      await exportMonthlyAttendanceWorkbook({
        year: selectedYear,
        month: selectedMonth,
        summaryRows,
        summaryStats,
      });

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

            {/* Tab 3: Approvals & Requests */}
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
                  loadMatrix(d);
                }}
                selectedDepartment={selectedDepartment}
                onDepartmentChange={setSelectedDepartment}
                isLoading={isLoading}
                onRefresh={() => loadMatrix(matrixDate)}
                canEditOverride={isAdmin || isHR || isOperations || user?.role === 'team_lead'}
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
              />
            )}

            {/* SUB-TAB 3: APPROVALS & REQUESTS */}
            {activeTab === 'approvals' && (
              <ApprovalInboxSection
                requests={requests}
                isLoading={isLoading}
                onRefresh={loadRequests}
                canReview={isAdmin || isHR}
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
    </div>
  );
};
