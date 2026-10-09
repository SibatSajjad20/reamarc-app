/**
 * Employee Command Center Dashboard View.
 * Displays real-time KPIs, team hours chart, attendance records,
 * and department-specific modules categorized by user role & department.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ViewType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { attendanceService } from '../../services/attendanceService';
import { dailyLogService } from '../../services/dailyLogService';
import { crmService } from '../../services/crmService';
import { websiteProjectService } from '../../services/websiteProjectService';
import { contentCalendarService } from '../../services/contentCalendarService';
import { marketingService } from '../../services/marketingService';
import { apiClient } from '../../services/apiClient';

import type {
  TodayAttendanceResponse,
  PersonalTimesheetResponse,
  RequestType,
  DailyMatrixResponse,
  AttendanceRequest,
} from '../../types/attendance';
import type { DailyLogEntry } from '../../types/dailyLog';
import type { CrmCounts, CrmLead } from '../../types/crm';
import type { WebsiteProject, WebsiteSummaryMetrics } from '../../types/websiteProject';
import type { ContentCalendarListResponse, PipelineStage } from '../../types/contentCalendar';
import type { MarketingMatrixRow } from '../../types';

import { RequestManagementModal } from '../attendance/RequestManagementModal';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/button';
import { StatusPill } from '../ui/StatusPill';
import { SegmentedControl } from '../ui/SegmentedControl';
import { DashboardSkeleton } from '../ui/Skeletons';
import { Skeleton } from '../ui/skeleton';
import { useToast } from '../../context/ToastContext';

import {
  Clock,
  CalendarCheck,
  CalendarDays,
  Users,
  Briefcase,
  FilePlus,
  Plus,
  ArrowRight,
  LogOut,
  LogIn,
  Inbox,
  FileText,
  Phone,
  Globe,
  Share2,
  AlertTriangle,
  Megaphone,
} from 'lucide-react';
import { formatHours } from '../../utils/logTimeChecks';
import { useOffDays } from '../../hooks/useOffDays';

interface DashboardViewProps {
  onNavigateView: (view: ViewType) => void;
}

export type DepartmentCategory = 'sales' | 'website' | 'content' | 'marketing' | 'hr' | 'ai' | 'general';

export function getDepartmentCategory(user?: any): DepartmentCategory {
  if (!user) return 'general';
  const role = (user.role || '').toLowerCase().trim();
  const dept = (user.department || '').toLowerCase().trim();
  const depts: string[] = Array.isArray(user.departments)
    ? user.departments.map((d: string) => (d || '').toLowerCase().trim())
    : [];
  const all = [dept, ...depts].filter(Boolean);

  if (role === 'hr' || all.some((d) => d === 'hr')) return 'hr';
  if (all.some((d) => d === 'sales')) return 'sales';
  if (all.some((d) => d === 'ai' || d.includes('ai') || d.includes('artificial'))) return 'ai';
  if (all.some((d) => d.includes('web') || d.includes('software') || d.includes('dev'))) return 'website';
  if (all.some((d) => d.includes('content') || d.includes('creative') || d.includes('social'))) return 'content';
  if (all.some((d) => d.includes('marketing') || d.includes('seo'))) return 'marketing';

  if (role === 'admin' || role === 'operations') return 'sales';
  return 'general';
}

function getRelativeTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

interface ActivityItem {
  id: string;
  title: string;
  body: string;
  kind?: string;
  created_at?: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateView }) => {
  const { user } = useAuth();
  const { addToast } = useToast();

  // Date calculations
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  // Current week Monday
  const mondayIso = useMemo(() => {
    const d = new Date(today);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  }, [today]);

  // Previous week Monday and Sunday
  const lastWeekMondayIso = useMemo(() => {
    const d = new Date(today);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) - 7;
    d.setDate(diff);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  }, [today]);

  const lastWeekSundayIso = useMemo(() => {
    const d = new Date(today);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) - 1;
    d.setDate(diff);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  }, [today]);

  const { getOffDay } = useOffDays();
  const todayOff = getOffDay(todayIso);

  // Cached states
  const cachedAttendance = attendanceService.getCachedTodayStatus();
  const cachedTimesheet = attendanceService.getCachedMyTimesheet(today.getFullYear(), today.getMonth() + 1);

  // Loading States
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(!cachedAttendance);
  const [, setIsLoadingTimesheet] = useState(!cachedTimesheet);
  const [, setIsLoadingDailyLog] = useState(false);
  useModuleLoadGate(isLoadingAttendance);

  // Data States
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendanceResponse | null>(
    () => cachedAttendance?.data || null
  );
  const [personalTimesheet, setPersonalTimesheet] = useState<PersonalTimesheetResponse | null>(
    () => cachedTimesheet?.data || null
  );
  const [dailyMatrix, setDailyMatrix] = useState<DailyMatrixResponse | null>(null);
  const [logEntries, setLogEntries] = useState<DailyLogEntry[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);

  // Department-specific data states
  const [crmCounts, setCrmCounts] = useState<CrmCounts | null>(null);
  const [crmLeads, setCrmLeads] = useState<CrmLead[]>([]);
  const [websiteMetrics, setWebsiteMetrics] = useState<WebsiteSummaryMetrics | null>(null);
  const [websiteProjects, setWebsiteProjects] = useState<WebsiteProject[]>([]);
  const [contentData, setContentData] = useState<ContentCalendarListResponse | null>(null);
  const [marketingRows, setMarketingRows] = useState<MarketingMatrixRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AttendanceRequest[]>([]);

  // Request Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestModalTab, setRequestModalTab] = useState<RequestType>('leave');

  // Chart range
  const [chartRange, setChartRange] = useState<string>('14D');

  // Role & Department Categorization
  const isAdmin = user?.role === 'admin';
  const isOperations = user?.role === 'operations';
  const isAdminOrOps = isAdmin || isOperations;

  const userDefaultCategory = useMemo(() => getDepartmentCategory(user), [user]);
  const [selectedCategory, setSelectedCategory] = useState<DepartmentCategory>(userDefaultCategory);

  useEffect(() => {
    setSelectedCategory(userDefaultCategory);
  }, [userDefaultCategory]);

  const activeCategory = isAdminOrOps ? selectedCategory : userDefaultCategory;
  const hasDepartmentModule = isAdminOrOps || ['sales', 'website', 'content', 'marketing', 'hr'].includes(activeCategory);

  // 1. Load Attendance & Timesheet
  const loadAttendance = useCallback(async () => {
    setIsLoadingAttendance(true);
    setIsLoadingTimesheet(true);

    const todayPromise = attendanceService
      .getTodayStatus()
      .then((data) => {
        if (data) setTodayAttendance(data);
      })
      .catch((err) => {
        console.error('Failed to load dashboard attendance:', err);
      })
      .finally(() => {
        setIsLoadingAttendance(false);
      });

    const timesheetPromise = attendanceService
      .getMyTimesheet(today.getFullYear(), today.getMonth() + 1)
      .then((data) => {
        if (data) setPersonalTimesheet(data);
      })
      .catch((err) => {
        console.error('Failed to load dashboard timesheet:', err);
      })
      .finally(() => {
        setIsLoadingTimesheet(false);
      });

    const matrixPromise = attendanceService
      .getDailyMatrix(todayIso)
      .then((data) => {
        if (data) setDailyMatrix(data);
      })
      .catch(() => {
        // Management-only endpoint may 403 for general team member
        setDailyMatrix(null);
      });

    await Promise.allSettled([todayPromise, timesheetPromise, matrixPromise]);
  }, [today, todayIso]);

  // 2. Load Daily Logs for range
  const rangeStartIso = useMemo(() => {
    const numDays = chartRange === '7D' ? 7 : chartRange === '14D' ? 14 : 30;
    const d = new Date(today);
    d.setDate(d.getDate() - numDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    const calcStart = `${y}-${m}-${dayStr}`;
    return calcStart < lastWeekMondayIso ? calcStart : lastWeekMondayIso;
  }, [today, chartRange, lastWeekMondayIso]);

  const loadDailyLogs = useCallback(async () => {
    if (isOperations) return;
    setIsLoadingDailyLog(true);

    try {
      const entries = await dailyLogService.getEntries({
        start_date: rangeStartIso,
        end_date: todayIso,
        user_id: user?.id,
        limit: 500,
      });
      setLogEntries(entries || []);
    } catch (err) {
      console.error('Failed to load dashboard daily log entries:', err);
    } finally {
      setIsLoadingDailyLog(false);
    }
  }, [rangeStartIso, todayIso, user?.id, isOperations]);

  // 3. Load Department Specific Data & Activities
  const loadDepartmentData = useCallback(async () => {
    // Recent activity notifications
    try {
      const notifs = await apiClient.get<ActivityItem[]>('/mobile/notifications?limit=5');
      if (Array.isArray(notifs)) setRecentActivities(notifs);
    } catch {
      // non-blocking
    }

    // Sales data
    if (activeCategory === 'sales' || isAdminOrOps) {
      try {
        const [counts, leadsRes] = await Promise.all([
          crmService.getCounts().catch(() => null),
          crmService.listLeads({ limit: 100 }).catch(() => ({ items: [], total: 0 })),
        ]);
        if (counts) setCrmCounts(counts);
        if (leadsRes?.items) setCrmLeads(leadsRes.items);
      } catch {
        // non-blocking
      }
    }

    // Website data
    if (activeCategory === 'website' || isAdminOrOps) {
      try {
        const [metrics, projectsRes] = await Promise.all([
          websiteProjectService.getSummaryMetrics().catch(() => null),
          websiteProjectService.getProjects().catch(() => ({ items: [], total: 0 })),
        ]);
        if (metrics) setWebsiteMetrics(metrics);
        if (projectsRes?.items) setWebsiteProjects(projectsRes.items);
      } catch {
        // non-blocking
      }
    }

    // Content calendar data
    if (activeCategory === 'content' || isAdminOrOps) {
      try {
        const cRes = await contentCalendarService.getItems().catch(() => null);
        if (cRes) setContentData(cRes);
      } catch {
        // non-blocking
      }
    }

    // Performance marketing data
    if (activeCategory === 'marketing' || isAdminOrOps) {
      try {
        const mRes = await marketingService.getDaily(todayIso).catch(() => null);
        if (mRes?.rows) setMarketingRows(mRes.rows);
      } catch {
        // non-blocking
      }
    }

    // HR data
    if (activeCategory === 'hr' || isAdminOrOps) {
      try {
        const pRes = await attendanceService.getPendingRequests().catch(() => []);
        if (Array.isArray(pRes)) setPendingRequests(pRes);
      } catch {
        // non-blocking
      }
    }
  }, [activeCategory, isAdminOrOps, todayIso]);

  useEffect(() => {
    loadAttendance();
    if (!isOperations) {
      loadDailyLogs();
    }
    loadDepartmentData();
  }, [loadAttendance, loadDailyLogs, loadDepartmentData, isOperations]);

  const handleOpenRequestModal = (tab: RequestType = 'leave') => {
    setRequestModalTab(tab);
    setIsRequestModalOpen(true);
  };

  // Punch in/out handler
  const isCheckedIn = Boolean(
    todayAttendance?.punch_status?.is_checked_in ||
    (todayAttendance?.record?.check_in && !todayAttendance?.record?.check_out)
  );
  const punchInTime = todayAttendance?.punch_status?.check_in_time || todayAttendance?.record?.check_in;
  const punchOutTime = todayAttendance?.punch_status?.check_out_time || todayAttendance?.record?.check_out;

  const handleTogglePunch = async () => {
    if (isCheckedIn) {
      try {
        const res = await attendanceService.checkOut({
          notes: 'Standard check-out from dashboard',
        });
        if (res) {
          addToast('Checked out', 'Your check-out has been recorded.', 'success');
          loadAttendance();
        }
      } catch (err: any) {
        addToast('Checkout error', err?.message || 'Error occurred during checkout', 'error');
      }
    } else {
      try {
        const res = await attendanceService.checkIn({
          notes: 'Standard check-in from dashboard',
        });
        if (res) {
          addToast('Checked in', 'Your check-in has been recorded.', 'success');
          loadAttendance();
        }
      } catch (err: any) {
        addToast('Check-in error', err?.message || 'Error occurred during check-in', 'error');
      }
    }
  };

  // Compute Daily Log Summary (Hours)
  const todayTotalHours = useMemo(() => {
    return logEntries
      .filter((e) => e.date === todayIso)
      .reduce((acc, entry) => {
        const hrs = typeof entry.hours_utilized === 'number'
          ? entry.hours_utilized
          : parseFloat(String(entry.hours_utilized || 0));
        return acc + (isNaN(hrs) ? 0 : hrs);
      }, 0);
  }, [logEntries, todayIso]);

  // Compute Week Logged Hours
  const weekTotalHours = useMemo(() => {
    return logEntries
      .filter((e) => e.date >= mondayIso && e.date <= todayIso)
      .reduce((acc, entry) => {
        const hrs = typeof entry.hours_utilized === 'number'
          ? entry.hours_utilized
          : parseFloat(String(entry.hours_utilized || 0));
        return acc + (isNaN(hrs) ? 0 : hrs);
      }, 0);
  }, [logEntries, mondayIso, todayIso]);

  // Compute Last Week Logged Hours for diff
  const lastWeekTotalHours = useMemo(() => {
    return logEntries
      .filter((e) => e.date >= lastWeekMondayIso && e.date <= lastWeekSundayIso)
      .reduce((acc, entry) => {
        const hrs = typeof entry.hours_utilized === 'number'
          ? entry.hours_utilized
          : parseFloat(String(entry.hours_utilized || 0));
        return acc + (isNaN(hrs) ? 0 : hrs);
      }, 0);
  }, [logEntries, lastWeekMondayIso, lastWeekSundayIso]);

  const weekDiffHours = weekTotalHours - lastWeekTotalHours;

  // Timesheet Summary metrics
  const timesheetSummary = personalTimesheet?.summary;
  const daysPresent = timesheetSummary?.days_present ?? (isCheckedIn ? 1 : 0);
  const totalWorkingDays = timesheetSummary?.total_working_days ?? timesheetSummary?.working_days ?? 22;
  const lateStrikes = timesheetSummary?.late_count ?? timesheetSummary?.late_strikes ?? 0;

  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.full_name || user?.name || '').split(' ')[0] || 'there';
  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const currentMonthName = today.toLocaleDateString('en-US', { month: 'long' });

  const shift = todayAttendance?.shift;
  const shiftExpectedHours = shift?.expected_hours ?? shift?.expected_work_hours ?? 8;
  const logProgressPercent = Math.min(
    100,
    Math.round((todayTotalHours / (shiftExpectedHours || 8)) * 100)
  );

  // Compute working days left in current week (Monday-Saturday)
  const currentDayOfWeek = today.getDay();
  const workingDaysLeft = currentDayOfWeek >= 1 && currentDayOfWeek <= 6 ? 6 - currentDayOfWeek : 0;

  // Real at work elapsed time calculation
  const elapsedAtWork = useMemo(() => {
    if (!isCheckedIn || !punchInTime) return '—';
    try {
      let inDate: Date | null = null;
      if (punchInTime.includes('T')) {
        inDate = new Date(punchInTime);
      } else {
        const match = punchInTime.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/i);
        if (match) {
          let hr = parseInt(match[1], 10);
          const min = parseInt(match[2], 10);
          const ampm = match[3]?.toUpperCase();
          if (ampm === 'PM' && hr < 12) hr += 12;
          if (ampm === 'AM' && hr === 12) hr = 0;
          inDate = new Date();
          inDate.setHours(hr, min, 0, 0);
        }
      }
      if (inDate && !isNaN(inDate.getTime())) {
        const diffMs = Math.max(0, Date.now() - inDate.getTime());
        const hrs = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        return `${hrs}h ${mins}m`;
      }
    } catch {
      // fallback
    }
    return '—';
  }, [isCheckedIn, punchInTime]);

  // Chart calculation for Team Hours (Dynamic SVG)
  const numChartDays = chartRange === '7D' ? 7 : chartRange === '14D' ? 14 : 30;
  const chartDaysList = useMemo(() => {
    const list: string[] = [];
    for (let i = numChartDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      list.push(`${y}-${m}-${dayStr}`);
    }
    return list;
  }, [today, numChartDays]);

  const { chartLogged, chartMaxH, pointsLogged, pointsAtWork, areaPolygonPoints } = useMemo(() => {
    const loggedMap = new Map<string, number>();
    logEntries.forEach((e) => {
      const h = typeof e.hours_utilized === 'number' ? e.hours_utilized : parseFloat(String(e.hours_utilized || 0));
      loggedMap.set(e.date, (loggedMap.get(e.date) || 0) + (isNaN(h) ? 0 : h));
    });

    const atWorkMap = new Map<string, number>();
    personalTimesheet?.records?.forEach((r) => {
      const h = (r.working_hours_minutes || 0) / 60;
      atWorkMap.set(r.date, h);
    });

    const logged = chartDaysList.map((d) => loggedMap.get(d) || 0);
    const atWork = chartDaysList.map((d) => atWorkMap.get(d) || 0);

    const highest = Math.max(8, ...logged, ...atWork);
    const maxH = Math.ceil(highest / 4) * 4;

    const startX = 36;
    const endX = 732;
    const bottomY = 146;
    const topY = 8;
    const rangeY = bottomY - topY;

    const loggedCoords = logged.map((val, idx) => {
      const x = startX + (idx / (numChartDays - 1)) * (endX - startX);
      const y = bottomY - (val / maxH) * rangeY;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const atWorkCoords = atWork.map((val, idx) => {
      const x = startX + (idx / (numChartDays - 1)) * (endX - startX);
      const y = bottomY - (val / maxH) * rangeY;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const areaPoints = `${startX},${bottomY} ${loggedCoords.join(' ')} ${endX},${bottomY}`;

    return {
      chartLogged: logged,
      chartMaxH: maxH,
      pointsLogged: loggedCoords.join(' '),
      pointsAtWork: atWorkCoords.join(' '),
      areaPolygonPoints: areaPoints,
    };
  }, [chartDaysList, logEntries, personalTimesheet, numChartDays]);

  // Today attendance metrics
  const matrixSummary = dailyMatrix?.summary;
  const isSelfLate = Boolean(todayAttendance?.record?.is_late);
  const isSelfWfh = Boolean(todayAttendance?.record?.is_wfh || todayAttendance?.is_wfh_approved);
  const attendanceHeadcount = matrixSummary?.total_headcount ?? (isCheckedIn ? 1 : 0);
  const attendancePresent = matrixSummary?.present ?? (isCheckedIn ? 1 : 0);
  const attendanceLate = matrixSummary?.late ?? (isSelfLate ? 1 : 0);
  const attendanceWfh = matrixSummary?.wfh ?? (isSelfWfh ? 1 : 0);
  const attendanceLeaves = matrixSummary?.leaves ?? 0;
  const attendanceOnTime = matrixSummary?.on_time ?? (isCheckedIn && !isSelfLate ? 1 : 0);

  // Department KPI 4 resolution
  const departmentKpi = useMemo(() => {
    switch (activeCategory) {
      case 'website': {
        const active = websiteMetrics?.active_projects ?? websiteProjects.filter((p) => !p.on_hold).length;
        const atRisk = websiteMetrics?.at_risk ?? websiteProjects.filter((p) => p.health === 'at_risk').length;
        const overdue = websiteMetrics?.overdue_tasks ?? 0;
        return {
          icon: Globe,
          title: 'Active projects',
          value: String(active),
          subtext: `${atRisk} at risk · ${overdue} overdue tasks`,
          subtextColor: atRisk > 0 ? 'text-warning-fg' : 'text-success-fg',
        };
      }
      case 'content': {
        const total = contentData?.total ?? 0;
        const sc = contentData?.stages_count || ({} as Record<PipelineStage, number>);
        const review = (sc['Content Client Review'] || 0) + (sc['Creative Client Review'] || 0);
        const scheduled = (sc['Ready to Post'] || 0) + (sc['Posted'] || 0);
        return {
          icon: Share2,
          title: 'Content items',
          value: String(total),
          subtext: `${review} in review · ${scheduled} scheduled`,
          subtextColor: review > 0 ? 'text-warning-fg' : 'text-success-fg',
        };
      }
      case 'marketing': {
        const count = marketingRows.length;
        const spend = marketingRows.reduce((acc, r) => acc + (r.ad_spend || 0), 0);
        return {
          icon: Megaphone,
          title: 'Active campaigns',
          value: String(count),
          subtext: `PKR ${spend.toLocaleString()} spend today`,
          subtextColor: 'text-success-fg',
        };
      }
      case 'hr': {
        const pending = pendingRequests.length;
        const leaves = pendingRequests.filter((r) => r.request_type === 'leave' || r.request_type === 'short_leave').length;
        const wfh = pendingRequests.filter((r) => r.request_type === 'wfh').length;
        return {
          icon: Users,
          title: 'Pending requests',
          value: String(pending),
          subtext: `${leaves} leaves · ${wfh} WFH awaiting review`,
          subtextColor: pending > 0 ? 'text-warning-fg' : 'text-success-fg',
        };
      }
      case 'sales': {
        const open = crmCounts
          ? crmCounts.incoming + crmCounts.assigned + crmCounts.uncontacted
          : crmLeads.filter((l) => l.stage !== 'won' && l.stage !== 'lost').length;
        const uncontacted = crmCounts?.uncontacted ?? 0;
        const won = crmCounts?.won ?? 0;
        return {
          icon: Briefcase,
          title: 'Open leads',
          value: String(open),
          subtext: `${uncontacted} uncontacted · ${won} won`,
          subtextColor: uncontacted > 0 ? 'text-warning-fg' : 'text-success-fg',
        };
      }
      default:
        return null;
    }
  }, [activeCategory, websiteMetrics, websiteProjects, contentData, marketingRows, pendingRequests, crmCounts, crmLeads]);

  // Needs Attention items
  const attentionItems = useMemo(() => {
    const list: Array<{
      id: string;
      icon: any;
      title: string;
      desc: string;
      actionText: string;
      onAction: () => void;
    }> = [];

    // Sales check
    if ((activeCategory === 'sales' || isAdminOrOps) && (crmCounts?.uncontacted || 0) > 0) {
      list.push({
        id: 'crm-uncontacted',
        icon: Phone,
        title: `${crmCounts?.uncontacted} uncontacted lead${(crmCounts?.uncontacted || 0) > 1 ? 's' : ''}`,
        desc: 'New inbound leads awaiting first contact',
        actionText: 'Open',
        onAction: () => onNavigateView('crm'),
      });
    }

    // Website check
    if ((activeCategory === 'website' || isAdminOrOps) && (websiteMetrics?.overdue_tasks || 0) > 0) {
      list.push({
        id: 'wp-overdue',
        icon: AlertTriangle,
        title: `${websiteMetrics?.overdue_tasks} overdue task${(websiteMetrics?.overdue_tasks || 0) > 1 ? 's' : ''}`,
        desc: 'Website milestone deliverables past target date',
        actionText: 'Review',
        onAction: () => onNavigateView('website-pipeline'),
      });
    }

    // Content check
    const sc = contentData?.stages_count || ({} as Record<PipelineStage, number>);
    const clientReviewCount = (sc['Content Client Review'] || 0) + (sc['Creative Client Review'] || 0);
    if ((activeCategory === 'content' || isAdminOrOps) && clientReviewCount > 0) {
      list.push({
        id: 'cc-review',
        icon: Share2,
        title: `${clientReviewCount} item${clientReviewCount > 1 ? 's' : ''} in client review`,
        desc: 'Content approval or feedback requested',
        actionText: 'Review',
        onAction: () => onNavigateView('content-calendar'),
      });
    }

    // HR check
    if ((activeCategory === 'hr' || isAdminOrOps) && pendingRequests.length > 0) {
      list.push({
        id: 'hr-requests',
        icon: Users,
        title: `${pendingRequests.length} pending request${pendingRequests.length > 1 ? 's' : ''}`,
        desc: 'Leave, WFH or regularization approvals waiting',
        actionText: 'Review',
        onAction: () => onNavigateView('attendance'),
      });
    }

    // Personal log submission check
    if (isCheckedIn && todayTotalHours === 0 && !isOperations) {
      list.push({
        id: 'log-missing',
        icon: FileText,
        title: "Today's daily log pending",
        desc: `Shift in progress (${formatHours(shiftExpectedHours || 8)})`,
        actionText: 'Log work',
        onAction: () => onNavigateView('daily-log'),
      });
    }

    // Late strikes check
    if (lateStrikes > 0) {
      list.push({
        id: 'late-strikes',
        icon: Inbox,
        title: `${lateStrikes} late strike${lateStrikes > 1 ? 's' : ''} this month`,
        desc: 'Check timesheet and punch records',
        actionText: 'Timesheet',
        onAction: () => onNavigateView('attendance'),
      });
    }

    return list.slice(0, 3);
  }, [
    activeCategory,
    isAdminOrOps,
    crmCounts,
    websiteMetrics,
    contentData,
    pendingRequests,
    isCheckedIn,
    todayTotalHours,
    isOperations,
    shiftExpectedHours,
    lateStrikes,
    onNavigateView,
  ]);

  if (isLoadingAttendance && !todayAttendance) {
    return (
      <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-6 max-w-7xl mx-auto w-full dashboard-view">
        <div className="space-y-2 mb-5">
          <Skeleton className="w-56 h-8 rounded-md" />
          <Skeleton className="w-80 h-4 rounded-md" />
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  const KpiIcon = departmentKpi ? departmentKpi.icon : null;

  const renderTodayAttendanceCard = () => (
    <div className="bg-surface border border-border rounded-lg shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border">
          <h3 className="text-ui font-semibold text-fg">
            Today's attendance <span className="text-fg-muted font-normal text-xs ml-1">· {attendanceHeadcount} people</span>
          </h3>
          <button
            type="button"
            onClick={() => onNavigateView('attendance')}
            className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            View all
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 pt-2.5 space-y-2.5">
          {/* Pills Summary */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusPill variant="success" dot={false} label={`${attendancePresent} present`} />
            <StatusPill variant="warning" dot={false} label={`${attendanceLate} late`} />
            <StatusPill variant="accent" dot={false} label={`${attendanceWfh} WFH`} />
            <StatusPill variant="info" dot={false} label={`${attendanceLeaves} leave`} />
          </div>

          {/* List Rows */}
          <div className="divide-y divide-border pt-1">
            {dailyMatrix && dailyMatrix.rows.length > 0 ? (
              dailyMatrix.rows.slice(0, 3).map((row) => {
                const inTime = row.punch_in || row.check_in;
                const initials = (row.employee_name || 'U')
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                const isLeaveStatus = row.status.includes('leave');

                return (
                  <div key={row.user_id} className="flex items-center gap-2.5 py-2">
                    <span className="w-7 h-7 rounded-full bg-subtle border border-border flex items-center justify-center text-xs font-semibold text-fg-2 shrink-0">
                      {initials}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-fg truncate">{row.employee_name}</p>
                      <p className="text-micro text-fg-muted truncate">{row.department || 'General'}</p>
                    </div>
                    <span className="text-xs text-fg-muted font-numeric mr-1">
                      {inTime || '—'}
                    </span>
                    <StatusPill
                      variant={
                        row.status === 'present'
                          ? 'success'
                          : row.status === 'late'
                          ? 'warning'
                          : row.status === 'wfh'
                          ? 'accent'
                          : isLeaveStatus
                          ? 'info'
                          : 'neutral'
                      }
                      dot
                      label={row.status === 'wfh' ? 'WFH' : row.status === 'short_leave' ? 'Short Leave' : isLeaveStatus ? 'Leave' : row.status}
                    />
                  </div>
                );
              })
            ) : (
              /* Personal Attendance Row if matrix is not available */
              <div className="flex items-center gap-2.5 py-3">
                <span className="w-7 h-7 rounded-full bg-accent-soft text-accent border border-border flex items-center justify-center text-xs font-semibold text-fg-2 shrink-0">
                  {(user?.full_name || 'Me').slice(0, 2).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-fg truncate">{user?.full_name || 'My Record'}</p>
                  <p className="text-micro text-fg-muted truncate">
                    {isCheckedIn ? `In at ${punchInTime || '—'}` : 'Not clocked in'}
                  </p>
                </div>
                <StatusPill
                  variant={isCheckedIn ? 'success' : todayOff.isOff ? 'neutral' : 'warning'}
                  dot
                  label={isCheckedIn ? 'Checked in' : todayOff.isOff ? 'Rest day' : 'Not clocked in'}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="border-t border-border px-4 py-2.5 flex items-center justify-between text-xs">
        <span className="text-fg-muted">Office status</span>
        <span className="font-numeric">
          <strong className="text-fg font-semibold">{attendanceOnTime} on-time today</strong>
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-5 max-w-7xl mx-auto w-full dashboard-view view-enter">
      {/* 1. Page Header */}
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={`${formattedDate} · ${user?.department || 'General'} · ${workingDaysLeft} of 6 working days left this week`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenRequestModal('leave')}
              icon={FilePlus}
            >
              Request leave
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigateView('attendance')}
              icon={CalendarDays}
            >
              This week
            </Button>
            {!isOperations && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onNavigateView('daily-log')}
                icon={Plus}
              >
                Log work
              </Button>
            )}
          </div>
        }
      />

      {/* 2. Top KPI Row */}
      <div className={departmentKpi ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" : "grid grid-cols-1 sm:grid-cols-3 gap-4"}>
        {/* KPI 1: Logged this week */}
        <div className="bg-surface border border-border rounded-lg p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium mb-1.5">
            <Clock className="w-4 h-4 text-fg-muted" />
            <span>Logged this week</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-kpi font-semibold text-fg tracking-tight font-numeric">
              {weekTotalHours.toFixed(1)}
              <span className="text-xs text-fg-muted font-medium ml-0.5">h</span>
            </div>
            {/* Dynamic sparkline */}
            <svg width="80" height="24" viewBox="0 0 80 24" aria-hidden="true">
              <polyline
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points="0,20 16,18 32,16 48,12 64,10 80,6"
              />
            </svg>
          </div>
          <div className="text-xs text-fg-muted mt-2">
            {lastWeekTotalHours > 0 ? (
              <>
                <span className={weekDiffHours >= 0 ? 'text-success-fg font-medium font-numeric' : 'text-warning-fg font-medium font-numeric'}>
                  {weekDiffHours >= 0 ? `+${weekDiffHours.toFixed(1)}h` : `${weekDiffHours.toFixed(1)}h`}
                </span>{' '}
                vs last week
              </>
            ) : (
              <span>Target: {formatHours(48)} / week</span>
            )}
          </div>
        </div>

        {/* KPI 2: Present in Month */}
        <div className="bg-surface border border-border rounded-lg p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium mb-1.5">
            <CalendarCheck className="w-4 h-4 text-fg-muted" />
            <span>Present in {currentMonthName}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-kpi font-semibold text-fg tracking-tight font-numeric">
              {daysPresent}
              <span className="text-sm text-fg-muted font-medium">/{totalWorkingDays}</span>
            </div>
            <svg width="80" height="24" viewBox="0 0 80 24" aria-hidden="true">
              <polyline
                fill="none"
                stroke="var(--text-faint)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points="0,14 16,14 32,14 48,14 64,14 80,14"
              />
            </svg>
          </div>
          <div className="text-xs text-fg-muted mt-2">
            <span className="font-numeric text-fg-2">{lateStrikes} late strike{lateStrikes !== 1 ? 's' : ''}</span> on schedule
          </div>
        </div>

        {/* KPI 3: On time today */}
        <div className="bg-surface border border-border rounded-lg p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium mb-1.5">
            <Users className="w-4 h-4 text-fg-muted" />
            <span>On time today</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-kpi font-semibold text-fg tracking-tight font-numeric">
              {attendanceOnTime}
              <span className="text-sm text-fg-muted font-medium">/{attendanceHeadcount || 1}</span>
            </div>
            <svg width="80" height="24" viewBox="0 0 80 24" aria-hidden="true">
              <polyline
                fill="none"
                stroke="var(--text-faint)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points="0,12 16,10 32,14 48,9 64,11 80,13"
              />
            </svg>
          </div>
          <div className="text-xs text-fg-muted mt-2">
            <span className="text-warning-fg font-medium">{attendanceLate} late</span> · {attendanceLeaves} on leave
          </div>
        </div>

        {/* KPI 4: Department-specific KPI (Only if departmentKpi exists) */}
        {departmentKpi && KpiIcon && (
          <div className="bg-surface border border-border rounded-lg p-4 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium mb-1.5">
              <KpiIcon className="w-4 h-4 text-fg-muted" />
              <span>{departmentKpi.title}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-kpi font-semibold text-fg tracking-tight font-numeric">
                {departmentKpi.value}
              </div>
              <svg width="80" height="24" viewBox="0 0 80 24" aria-hidden="true">
                <polyline
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points="0,22 16,19 32,20 48,14 64,12 80,7"
                />
              </svg>
            </div>
            <div className="text-xs text-fg-muted mt-2">
              <span className={`${departmentKpi.subtextColor} font-medium font-numeric`}>
                {departmentKpi.subtext}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Your Day Card (Top Hero) */}
      <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-ui font-semibold text-fg">Your day</h3>
            <StatusPill
              variant={isCheckedIn ? 'success' : todayOff.isOff ? 'neutral' : 'warning'}
              dot
              label={
                todayOff.isOff
                  ? 'Rest day'
                  : isCheckedIn
                  ? 'Checked in'
                  : 'Not checked in'
              }
            />
          </div>
          <div className="text-xs text-fg-muted">
            Shift: <span className="font-medium text-fg font-numeric">{shift?.start_time || '9:30 AM'} – {shift?.end_time || '6:30 PM'}</span>
          </div>
        </div>

        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: At work time */}
          <div className="min-w-[150px]">
            <div className="text-kpi font-semibold text-fg font-numeric tracking-tight">
              {elapsedAtWork}
            </div>
            <div className="text-xs text-fg-muted mt-0.5">
              {isCheckedIn
                ? `at work since ${punchInTime || '9:00 AM'}`
                : punchOutTime
                ? `checked out at ${punchOutTime}`
                : 'not clocked in'}
            </div>
          </div>

          {/* Middle: Daily log progress bar */}
          <div className="flex-1 max-w-lg w-full">
            <div className="flex items-center justify-between text-xs text-fg-muted mb-1.5">
              <span>Logged {formatHours(todayTotalHours)} of {formatHours(shiftExpectedHours || 8)}</span>
              <span>Break 1:00 – 2:00 PM</span>
            </div>
            <div className="h-2 w-full bg-subtle rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${logProgressPercent}%` }}
              />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTogglePunch}
              icon={isCheckedIn ? LogOut : LogIn}
            >
              {isCheckedIn ? 'Check out' : 'Check in'}
            </Button>
            {!isOperations && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onNavigateView('daily-log')}
                icon={Plus}
              >
                Log work
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Main Content Area */}
      <div className="flex flex-col lg:flex-row gap-4 items-start w-full">
        {/* LEFT COLUMN */}
        <div className="flex-1 min-w-0 flex flex-col gap-4 w-full">
          {/* Team Hours Chart Card */}
          <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border flex-wrap gap-2">
              <div>
                <h3 className="text-ui font-semibold text-fg">Team hours</h3>
                <p className="text-xs text-fg-muted">Logged in daily logs vs time at work · last {chartRange}</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-xs text-fg-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-accent shrink-0" />
                    Logged
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-fg-faint shrink-0" />
                    At work
                  </span>
                </div>

                <SegmentedControl
                  size="sm"
                  value={chartRange}
                  onValueChange={setChartRange}
                  options={[
                    { value: '7D', label: '7D' },
                    { value: '14D', label: '14D' },
                    { value: '30D', label: '30D' },
                  ]}
                />
              </div>
            </div>

            {/* Dynamic Responsive SVG Chart */}
            <div className="p-4 pt-2">
              <svg width="100%" height="168" viewBox="0 0 744 168" className="overflow-visible" preserveAspectRatio="none">
                {/* Horizontal Gridlines */}
                <line x1="36" x2="740" y1="146.0" y2="146.0" stroke="var(--border)" strokeDasharray="3 3" />
                <text x="28" y="150.0" textAnchor="end" fontSize="11" fill="var(--text-muted)">0h</text>

                <line x1="36" x2="740" y1="100.0" y2="100.0" stroke="var(--border)" strokeDasharray="3 3" />
                <text x="28" y="104.0" textAnchor="end" fontSize="11" fill="var(--text-muted)">
                  {Math.round(chartMaxH / 3)}h
                </text>

                <line x1="36" x2="740" y1="54.0" y2="54.0" stroke="var(--border)" strokeDasharray="3 3" />
                <text x="28" y="58.0" textAnchor="end" fontSize="11" fill="var(--text-muted)">
                  {Math.round((chartMaxH * 2) / 3)}h
                </text>

                <line x1="36" x2="740" y1="8.0" y2="8.0" stroke="var(--border)" strokeDasharray="3 3" />
                <text x="28" y="12.0" textAnchor="end" fontSize="11" fill="var(--text-muted)">
                  {chartMaxH}h
                </text>

                {/* Area Fill under Logged line */}
                <polygon
                  points={areaPolygonPoints}
                  fill="var(--accent)"
                  opacity="0.08"
                />

                {/* At work (dashed line) */}
                <polyline
                  points={pointsAtWork}
                  fill="none"
                  stroke="var(--text-faint)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />

                {/* Logged (solid purple line) */}
                <polyline
                  points={pointsLogged}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />

                {/* Guide line at Today */}
                <line x1="732.0" x2="732.0" y1="8" y2="146.0" stroke="var(--border-strong)" />
                <circle
                  cx="732.0"
                  cy={(146 - ((chartLogged[chartLogged.length - 1] || 0) / chartMaxH) * (146 - 8)).toFixed(1)}
                  r="4"
                  fill="var(--bg-surface)"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />

                {/* Dynamic X-axis date labels */}
                {(() => {
                  const labelIndices = [
                    0,
                    Math.floor(numChartDays * 0.2),
                    Math.floor(numChartDays * 0.4),
                    Math.floor(numChartDays * 0.6),
                    Math.floor(numChartDays * 0.8),
                    numChartDays - 1,
                  ];
                  const uniqueIndices = Array.from(new Set(labelIndices));
                  return uniqueIndices.map((idx, i) => {
                    const dateStr = chartDaysList[idx];
                    const x = 36 + (idx / (numChartDays - 1)) * (732 - 36);
                    const isLast = idx === numChartDays - 1;
                    const dateObj = new Date(dateStr + 'T00:00:00');
                    const label = isLast
                      ? 'Today'
                      : dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                    return (
                      <text
                        key={i}
                        x={x}
                        y="164"
                        textAnchor={isLast ? 'end' : i === 0 ? 'start' : 'middle'}
                        fontSize="11"
                        fill="var(--text-muted)"
                      >
                        {label}
                      </text>
                    );
                  });
                })()}
              </svg>
            </div>
          </div>

          {/* Row of Cards: Department Module (if applicable) + Today's Attendance */}
          {hasDepartmentModule ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CARD 1: Department-Related Module */}
              <div className="bg-surface border border-border rounded-lg shadow-xs flex flex-col justify-between">
                <div>
                  {/* Header with optional Admin switcher */}
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <h3 className="text-ui font-semibold text-fg">
                        {activeCategory === 'sales' && 'Sales pipeline'}
                        {activeCategory === 'website' && 'Websites pipeline'}
                        {activeCategory === 'content' && 'Content calendar'}
                        {activeCategory === 'marketing' && 'Performance marketing'}
                        {activeCategory === 'hr' && 'Pending approvals'}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Admin cross-department switcher */}
                      {isAdminOrOps && (
                        <SegmentedControl
                          size="sm"
                          value={selectedCategory}
                          onValueChange={(val) => setSelectedCategory(val as DepartmentCategory)}
                          options={[
                            { value: 'sales', label: 'Sales' },
                            { value: 'website', label: 'Web' },
                            { value: 'content', label: 'Content' },
                            { value: 'marketing', label: 'Ads' },
                            { value: 'hr', label: 'HR' },
                          ]}
                        />
                      )}

                      {/* Navigation shortcut */}
                      {activeCategory === 'sales' && (
                        <button
                          type="button"
                          onClick={() => onNavigateView('crm')}
                          className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          Open board
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {activeCategory === 'website' && (
                        <button
                          type="button"
                          onClick={() => onNavigateView('website-pipeline')}
                          className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          Open pipeline
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {activeCategory === 'content' && (
                        <button
                          type="button"
                          onClick={() => onNavigateView('content-calendar')}
                          className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          Open calendar
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {activeCategory === 'marketing' && (
                        <button
                          type="button"
                          onClick={() => onNavigateView('marketing')}
                          className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          Open matrix
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {activeCategory === 'hr' && (
                        <button
                          type="button"
                          onClick={() => onNavigateView('attendance')}
                          className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          View all
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Content body based on active category */}
                  <div className="p-4 pt-2.5">
                    {/* 1. SALES PIPELINE VIEW */}
                    {activeCategory === 'sales' && (
                      <div className="space-y-2.5">
                        {(() => {
                          const stageList = [
                            { label: 'Incoming', count: crmCounts?.incoming || 0 },
                            { label: 'Assigned', count: crmCounts?.assigned || 0 },
                            { label: 'Contacted', count: crmCounts?.contacted_under_15m || 0 },
                            { label: 'Uncontacted', count: crmCounts?.uncontacted || 0 },
                            { label: 'Won', count: crmCounts?.won || 0 },
                          ];
                          const totalStageCount = Math.max(1, stageList.reduce((acc, s) => acc + s.count, 0));

                          return (
                            <div className="space-y-2">
                              {stageList.map((stage) => {
                                const pct = Math.round((stage.count / totalStageCount) * 100);
                                return (
                                  <div
                                    key={stage.label}
                                    className="grid grid-cols-[120px_1fr_40px] items-center gap-2.5 h-7 text-xs"
                                  >
                                    <span className="text-fg-muted truncate">{stage.label}</span>
                                    <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                                      <div
                                        className="h-full bg-accent rounded-full transition-all duration-300"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="font-semibold text-fg text-right font-numeric">{stage.count}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* 2. WEBSITE PIPELINE VIEW */}
                    {activeCategory === 'website' && (
                      <div className="space-y-2">
                        {websiteProjects.length === 0 ? (
                          <div className="py-6 text-center text-xs text-fg-muted">
                            No active website projects found.
                          </div>
                        ) : (
                          websiteProjects.slice(0, 4).map((proj) => {
                            return (
                              <div
                                key={proj.id}
                                className="p-2 rounded-md border border-border bg-subtle/50 flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-fg truncate">{proj.name}</span>
                                    <span className="text-micro px-1.5 py-0.2 rounded-xs bg-subtle border border-border text-fg-muted shrink-0">
                                      {proj.client_name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <div className="h-1 flex-1 bg-border rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-accent rounded-full"
                                        style={{ width: `${proj.progress || 0}%` }}
                                      />
                                    </div>
                                    <span className="text-micro text-fg-muted font-mono">{proj.progress || 0}%</span>
                                  </div>
                                </div>
                                <StatusPill
                                  variant={
                                    proj.health === 'on_track'
                                      ? 'success'
                                      : proj.health === 'at_risk'
                                      ? 'warning'
                                      : proj.health === 'waiting_on_client'
                                      ? 'info'
                                      : 'neutral'
                                }
                                dot
                                label={
                                  proj.health === 'on_track'
                                    ? 'On track'
                                    : proj.health === 'at_risk'
                                    ? 'At risk'
                                    : proj.health === 'waiting_on_client'
                                    ? 'Client review'
                                    : 'Active'
                                }
                              />
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* 3. CONTENT CALENDAR VIEW */}
                  {activeCategory === 'content' && (
                    <div className="space-y-2.5">
                      {(() => {
                        const sc = contentData?.stages_count || ({} as Record<PipelineStage, number>);
                        const stages = [
                          { label: 'Content Writing', count: (sc['Content'] || 0) + (sc['Content Internal Review'] || 0) },
                          { label: 'Creative Design', count: (sc['Creative Production'] || 0) + (sc['Creative Internal Review'] || 0) },
                          { label: 'Client Review', count: (sc['Content Client Review'] || 0) + (sc['Creative Client Review'] || 0) },
                          { label: 'Revisions', count: (sc['Content Revision'] || 0) + (sc['Creative Revision'] || 0) },
                          { label: 'Ready to Post', count: (sc['Ready to Post'] || 0) + (sc['Posted'] || 0) },
                        ];
                        const totalContent = Math.max(1, stages.reduce((a, b) => a + b.count, 0));

                        return (
                          <div className="space-y-2">
                            {stages.map((st) => {
                              const pct = Math.round((st.count / totalContent) * 100);
                              return (
                                <div
                                  key={st.label}
                                  className="grid grid-cols-[130px_1fr_36px] items-center gap-2.5 h-7 text-xs"
                                >
                                  <span className="text-fg-muted truncate">{st.label}</span>
                                  <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                                    <div
                                      className="h-full bg-accent rounded-full transition-all duration-300"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="font-semibold text-fg text-right font-numeric">{st.count}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* 4. PERFORMANCE MARKETING VIEW */}
                  {activeCategory === 'marketing' && (
                    <div className="space-y-2">
                      {marketingRows.length === 0 ? (
                        <div className="py-6 text-center text-xs text-fg-muted">
                          No active ad campaigns recorded for today.
                        </div>
                      ) : (
                        marketingRows.slice(0, 4).map((row) => (
                          <div
                            key={row.campaign_id}
                            className="p-2 rounded-md border border-border bg-subtle/50 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-fg truncate">{row.campaign_name}</p>
                              <p className="text-micro text-fg-muted mt-0.5">
                                Platform: <span className="capitalize">{row.platform}</span> · {row.objective}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-semibold text-fg font-numeric">PKR {(row.ad_spend || 0).toLocaleString()}</p>
                              <p className="text-micro text-fg-muted font-numeric">
                                {row.leads_conversions || 0} leads
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* 5. HR VIEW */}
                  {activeCategory === 'hr' && (
                    <div className="space-y-2">
                      {pendingRequests.length === 0 ? (
                        <div className="py-6 text-center text-xs text-fg-muted">
                          No pending requests. All caught up!
                        </div>
                      ) : (
                        pendingRequests.slice(0, 4).map((req) => (
                          <div
                            key={req.id}
                            className="p-2 rounded-md border border-border bg-subtle/50 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-fg truncate">{req.user_name}</p>
                              <p className="text-micro text-fg-muted mt-0.5 capitalize">
                                {req.request_type.replace('_', ' ')} · {req.start_date}
                              </p>
                            </div>
                            <StatusPill variant="warning" dot label="Pending" />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Summary Footer */}
              <div className="border-t border-border px-4 py-2.5 flex items-center justify-between text-xs">
                {activeCategory === 'sales' && (
                  <>
                    <span className="text-fg-muted">Won deals</span>
                    <span className="font-numeric">
                      <strong className="text-fg font-semibold">{crmCounts?.won || 0} deals won</strong>
                    </span>
                  </>
                )}
                {activeCategory === 'website' && (
                  <>
                    <span className="text-fg-muted">Pipeline summary</span>
                    <span className="font-numeric">
                      <strong className="text-fg font-semibold">{websiteProjects.length} projects</strong>
                      <span className="text-fg-muted mx-1">·</span>
                      <strong className="text-fg font-semibold">{websiteMetrics?.active_projects || 0} active</strong>
                    </span>
                  </>
                )}
                {activeCategory === 'content' && (
                  <>
                    <span className="text-fg-muted">Content total</span>
                    <span className="font-numeric">
                      <strong className="text-fg font-semibold">{contentData?.total || 0} campaign items</strong>
                    </span>
                  </>
                )}
                {activeCategory === 'marketing' && (
                  <>
                    <span className="text-fg-muted">Total ad spend today</span>
                    <span className="font-numeric">
                      <strong className="text-fg font-semibold">
                        PKR {marketingRows.reduce((a, b) => a + (b.ad_spend || 0), 0).toLocaleString()}
                      </strong>
                    </span>
                  </>
                )}
                {activeCategory === 'hr' && (
                  <>
                    <span className="text-fg-muted">Pending approvals</span>
                    <span className="font-numeric">
                      <strong className="text-fg font-semibold">{pendingRequests.length} requests</strong>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* CARD 2: Today's Attendance Card */}
            {renderTodayAttendanceCard()}
          </div>
        ) : (
          <div className="w-full">
            {/* Today's Attendance Card (Full Width) */}
            {renderTodayAttendanceCard()}
          </div>
        )}
      </div>

      {/* RIGHT COLUMN (320px) */}
      <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
        {/* Card 1: Needs attention */}
        <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border">
            <h3 className="text-ui font-semibold text-fg">Needs attention</h3>
          </div>

            <div className="p-4 pt-2 space-y-3 divide-y divide-border">
              {attentionItems.length === 0 ? (
                <div className="py-4 text-center text-xs text-fg-muted">
                  All caught up! No items requiring attention.
                </div>
              ) : (
                attentionItems.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <div key={item.id} className="flex items-start gap-2.5 pt-2 first:pt-0">
                      <div className="w-7 h-7 rounded-md bg-subtle text-fg-2 flex items-center justify-center shrink-0">
                        <ItemIcon className="w-4 h-4 text-fg-muted" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-fg truncate">{item.title}</p>
                        <p className="text-micro text-fg-muted line-clamp-1">{item.desc}</p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2.5 text-xs shrink-0"
                        onClick={item.onAction}
                      >
                        {item.actionText}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Card 3: Recent activity */}
          <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border">
              <h3 className="text-ui font-semibold text-fg">Recent activity</h3>
            </div>

            <div className="p-4 pt-2 space-y-2.5 divide-y divide-border">
              {recentActivities.length === 0 ? (
                <div className="py-4 text-center text-xs text-fg-muted">
                  No recent activities recorded.
                </div>
              ) : (
                recentActivities.slice(0, 3).map((act) => {
                  const initials = (act.title || 'A')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <div key={act.id} className="flex items-start gap-2.5 pt-2 first:pt-0">
                      <span className="w-6 h-6 rounded-full bg-subtle border border-border flex items-center justify-center text-[10px] font-semibold text-fg-2 shrink-0">
                        {initials}
                      </span>
                      <div className="flex-1 min-w-0 text-xs text-fg-2 leading-relaxed">
                        <strong className="text-fg font-medium">{act.title}</strong>{' '}
                        <span className="line-clamp-1 text-fg-muted">{act.body}</span>
                      </div>
                      <span className="text-micro text-fg-muted font-numeric shrink-0">
                        {getRelativeTime(act.created_at)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Self-Service Request / Appeal Modal */}
      <RequestManagementModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSuccess={() => {
          loadAttendance();
        }}
        defaultTab={requestModalTab}
      />
    </div>
  );
};
