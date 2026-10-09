import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Grid,
  BarChart3,
  Inbox,
  Download,
  FilePlus,
  RefreshCw,
  Calendar,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { attendanceService } from '../../services/attendanceService';
import { adminService } from '../../services/adminService';
import { getAttendanceMinDate } from '../../constants/attendance';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/button';
import { Callout } from '../ui/Callout';
import { cn } from '../../lib/utils';

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
import type { AttendanceSubSection } from '../../types/attendance';

export type AdminAttendanceSubTab =
  | 'daily-matrix'
  | 'punctuality-hub'
  | 'employee-timesheets'
  | 'approvals';

export type EmployeeAttendanceSubTab =
  | 'timesheet'
  | 'requests';

export interface AttendanceViewProps {
  activeSection?: AttendanceSubSection;
  onSectionChange?: (section: AttendanceSubSection) => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();

  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';

  // Category 1: Admin, HR, Operations have company-wide management suite
  const isManagementRole = isAdmin || isHR || isOperations;

  // Active Sub-Tab for Management
  const [activeTab, setActiveTab] = useState<AdminAttendanceSubTab>(() => {
    if (activeSection && ['daily-matrix', 'punctuality-hub', 'employee-timesheets', 'approvals'].includes(activeSection)) {
      return activeSection as AdminAttendanceSubTab;
    }
    return 'daily-matrix';
  });

  // Active Sub-Tab for Employee (Team Lead, Team Member)
  const [employeeTab, setEmployeeTab] = useState<EmployeeAttendanceSubTab>(() => {
    if (activeSection && ['timesheet', 'requests'].includes(activeSection)) {
      return activeSection as EmployeeAttendanceSubTab;
    }
    return 'timesheet';
  });

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

  // Loading States - If already in session cache, do not show full-page blocking loader!
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (isManagementRole) {
      return !attendanceService.getCachedDailyMatrix(getTodayIso(), 'All');
    }
    const d = new Date();
    return !attendanceService.getCachedMyTimesheet(d.getFullYear(), d.getMonth() + 1);
  });
  const [isLoadingTimesheet, setIsLoadingTimesheet] = useState<boolean>(false);
  const [isLoadingRequests, setIsLoadingRequests] = useState<boolean>(!attendanceService.getCachedRequests());
  useModuleLoadGate(isLoading);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Data States - Initialized immediately from session cache if returning from another module
  const [timesheetData, setTimesheetData] = useState<PersonalTimesheetResponse | null>(() => {
    const d = new Date();
    return attendanceService.getCachedMyTimesheet(d.getFullYear(), d.getMonth() + 1)?.data || null;
  });
  const [matrixData, setMatrixData] = useState<DailyMatrixResponse | null>(() => {
    return attendanceService.getCachedDailyMatrix(getTodayIso(), 'All')?.data || null;
  });
  const [monthlySummaryData, setMonthlySummaryData] = useState<MonthlyPunctualityResponse | null>(() => {
    const d = new Date();
    return attendanceService.getCachedMonthlySummary(d.getFullYear(), d.getMonth() + 1, 'All')?.data || null;
  });
  const [requests, setRequests] = useState<AttendanceRequest[]>(() => {
    return attendanceService.getCachedRequests()?.data || [];
  });
  const [directoryMembers, setDirectoryMembers] = useState<AdminMember[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [employeeTimesheet, setEmployeeTimesheet] = useState<PersonalTimesheetResponse | null>(null);
  const timesheetAbortRef = useRef<AbortController | null>(null);
  const timesheetReqIdRef = useRef(0);
  const matrixAbortRef = useRef<AbortController | null>(null);
  const matrixReqIdRef = useRef(0);
  const [isLoadingMatrix, setIsLoadingMatrix] = useState<boolean>(false);
  const monthlySummaryAbortRef = useRef<AbortController | null>(null);
  const monthlySummaryReqIdRef = useRef(0);
  const [isLoadingMonthlySummary, setIsLoadingMonthlySummary] = useState<boolean>(false);

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

  const loadTimesheet = useCallback(async (y: number, m: number, forceRefresh = false) => {
    const cached = attendanceService.getCachedMyTimesheet(y, m);

    if (cached && !forceRefresh) {
      setTimesheetData(cached.data);

      const now = new Date();
      const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
      const isExpired = Date.now() - cached.fetchedAt > 120_000;
      if (!isCurrentMonth || !isExpired) {
        return;
      }
    }

    try {
      const data = await attendanceService.getMyTimesheet(y, m);
      if (data) {
        attendanceService.setCachedMyTimesheet(y, m, data);
        setTimesheetData(data);
      }
    } catch (err: any) {
      console.error('Failed to load timesheet:', err);
    }
  }, []);

  const loadMatrix = useCallback(async (date: string, dept?: string, forceRefresh = false) => {
    const cached = attendanceService.getCachedDailyMatrix(date, dept);

    if (cached && !forceRefresh) {
      setMatrixData(cached.data);
      setIsLoadingMatrix(false);

      const todayIso = getTodayIso();
      const isToday = date === todayIso;
      const isExpired = Date.now() - cached.fetchedAt > 120_000;
      if (!isToday || !isExpired) {
        return;
      }
    } else if (!cached) {
      setIsLoadingMatrix(true);
    }

    matrixAbortRef.current?.abort();
    const controller = new AbortController();
    matrixAbortRef.current = controller;
    const reqId = ++matrixReqIdRef.current;

    try {
      const data = await attendanceService.getDailyMatrix(date, dept, { signal: controller.signal });
      if (reqId !== matrixReqIdRef.current) return;
      if (data) {
        attendanceService.setCachedDailyMatrix(date, data, dept);
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

  const loadMonthlySummary = useCallback(
    async (y: number, m: number, dept?: string, forceRefresh = false) => {
      const cached = attendanceService.getCachedMonthlySummary(y, m, dept);

      if (cached && !forceRefresh) {
        setMonthlySummaryData(cached.data);
        setIsLoadingMonthlySummary(false);

        // SWR: Only revalidate in background if it's the current month and data is older than 2 minutes
        const now = new Date();
        const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
        const isExpired = Date.now() - cached.fetchedAt > 120_000;
        if (!isCurrentMonth || !isExpired) {
          return;
        }
      } else if (!cached) {
        setIsLoadingMonthlySummary(true);
      }

      monthlySummaryAbortRef.current?.abort();
      const controller = new AbortController();
      monthlySummaryAbortRef.current = controller;
      const reqId = ++monthlySummaryReqIdRef.current;

      try {
        const data = await attendanceService.getMonthlySummary(y, m, dept, { signal: controller.signal });
        if (reqId !== monthlySummaryReqIdRef.current) return;
        if (data && data.year === y && data.month === m) {
          attendanceService.setCachedMonthlySummary(y, m, data, dept);
          setMonthlySummaryData(data);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.status === 499) return;
        if (reqId !== monthlySummaryReqIdRef.current) return;
        console.error('Failed to load monthly punctuality summary:', err);
      } finally {
        if (reqId === monthlySummaryReqIdRef.current) {
          setIsLoadingMonthlySummary(false);
        }
      }
    },
    []
  );

  const loadRequests = useCallback(async (forceRefresh = false) => {
    const cached = attendanceService.getCachedRequests();
    if (cached && !forceRefresh) {
      setRequests(cached.data);
      if (Date.now() - cached.fetchedAt < 60_000) return;
    }
    setIsLoadingRequests(true);
    try {
      const data = await attendanceService.getRequests();
      setRequests(data || []);
    } catch (err: any) {
      console.error('Failed to load attendance requests:', err);
    } finally {
      setIsLoadingRequests(false);
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

  const loadEmployeeTimesheet = useCallback(async (userId: string, y: number, m: number, forceRefresh = false) => {
    if (!userId) {
      setEmployeeTimesheet(null);
      setIsLoadingTimesheet(false);
      return;
    }

    const cached = attendanceService.getCachedEmployeeTimesheet(userId, y, m);

    if (cached && !forceRefresh) {
      setEmployeeTimesheet(cached.data);
      setIsLoadingTimesheet(false);

      const now = new Date();
      const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
      const isExpired = Date.now() - cached.fetchedAt > 120_000;
      if (!isCurrentMonth || !isExpired) {
        return;
      }
    } else if (!cached) {
      setIsLoadingTimesheet(true);
      setEmployeeTimesheet(null);
    }

    timesheetAbortRef.current?.abort();
    const controller = new AbortController();
    timesheetAbortRef.current = controller;
    const reqId = ++timesheetReqIdRef.current;

    try {
      const data = await attendanceService.getEmployeeTimesheet(userId, y, m, { signal: controller.signal });
      if (reqId !== timesheetReqIdRef.current) return;
      if (data) {
        attendanceService.setCachedEmployeeTimesheet(userId, y, m, data);
        setEmployeeTimesheet(data);
      }
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

  // User-initiated manual refresh trigger (clears all caches and forces fresh fetch)
  const handleRefreshAll = useCallback(async () => {
    attendanceService.clearAllCaches();
    setIsLoading(true);
    try {
      if (isManagementRole) {
        if (activeTab === 'punctuality-hub') {
          await loadMonthlySummary(
            selectedYear,
            selectedMonth,
            selectedDepartment !== 'All' ? selectedDepartment : undefined,
            true
          );
        } else if (activeTab === 'employee-timesheets' && selectedEmployeeId) {
          await loadEmployeeTimesheet(selectedEmployeeId, selectedYear, selectedMonth, true);
        } else {
          await loadMatrix(
            matrixDate,
            selectedDepartment !== 'All' ? selectedDepartment : undefined,
            true
          );
        }
        await Promise.allSettled([
          loadRequests(),
          loadDirectoryMembers(),
          loadPendingInquiries(),
        ]);
      } else {
        await Promise.allSettled([
          loadTimesheet(selectedYear, selectedMonth, true),
          loadRequests(),
          loadPendingInquiries(),
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    isManagementRole,
    activeTab,
    selectedEmployeeId,
    loadTimesheet,
    loadMatrix,
    loadMonthlySummary,
    loadEmployeeTimesheet,
    loadRequests,
    loadDirectoryMembers,
    loadPendingInquiries,
    selectedYear,
    selectedMonth,
    selectedDepartment,
    matrixDate,
  ]);

  // Initial load on mount - Cache-first (NEVER clears cache on mount!)
  useEffect(() => {
    const init = async () => {
      try {
        if (isManagementRole) {
          const cachedMatrix = attendanceService.getCachedDailyMatrix(
            matrixDate,
            selectedDepartment !== 'All' ? selectedDepartment : undefined
          );
          if (cachedMatrix) {
            setMatrixData(cachedMatrix.data);
            setIsLoading(false);
          } else {
            setIsLoading(true);
          }

          await Promise.allSettled([
            loadMatrix(
              matrixDate,
              selectedDepartment !== 'All' ? selectedDepartment : undefined,
              false
            ),
            loadPendingInquiries(),
          ]);
          setIsLoading(false);

          void Promise.allSettled([
            loadRequests(),
            loadDirectoryMembers(),
          ]);
        } else {
          const cachedTs = attendanceService.getCachedMyTimesheet(selectedYear, selectedMonth);
          if (cachedTs) {
            setTimesheetData(cachedTs.data);
            setIsLoading(false);
          } else {
            setIsLoading(true);
          }

          await Promise.allSettled([
            loadTimesheet(selectedYear, selectedMonth, false),
            loadRequests(),
            loadPendingInquiries(),
          ]);
          setIsLoading(false);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void init();
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

    const cached = attendanceService.getCachedEmployeeTimesheet(selectedEmployeeId, selectedYear, selectedMonth);
    if (cached) {
      setEmployeeTimesheet(cached.data);
      setIsLoadingTimesheet(false);

      const now = new Date();
      const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;
      const isExpired = Date.now() - cached.fetchedAt > 120_000;
      if (!isCurrentMonth || !isExpired) {
        return;
      }
    } else {
      setIsLoadingTimesheet(true);
      setEmployeeTimesheet(null);
    }

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

  // Debounced load for Punctuality Command Center
  useEffect(() => {
    if (!isManagementRole) return;
    if (activeTab !== 'punctuality-hub') return;

    const deptMatch =
      selectedDepartment === 'All'
        ? !monthlySummaryData?.department || monthlySummaryData.department === 'All'
        : monthlySummaryData?.department === selectedDepartment;

    if (
      monthlySummaryData &&
      monthlySummaryData.year === selectedYear &&
      monthlySummaryData.month === selectedMonth &&
      deptMatch
    ) {
      return;
    }

    const cached = attendanceService.getCachedMonthlySummary(selectedYear, selectedMonth, selectedDepartment);

    if (cached) {
      setMonthlySummaryData(cached.data);
      setIsLoadingMonthlySummary(false);

      const now = new Date();
      const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;
      const isExpired = Date.now() - cached.fetchedAt > 120_000;
      if (!isCurrentMonth || !isExpired) {
        return;
      }
    } else {
      setIsLoadingMonthlySummary(true);
    }

    const timer = window.setTimeout(() => {
      void loadMonthlySummary(
        selectedYear,
        selectedMonth,
        selectedDepartment !== 'All' ? selectedDepartment : undefined
      );
    }, cached ? 1000 : 50);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    isManagementRole,
    activeTab,
    selectedYear,
    selectedMonth,
    selectedDepartment,
    loadMonthlySummary,
    monthlySummaryData,
  ]);

  // Load requests when navigating to Approvals / Requests tab
  useEffect(() => {
    if ((isManagementRole && activeTab === 'approvals') || (!isManagementRole && employeeTab === 'requests')) {
      void loadRequests();
    }
  }, [isManagementRole, activeTab, employeeTab, loadRequests]);

  // Clean up abort controllers on unmount
  useEffect(() => {
    return () => {
      matrixAbortRef.current?.abort();
      timesheetAbortRef.current?.abort();
      monthlySummaryAbortRef.current?.abort();
    };
  }, []);

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

    if (isManagementRole && activeTab === 'punctuality-hub') {
      const cached = attendanceService.getCachedMonthlySummary(nextYear, nextMonth, selectedDepartment);
      if (cached) {
        setMonthlySummaryData(cached.data);
        setIsLoadingMonthlySummary(false);
      }
    } else if (isManagementRole && activeTab === 'employee-timesheets' && selectedEmployeeId) {
      const cached = attendanceService.getCachedEmployeeTimesheet(selectedEmployeeId, nextYear, nextMonth);
      if (cached) {
        setEmployeeTimesheet(cached.data);
        setIsLoadingTimesheet(false);
      }
    } else if (!isManagementRole) {
      const cached = attendanceService.getCachedMyTimesheet(nextYear, nextMonth);
      if (cached) {
        setTimesheetData(cached.data);
      }
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
      addToast('Preparing export…', 'Building multi-tab workbook with company summary & employee timesheets...', 'info');

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

      addToast('Export downloaded', 'Excel workbook downloaded successfully.', 'success');
    } catch (err: any) {
      console.error('Export failed:', err);
      addToast('Export Failed', err.message || 'Could not generate Excel file.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectManagementTab = useCallback(
    (tab: AdminAttendanceSubTab) => {
      setActiveTab(tab);
      onSectionChange?.(tab);
      if (tab === 'daily-matrix') {
        const cached = attendanceService.getCachedDailyMatrix(
          matrixDate,
          selectedDepartment !== 'All' ? selectedDepartment : undefined
        );
        if (cached) {
          setMatrixData(cached.data);
          setIsLoadingMatrix(false);
        }
      } else if (tab === 'punctuality-hub') {
        const cached = attendanceService.getCachedMonthlySummary(
          selectedYear,
          selectedMonth,
          selectedDepartment !== 'All' ? selectedDepartment : undefined
        );
        if (cached) {
          setMonthlySummaryData(cached.data);
          setIsLoadingMonthlySummary(false);
        }
      } else if (tab === 'employee-timesheets') {
        if (selectedEmployeeId) {
          const cached = attendanceService.getCachedEmployeeTimesheet(
            selectedEmployeeId,
            selectedYear,
            selectedMonth
          );
          if (cached) {
            setEmployeeTimesheet(cached.data);
            setIsLoadingTimesheet(false);
          }
        }
      }
    },
    [matrixDate, selectedDepartment, selectedYear, selectedMonth, selectedEmployeeId, onSectionChange]
  );

  const handleSelectEmployeeTab = useCallback(
    (tab: EmployeeAttendanceSubTab) => {
      setEmployeeTab(tab);
      onSectionChange?.(tab);
    },
    [onSectionChange]
  );

  useEffect(() => {
    if (!activeSection) return;
    if (isManagementRole) {
      if (['daily-matrix', 'punctuality-hub', 'employee-timesheets', 'approvals'].includes(activeSection)) {
        handleSelectManagementTab(activeSection as AdminAttendanceSubTab);
      }
    } else {
      if (['timesheet', 'requests'].includes(activeSection)) {
        handleSelectEmployeeTab(activeSection as EmployeeAttendanceSubTab);
      }
    }
  }, [activeSection, isManagementRole, handleSelectManagementTab, handleSelectEmployeeTab]);

  // Filter requests for non-admin to show only their own requests
  const myRequests = useMemo(() => {
    if (isManagementRole) return requests;
    return requests.filter((r) => r.user_id === user?.id);
  }, [requests, isManagementRole, user?.id]);

  const pendingRequestsCount = useMemo(() => {
    return requests.filter((r) => r.status === 'pending').length;
  }, [requests]);

  const sectionDescription = useMemo(() => {
    if (isManagementRole) {
      switch (activeTab) {
        case 'daily-matrix':
          return "Who's in today and how the day is going.";
        case 'punctuality-hub':
          return 'Monthly lateness, absences and hours by person.';
        case 'employee-timesheets':
          return 'Daily punches for any team member.';
        case 'approvals':
          return 'Leave, WFH and adjustment requests.';
        default:
          return 'Company-wide attendance and punctuality records.';
      }
    } else {
      switch (employeeTab) {
        case 'timesheet':
          return 'Your punches and hours this month.';
        case 'requests':
          return 'Leave, WFH and time adjustments.';
        default:
          return 'Your personal attendance records.';
      }
    }
  }, [isManagementRole, activeTab, employeeTab]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 bg-canvas attendance-view">
      {/* ── Page Header & Navigation Tabs ───────────────────────────── */}
      <div className="bg-surface border-b border-border shrink-0 px-4 sm:px-6 lg:px-8 pt-5">
        <PageHeader
          title="Attendance"
          description={sectionDescription}
          actions={
            <>
              <Button
                variant="secondary"
                size="md"
                onClick={handleRefreshAll}
                loading={isLoading}
                icon={RefreshCw}
                aria-label="Refresh attendance data"
              >
                Refresh
              </Button>
              {isManagementRole ? (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleExportExcel}
                  loading={isExporting}
                  icon={Download}
                  aria-label="Export attendance Excel workbook"
                >
                  Export
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleOpenRequestModal('leave')}
                  icon={FilePlus}
                  aria-label="Submit new leave or regularization request"
                >
                  New request
                </Button>
              )}
            </>
          }
        >
          {/* Section Tabs */}
          <div className="flex gap-6 overflow-x-auto -mb-px">
            {isManagementRole ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSelectManagementTab('daily-matrix')}
                  className={cn(
                    'h-10 inline-flex items-center gap-2 border-b-2 text-ui transition-colors cursor-pointer',
                    activeTab === 'daily-matrix'
                      ? 'border-accent text-fg font-medium'
                      : 'border-transparent text-fg-muted hover:text-fg font-normal'
                  )}
                >
                  <Grid className="w-4 h-4" />
                  <span>Daily attendance</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectManagementTab('punctuality-hub')}
                  className={cn(
                    'h-10 inline-flex items-center gap-2 border-b-2 text-ui transition-colors cursor-pointer',
                    activeTab === 'punctuality-hub'
                      ? 'border-accent text-fg font-medium'
                      : 'border-transparent text-fg-muted hover:text-fg font-normal'
                  )}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Punctuality reports</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectManagementTab('employee-timesheets')}
                  className={cn(
                    'h-10 inline-flex items-center gap-2 border-b-2 text-ui transition-colors cursor-pointer',
                    activeTab === 'employee-timesheets'
                      ? 'border-accent text-fg font-medium'
                      : 'border-transparent text-fg-muted hover:text-fg font-normal'
                  )}
                >
                  <Users className="w-4 h-4" />
                  <span>Timesheets</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectManagementTab('approvals')}
                  className={cn(
                    'h-10 inline-flex items-center gap-2 border-b-2 text-ui transition-colors cursor-pointer',
                    activeTab === 'approvals'
                      ? 'border-accent text-fg font-medium'
                      : 'border-transparent text-fg-muted hover:text-fg font-normal'
                  )}
                >
                  <Inbox className="w-4 h-4" />
                  <span>Approvals</span>
                  {pendingRequestsCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-micro font-medium bg-accent-soft-2 text-accent-text font-numeric">
                      {pendingRequestsCount}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleSelectEmployeeTab('timesheet')}
                  className={cn(
                    'h-10 inline-flex items-center gap-2 border-b-2 text-ui transition-colors cursor-pointer',
                    employeeTab === 'timesheet'
                      ? 'border-accent text-fg font-medium'
                      : 'border-transparent text-fg-muted hover:text-fg font-normal'
                  )}
                >
                  <Calendar className="w-4 h-4" />
                  <span>My timesheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectEmployeeTab('requests')}
                  className={cn(
                    'h-10 inline-flex items-center gap-2 border-b-2 text-ui transition-colors cursor-pointer',
                    employeeTab === 'requests'
                      ? 'border-accent text-fg font-medium'
                      : 'border-transparent text-fg-muted hover:text-fg font-normal'
                  )}
                >
                  <Inbox className="w-4 h-4" />
                  <span>My requests</span>
                  {myRequests.filter((r) => r.status === 'pending').length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-micro font-medium bg-accent-soft-2 text-accent-text font-numeric">
                      {myRequests.filter((r) => r.status === 'pending').length}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        </PageHeader>
      </div>

      {/* ── Scrollable Body ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Actionable Missed Punch Inquiry Banner */}
        {pendingInquiries.length > 0 && (
          <Callout
            variant="warning"
            title={`Action required: Missed checkout inquiry (${pendingInquiries.length})`}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedInquiry(pendingInquiries[0]);
                  setIsResponseModalOpen(true);
                }}
              >
                Submit checkout
              </Button>
            }
          >
            HR requested your check-out time for{' '}
            <strong className="font-numeric font-medium">
              {pendingInquiries.map((i) => i.date).join(', ')}
            </strong>
            . Submit your check-out time and reason to regularize the shift.
          </Callout>
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
                  const cached = attendanceService.getCachedDailyMatrix(d, selectedDepartment);
                  if (cached) {
                    setMatrixData(cached.data);
                    setIsLoadingMatrix(false);
                  }
                  loadMatrix(d, selectedDepartment);
                }}
                selectedDepartment={selectedDepartment}
                onDepartmentChange={(dept) => {
                  setSelectedDepartment(dept);
                  const cached = attendanceService.getCachedDailyMatrix(matrixDate, dept);
                  if (cached) {
                    setMatrixData(cached.data);
                    setIsLoadingMatrix(false);
                  }
                  loadMatrix(matrixDate, dept);
                }}
                isLoading={isLoading || isLoadingMatrix}
                onRefresh={() => loadMatrix(matrixDate, selectedDepartment, true)}
                canEditOverride={isAdmin || isHR || isOperations || user?.role === 'team_lead'}
                minDate={attendanceMinDate}
                onSelectEmployee={(userId) => {
                  setSelectedEmployeeId(userId);
                  const [y, m] = matrixDate.split('-').map(Number);
                  if (y) setSelectedYear(y);
                  if (m) setSelectedMonth(m);
                  const targetYear = y || selectedYear;
                  const targetMonth = m || selectedMonth;
                  const cached = attendanceService.getCachedEmployeeTimesheet(userId, targetYear, targetMonth);
                  if (cached) {
                    setEmployeeTimesheet(cached.data);
                    setIsLoadingTimesheet(false);
                  }
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
                  const cached = attendanceService.getCachedMonthlySummary(selectedYear, selectedMonth, dept);
                  if (cached) {
                    setMonthlySummaryData(cached.data);
                    setIsLoadingMonthlySummary(false);
                  }
                }}
                isLoading={isLoadingMonthlySummary}
                onExportExcel={handleExportExcel}
                isExporting={isExporting}
                onSelectEmployee={(userId) => {
                  setSelectedEmployeeId(userId);
                  const cached = attendanceService.getCachedEmployeeTimesheet(userId, selectedYear, selectedMonth);
                  if (cached) {
                    setEmployeeTimesheet(cached.data);
                    setIsLoadingTimesheet(false);
                  }
                  setActiveTab('employee-timesheets');
                }}
              />
            )}

            {/* SUB-TAB 3: INDIVIDUAL EMPLOYEE TIMESHEETS */}
            {activeTab === 'employee-timesheets' && (
              <div className="space-y-4">
                <div className="p-3 bg-surface rounded-xl border border-border shadow-xs">
                  <div className="overflow-x-auto custom-scrollbar">
                    <div className="flex flex-nowrap items-center gap-1.5 py-0.5">
                      {directoryMembers.length === 0 ? (
                        <p className="text-xs text-fg-muted py-1.5 px-1 whitespace-nowrap">No internal employees found.</p>
                      ) : (
                        directoryMembers.map((m) => {
                          const selected = m.id === selectedEmployeeId;
                          return (
                            <Button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSelectedEmployeeId(m.id);
                                const cached = attendanceService.getCachedEmployeeTimesheet(m.id, selectedYear, selectedMonth);
                                if (cached) {
                                  setEmployeeTimesheet(cached.data);
                                  setIsLoadingTimesheet(false);
                                }
                              }}
                              variant={selected ? 'primary' : 'secondary'}
                              size="sm"
                              className="shrink-0"
                              title={m.department ? `${m.full_name} · ${m.department}` : m.full_name}
                              loading={selected && isLoadingTimesheet}
                            >
                              {m.full_name || m.email}
                            </Button>
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
                    joiningDate={
                      directoryMembers.find((m) => m.id === selectedEmployeeId)?.joining_date
                    }
                    canInquireMissedPunch={isAdmin || isHR || isOperations}
                    employeeName={
                      employeeTimesheet?.employee_name ||
                      directoryMembers.find((m) => m.id === selectedEmployeeId)?.full_name
                    }
                  />
                ) : (
                  <div className="py-16 text-center text-fg-muted text-sm">
                    No internal employees found to display.
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 4: APPROVALS & REQUESTS */}
            {activeTab === 'approvals' && (
              <ApprovalInboxSection
                requests={requests}
                isLoading={isLoading || isLoadingRequests}
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
                allowHistoryMonths
                joiningDate={user?.joining_date}
                onOpenRegularizationModal={(record) =>
                  handleOpenRequestModal('regularization', record)
                }
              />
            )}

            {/* SUB-TAB 2: MY SUBMITTED REQUESTS & APPEALS */}
            {employeeTab === 'requests' && (
              <ApprovalInboxSection
                requests={myRequests}
                isLoading={isLoading || isLoadingRequests}
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

