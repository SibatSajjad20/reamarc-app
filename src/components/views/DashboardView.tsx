/**
 * Employee Command Center Dashboard View.
 * Role-based dashboard: Admin, Operations, HR, Team Lead, and Team Member.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ViewType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { attendanceService } from '../../services/attendanceService';
import { dailyLogService } from '../../services/dailyLogService';
import { crmService } from '../../services/crmService';
import { logExceptionService } from '../../services/logExceptionService';
import { websiteProjectService } from '../../services/websiteProjectService';
import { contentCalendarService } from '../../services/contentCalendarService';
import { canAccessCrm } from '../../utils/crmAccess';
import { canAccessContentCalendar } from '../../utils/contentCalendarAccess';
import { canAccessWebsitePipeline } from '../../utils/websiteProjectAccess';
import { visiblePipelineStages, getContentCalendarBucket } from '../../utils/contentCalendarWorkflow';

import type {
  TodayAttendanceResponse,
  PersonalTimesheetResponse,
  DailyMatrixResponse,
  AttendanceRequest,
} from '../../types/attendance';
import type {
  OperatingSnapshot,
  DayTarget,
  TeamHoursMember,
  UserLogActivity,
} from '../../types/dailyLog';
import type { WebsiteProject } from '../../types/websiteProject';
import type { ContentCalendarItem } from '../../types/contentCalendar';

import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/button';
import { DashboardSkeleton } from '../ui/Skeletons';
import { RequestManagementModal } from '../attendance/RequestManagementModal';
import { EmployeePunchCard } from '../attendance/EmployeePunchCard';

import { TeamDailyAttendanceCard } from '../dashboard/TeamDailyAttendanceCard';
import { LogComplianceCard } from '../dashboard/LogComplianceCard';
import { StageCountCard, type StageItem } from '../dashboard/StageCountCard';
import { NeedsAttentionCard, type NeedsAttentionItem } from '../dashboard/NeedsAttentionCard';
import {
  LoggedThisWeekCard,
  AtWorkThisWeekCard,
  PresentInMonthCard,
  type DailyStripDay,
  type MonthDot,
} from '../dashboard/StatCards';
import { TeamHoursChart } from '../dashboard/TeamHoursChart';
import { MyHoursChart, type MyHoursDay } from '../dashboard/MyHoursChart';
import { HrAttendanceTodayCard } from '../dashboard/HrAttendanceTodayCard';
import { HrApprovalInboxCard } from '../dashboard/HrApprovalInboxCard';

import {
  Clock,
  ShieldCheck,
  CalendarCheck,
  Plus,
  ClipboardList,
  Fingerprint,
  FileWarning,
  FileText,
  Calendar,
  Phone,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { useOffDays } from '../../hooks/useOffDays';

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
  if (all.some((d) => d.includes('web') || d.includes('software') || d.includes('dev') || d.includes('seo'))) return 'website';
  if (all.some((d) => d.includes('content') || d.includes('creative') || d.includes('social'))) return 'content';
  if (all.some((d) => d.includes('marketing'))) return 'marketing';

  if (role === 'admin' || role === 'operations') return 'sales';
  return 'general';
}

export function getDepartmentCategories(user?: any): DepartmentCategory[] {
  if (!user) return [];
  const role = (user.role || '').toLowerCase().trim();
  if (role === 'admin' || role === 'operations' || role === 'hr') return [];

  const rawDepts: string[] = [];
  if (user.department) rawDepts.push(user.department);
  if (Array.isArray(user.departments)) {
    user.departments.forEach((d: string) => {
      if (d) rawDepts.push(d);
    });
  }

  const cats = new Set<DepartmentCategory>();
  for (const d of rawDepts) {
    const s = d.toLowerCase().trim();
    if (s.includes('sales')) cats.add('sales');
    else if (s.includes('web') || s.includes('software') || s.includes('dev') || s.includes('seo')) cats.add('website');
    else if (s.includes('content') || s.includes('creative') || s.includes('social')) cats.add('content');
    else if (s.includes('marketing')) cats.add('marketing');
  }

  return Array.from(cats).slice(0, 2);
}

interface DashboardViewProps {
  onNavigateView: (view: ViewType) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateView }) => {
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase().trim();
  const isAdmin = role === 'admin';
  const isOps = role === 'operations';
  const isHR = role === 'hr';
  const isLead = role === 'team_lead';
  const isMember = role === 'team_member';
  const isLogger = !isAdmin && !isOps;

  // Date context
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const yesterdayIso = useMemo(() => {
    const prev = new Date(today);
    prev.setDate(prev.getDate() - 1);
    const y = prev.getFullYear();
    const m = String(prev.getMonth() + 1).padStart(2, '0');
    const d = String(prev.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const monthName = today.toLocaleDateString('en-US', { month: 'long' });

  // Module load gating
  const [isGateReady, setIsGateReady] = useState(false);
  useModuleLoadGate(!isGateReady);

  // General state
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendanceResponse | null>(null);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState<boolean>(true);
  const [matrixData, setMatrixData] = useState<DailyMatrixResponse | null>(null);
  const [timesheetData, setTimesheetData] = useState<PersonalTimesheetResponse | null>(null);
  const [dayTarget, setDayTarget] = useState<DayTarget | null>(null);

  // Admin snapshots & lists
  const [weekSnapshot, setWeekSnapshot] = useState<OperatingSnapshot | null>(null);
  const [pendingRequests, setPendingRequests] = useState<AttendanceRequest[]>([]);
  const [missedInquiries, setMissedInquiries] = useState<any[]>([]);
  const [yesterdayMissingLogCount, setYesterdayMissingLogCount] = useState<number>(0);
  const [yesterdayMissingSubtext, setYesterdayMissingSubtext] = useState<string>('');

  // Team lead / Member / HR states
  const [teamHoursRange, setTeamHoursRange] = useState<'7D' | '14D' | '30D'>('7D');
  const [teamHoursMembers, setTeamHoursMembers] = useState<TeamHoursMember[]>([]);
  const [isLoadingTeamHours, setIsLoadingTeamHours] = useState(false);
  const [hasTeamHours404, setHasTeamHours404] = useState(false);

  const [myHoursRange, setMyHoursRange] = useState<'7D' | '14D' | '30D'>('7D');
  const [myHoursDays, setMyHoursDays] = useState<MyHoursDay[]>([]);
  const [isLoadingMyHours, setIsLoadingMyHours] = useState(false);

  const [logExceptionsInboxCount, setLogExceptionsInboxCount] = useState(0);
  const [myActivity, setMyActivity] = useState<UserLogActivity | null>(null);
  const [myPendingInquiries, setMyPendingInquiries] = useState<any[]>([]);

  // Pipeline stage cards state
  const [crmStages, setCrmStages] = useState<StageItem[]>([]);
  const [contentStages, setContentStages] = useState<StageItem[]>([]);
  const [websiteStages, setWebsiteStages] = useState<StageItem[]>([]);

  // CRM follow-ups / uncontacted
  const [overdueFollowupsCount, setOverdueFollowupsCount] = useState(0);
  const [overdueFollowupsSubtext, setOverdueFollowupsSubtext] = useState('');
  const [uncontactedLeadsCount, setUncontactedLeadsCount] = useState(0);
  const [uncontactedLeadsSubtext, setUncontactedLeadsSubtext] = useState('');

  // Calendar overdue items
  const [calendarOverdueCount, setCalendarOverdueCount] = useState(0);
  const [calendarOverdueSubtext, setCalendarOverdueSubtext] = useState('');

  // Website tasks overdue
  const [websiteOverdueCount, setWebsiteOverdueCount] = useState(0);

  // Weekly stats
  const [weeklyLoggedHours, setWeeklyLoggedHours] = useState(0);
  const [weeklyLoggedDays, setWeeklyLoggedDays] = useState<DailyStripDay[]>([]);
  const [pastDaysLoggedCount, setPastDaysLoggedCount] = useState(0);

  const [weeklyWorkedHours, setWeeklyWorkedHours] = useState(0);
  const [weeklyWorkedDays, setWeeklyWorkedDays] = useState<DailyStripDay[]>([]);
  const [pastDaysWorkedCount, setPastDaysWorkedCount] = useState(0);

  // Month dots
  const [monthDots, setMonthDots] = useState<MonthDot[]>([]);
  const [workingDaysElapsed, setWorkingDaysElapsed] = useState(0);
  const [lateStrikes, setLateStrikes] = useState(0);

  // Request Management Modal
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestModalTab, setRequestModalTab] = useState<'leave' | 'short_leave' | 'wfh' | 'regularization'>('leave');

  // Off days hook
  const { isOffDay: isDateOff } = useOffDays();

  // 1. Load Today Attendance & Timesheet (Non-admin)
  const loadAttendance = useCallback(async () => {
    if (isAdmin) {
      return;
    }
    setIsLoadingAttendance(true);
    try {
      const [todayRes, timesheetRes] = await Promise.allSettled([
        attendanceService.getTodayStatus(),
        attendanceService.getMyTimesheet(currentYear, currentMonth),
      ]);

      if (todayRes.status === 'fulfilled') {
        setTodayAttendance(todayRes.value);
      }
      if (timesheetRes.status === 'fulfilled') {
        setTimesheetData(timesheetRes.value);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingAttendance(false);
    }
  }, [isAdmin, currentYear, currentMonth]);

  // 2. Load Matrix Data (Admin & HR only)
  const loadMatrix = useCallback(async () => {
    if (!isAdmin && !isHR) return;
    try {
      const data = await attendanceService.getDailyMatrix(todayIso);
      setMatrixData(data);
    } catch {
      // 403 or failure silent
    }
  }, [isAdmin, isHR, todayIso]);

  // 3. Load Management Inboxes & Approvals (Admin, Ops, HR)
  const loadManagementData = useCallback(async () => {
    if (!isAdmin && !isOps && !isHR) return;

    // Pending requests
    try {
      const reqs = await attendanceService.getPendingRequests();
      setPendingRequests(reqs || []);
    } catch {}

    // Missed punch inquiries
    try {
      const inquiries = await attendanceService.getMissedPunchInquiries({ status: 'pending' });
      setMissedInquiries(inquiries || []);
    } catch {}

    // Admin week snapshot
    if (isAdmin) {
      try {
        const snap = await logExceptionService.getSnapshot(undefined, 'week');
        setWeekSnapshot(snap);
      } catch {}

      // Yesterday missing logs
      try {
        const ySnap = await logExceptionService.getSnapshot(yesterdayIso, 'today');
        const unlogged = (ySnap?.people || []).filter((p) => !p.logged);
        setYesterdayMissingLogCount(unlogged.length);
        if (unlogged.length > 0) {
          const deptMap: Record<string, number> = {};
          unlogged.forEach((p) => {
            const d = p.department || 'Other';
            deptMap[d] = (deptMap[d] || 0) + 1;
          });
          const text = Object.entries(deptMap)
            .map(([d, c]) => `${d} ${c}`)
            .slice(0, 3)
            .join(' · ');
          const extra = Object.keys(deptMap).length > 3 ? ` · +${Object.keys(deptMap).length - 3}` : '';
          setYesterdayMissingSubtext(text + extra);
        }
      } catch {}
    }
  }, [isAdmin, isOps, isHR, yesterdayIso]);

  // 4. Load Non-Management Needs Attention items
  const loadLoggerNeedsAttention = useCallback(async () => {
    if (isAdmin) return;

    // My pending missed punch inquiries
    try {
      const inquiries = await attendanceService.getMyPendingMissedPunchInquiries();
      setMyPendingInquiries(inquiries || []);
    } catch {}

    // Log exceptions inbox (HR, Team lead)
    if (isHR || isLead) {
      try {
        const inbox = await logExceptionService.getInbox();
        setLogExceptionsInboxCount(inbox?.length || 0);
      } catch {}
    }

    // Missing logs via my activity
    if (isLogger) {
      try {
        const act = await dailyLogService.getMyLogActivity(7);
        setMyActivity(act);
      } catch {}

      // Day target
      try {
        const dt = await dailyLogService.getDayTarget(todayIso);
        setDayTarget(dt);
      } catch {}
    }

    // Sales CRM Leads
    if (canAccessCrm(user)) {
      try {
        const leadsRes = await crmService.listLeads({ limit: 50 });
        const items = leadsRes?.items || [];
        const now = Date.now();
        const overdue = items.filter(
          (l) => !l.outcome && l.next_follow_up_at && new Date(l.next_follow_up_at).getTime() < now
        );
        setOverdueFollowupsCount(overdue.length);
        if (overdue.length > 0) {
          setOverdueFollowupsSubtext(
            overdue
              .slice(0, 2)
              .map((l) => l.name || l.company || 'Lead')
              .join(' · ')
          );
        }

        const uncontacted = items.filter((l) => !l.outcome && !l.contacted);
        setUncontactedLeadsCount(uncontacted.length);
        setUncontactedLeadsSubtext(uncontacted.length > 0 ? `${uncontacted.length} awaiting first contact` : '');
      } catch {}
    }

    // Content Calendar Overdue
    if (canAccessContentCalendar(user)) {
      try {
        const itemsRes = await contentCalendarService.getItems();
        const items = itemsRes?.items || [];
        const overdue = items.filter((item: ContentCalendarItem) => getContentCalendarBucket(item) === 'overdue');
        setCalendarOverdueCount(overdue.length);
        if (overdue.length > 0) {
          const first = overdue[0];
          const dateStr = first.publish_date || first.design_due || '';
          setCalendarOverdueSubtext(dateStr ? `Oldest due ${dateStr} · ${first.stage} stage` : `${first.stage} stage`);
        }
      } catch {}
    }

    // Website Tasks Overdue
    if (canAccessWebsitePipeline(user)) {
      try {
        const tasks = await websiteProjectService.getAllTasks({
          assignee_id: isLead ? undefined : user?.id,
        });
        const overdue = (tasks || []).filter((t: any) => {
          return t.due_date && t.due_date < todayIso && t.status !== 'completed' && t.status !== 'done';
        });
        setWebsiteOverdueCount(overdue.length);
      } catch {}
    }
  }, [isAdmin, isHR, isLead, isLogger, user, todayIso]);

  // 5. Load Weekly Stat Strips (Logged & Worked)
  const loadWeeklyStats = useCallback(async () => {
    if (isAdmin) return;

    // Current week Monday through Saturday
    const currentDay = today.getDay(); // 0 = Sun
    const monOffset = (currentDay + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - monOffset);

    const weekDates: { label: string; date: string; isFuture: boolean; isToday: boolean }[] = [];
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isToday = iso === todayIso;
      const isFuture = d > today && !isToday;
      weekDates.push({ label: dayLabels[i], date: iso, isFuture, isToday });
    }

    const startIso = weekDates[0].date;
    const endIso = todayIso;

    // Loggers: fetch logged entries
    if (isLogger && user?.id) {
      try {
        const entries = await dailyLogService.getEntries({
          user_id: user.id,
          start_date: startIso,
          end_date: endIso,
          limit: 500,
        });

        const perDayMap: Record<string, number> = {};
        let total = 0;
        let pastLoggedCount = 0;

        (entries || []).forEach((e) => {
          const hrs = typeof e.hours_utilized === 'number' ? e.hours_utilized : parseFloat(String(e.hours_utilized || 0)) || 0;
          perDayMap[e.date] = (perDayMap[e.date] || 0) + hrs;
        });

        const stripDays: DailyStripDay[] = weekDates.map((wd) => {
          const hrs = perDayMap[wd.date] || 0;
          total += hrs;
          if (!wd.isFuture && hrs > 0) pastLoggedCount++;
          return {
            label: wd.label,
            date: wd.date,
            hours: hrs,
            isFuture: wd.isFuture,
            isToday: wd.isToday,
          };
        });

        setWeeklyLoggedHours(total);
        setWeeklyLoggedDays(stripDays);
        setPastDaysLoggedCount(pastLoggedCount);
      } catch {}
    }

    // Operations: fetch worked timesheet records
    if (isOps) {
      const records = timesheetData?.records || [];
      const perDayMap: Record<string, number> = {};
      let total = 0;
      let pastWorkedCount = 0;

      records.forEach((r) => {
        const hrs = (r.working_hours_minutes || 0) / 60;
        perDayMap[r.date] = hrs;
      });

      const stripDays: DailyStripDay[] = weekDates.map((wd) => {
        const hrs = perDayMap[wd.date] || 0;
        total += hrs;
        if (!wd.isFuture && hrs > 0) pastWorkedCount++;
        return {
          label: wd.label,
          date: wd.date,
          hours: hrs,
          isFuture: wd.isFuture,
          isToday: wd.isToday,
        };
      });

      setWeeklyWorkedHours(total);
      setWeeklyWorkedDays(stripDays);
      setPastDaysWorkedCount(pastWorkedCount);
    }
  }, [isAdmin, isLogger, isOps, user?.id, today, todayIso, timesheetData]);

  // 6. Calculate Month Dots & Present in Month
  useEffect(() => {
    if (isAdmin) return;

    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const todayNum = today.getDate();
    const records = timesheetData?.records || [];
    const recMap = new Map<string, any>();
    records.forEach((r) => recMap.set(r.date, r));

    const dots: MonthDot[] = [];
    let elapsedWorking = 0;
    let lateCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isPastOrToday = day <= todayNum;
      const off = isDateOff(dateStr);

      if (isPastOrToday) {
        if (!off) elapsedWorking++;
        const rec = recMap.get(dateStr);
        if (rec) {
          if (rec.is_late) {
            lateCount++;
            dots.push({ dayNumber: day, status: 'late', dateStr });
          } else if (rec.status === 'present' || rec.status === 'half_day' || rec.status === 'wfh' || rec.check_in) {
            dots.push({ dayNumber: day, status: 'present', dateStr });
          } else {
            dots.push({ dayNumber: day, status: off ? 'off' : 'off', dateStr });
          }
        } else {
          dots.push({ dayNumber: day, status: off ? 'off' : 'upcoming', dateStr });
        }
      } else {
        dots.push({ dayNumber: day, status: off ? 'off' : 'upcoming', dateStr });
      }
    }

    setMonthDots(dots);
    setWorkingDaysElapsed(elapsedWorking);
    setLateStrikes(timesheetData?.summary?.late_count ?? lateCount);
  }, [isAdmin, currentYear, currentMonth, today, timesheetData, isDateOff]);

  // 7. Team Hours (Team lead only, §3b)
  const loadTeamHours = useCallback(async () => {
    if (!isLead) return;
    setIsLoadingTeamHours(true);

    const daysCount = teamHoursRange === '7D' ? 7 : teamHoursRange === '14D' ? 14 : 30;
    const start = new Date(today);
    start.setDate(today.getDate() - (daysCount - 1));
    const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    try {
      const res = await dailyLogService.getTeamHours(startIso, todayIso);
      setTeamHoursMembers(res?.members || []);
      setHasTeamHours404(false);
    } catch (err: any) {
      if (err?.status === 404) {
        setHasTeamHours404(true);
      }
      setTeamHoursMembers([]);
    } finally {
      setIsLoadingTeamHours(false);
    }
  }, [isLead, teamHoursRange, today, todayIso]);

  // 8. My Hours Chart (HR, Members, or Leads with no team, §3c)
  const loadMyHours = useCallback(async () => {
    if (isAdmin || isOps) return;
    if (isLead && !hasTeamHours404 && teamHoursMembers.length > 0) return;

    setIsLoadingMyHours(true);
    const daysCount = myHoursRange === '7D' ? 7 : myHoursRange === '14D' ? 14 : 30;
    const start = new Date(today);
    start.setDate(today.getDate() - (daysCount - 1));
    const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    try {
      // 1. Logged hours
      const entries = await dailyLogService.getEntries({
        user_id: user?.id,
        start_date: startIso,
        end_date: todayIso,
        limit: 1000,
      });

      const loggedMap: Record<string, number> = {};
      (entries || []).forEach((e) => {
        const hrs = typeof e.hours_utilized === 'number' ? e.hours_utilized : parseFloat(String(e.hours_utilized || 0)) || 0;
        loggedMap[e.date] = (loggedMap[e.date] || 0) + hrs;
      });

      // 2. Worked hours from timesheet (query months touched)
      const monthsToFetch = new Set<string>();
      let cur = new Date(start);
      while (cur <= today) {
        monthsToFetch.add(`${cur.getFullYear()}-${cur.getMonth() + 1}`);
        cur.setDate(cur.getDate() + 1);
      }

      const workedMap: Record<string, number> = {};
      for (const ym of monthsToFetch) {
        const [y, m] = ym.split('-').map(Number);
        try {
          const ts = await attendanceService.getMyTimesheet(y, m);
          (ts?.records || []).forEach((r) => {
            workedMap[r.date] = (r.working_hours_minutes || 0) / 60;
          });
        } catch {}
      }

      // Generate day items
      const daysList: MyHoursDay[] = [];
      let iter = new Date(start);
      while (iter <= today) {
        const iso = `${iter.getFullYear()}-${String(iter.getMonth() + 1).padStart(2, '0')}-${String(iter.getDate()).padStart(2, '0')}`;
        const isOff = isDateOff(iso);
        const dayLabel = iter.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) + (isOff ? ' off' : '');

        daysList.push({
          date: iso,
          dayLabel,
          loggedHours: loggedMap[iso] || 0,
          workedHours: workedMap[iso] || 0,
          isOff,
          isToday: iso === todayIso,
        });
        iter.setDate(iter.getDate() + 1);
      }

      setMyHoursDays(daysList);
    } catch {} finally {
      setIsLoadingMyHours(false);
    }
  }, [isAdmin, isOps, isLead, hasTeamHours404, teamHoursMembers.length, myHoursRange, today, todayIso, user?.id, isDateOff]);

  // 9. Load Pipeline Stage Cards (§5)
  const loadPipelineStageCards = useCallback(async () => {
    // 1. Sales Pipeline
    if (isAdmin || canAccessCrm(user)) {
      try {
        const pipeRes = await crmService.getPipeline();
        const stagesList = pipeRes?.stages && pipeRes.stages.length > 0 ? pipeRes.stages : [
          { id: 'new', name: 'New' },
          { id: 'contacted', name: 'Contacted' },
          { id: 'qualified', name: 'Qualified' },
          { id: 'session_booked', name: 'Meeting Booked' },
          { id: 'session_done', name: 'Meeting Completed' },
        ];

        const counts = await Promise.all(
          stagesList.map(async (st: any) => {
            try {
              const res = await crmService.listLeads({ stage: st.id, limit: 1 });
              return { label: st.name, count: res?.total || 0 };
            } catch {
              return { label: st.name, count: 0 };
            }
          })
        );
        setCrmStages(counts);
      } catch {}
    }

    // 2. Content Calendar
    if (isAdmin || canAccessContentCalendar(user)) {
      try {
        const visibleStages = visiblePipelineStages(user).filter((s) => s !== 'Posted');
        const calRes = await contentCalendarService.getItems();

        if (isAdmin || isLead) {
          const countsMap = calRes?.stages_count || {};
          const counts: StageItem[] = visibleStages.map((st) => ({
            label: st,
            count: countsMap[st] || 0,
          }));
          setContentStages(counts);
        } else {
          // Member: count own assigned items
          const myItems = (calRes?.items || []).filter(
            (i: ContentCalendarItem) => i.assignee_id === user?.id || (i as any).design_owner === user?.id
          );
          const counts: StageItem[] = visibleStages.map((st) => ({
            label: st,
            count: myItems.filter((i) => i.stage === st).length,
          }));
          setContentStages(counts);
        }
      } catch {}
    }

    // 3. Website Pipeline
    if (isAdmin || canAccessWebsitePipeline(user)) {
      try {
        const allStages: { id: string; name: string }[] = [
          { id: 'strategy', name: 'Strategy' },
          { id: 'content', name: 'Content' },
          { id: 'design', name: 'Design' },
          { id: 'assets', name: 'Creative Assets' },
          { id: 'development', name: 'Development' },
          { id: 'qa', name: 'Internal QA' },
          { id: 'client_review', name: 'Client Review' },
          { id: 'production', name: 'Production' },
        ];

        const projectsRes = await websiteProjectService.getProjects();

        let scopedProjects: WebsiteProject[] = projectsRes?.items || [];
        if (isMember) {
          // Member: manager or assigned tasks
          const tasks = await websiteProjectService.getAllTasks({ assignee_id: user?.id });
          const taskProjectIds = new Set((tasks || []).map((t: any) => t.project_id));
          scopedProjects = scopedProjects.filter(
            (p: WebsiteProject) => p.manager_id === user?.id || taskProjectIds.has(p.id)
          );
        }

        const countsMap: Record<string, number> = {};
        scopedProjects.forEach((p: WebsiteProject) => {
          countsMap[p.stage] = (countsMap[p.stage] || 0) + 1;
        });

        const counts: StageItem[] = allStages.map((st) => ({
          label: st.name,
          count: countsMap[st.id] || 0,
        }));
        setWebsiteStages(counts);
      } catch {}
    }
  }, [isAdmin, user, isLead, isMember]);

  // Initial trigger effects
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      loadAttendance(),
      loadMatrix(),
      loadManagementData(),
      loadLoggerNeedsAttention(),
      loadWeeklyStats(),
      loadPipelineStageCards(),
      isLead ? loadTeamHours() : Promise.resolve(),
      loadMyHours(),
    ]).finally(() => {
      if (active) {
        setIsGateReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [
    loadAttendance,
    loadMatrix,
    loadManagementData,
    loadLoggerNeedsAttention,
    loadWeeklyStats,
    loadPipelineStageCards,
    isLead,
    loadTeamHours,
    loadMyHours,
  ]);

  // Working days left calculation for header
  const { workingDaysLeft, totalWorkingDaysInWeek } = useMemo(() => {
    const currentDay = today.getDay(); // 0 = Sun
    const monOffset = (currentDay + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - monOffset);

    let total = 0;
    let left = 0;

    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const off = isDateOff(iso);
      if (!off) {
        total++;
        if (d >= today || iso === todayIso) {
          left++;
        }
      }
    }

    return { workingDaysLeft: left, totalWorkingDaysInWeek: total || 6 };
  }, [today, todayIso, isDateOff]);

  // Greeting
  const greeting = useMemo(() => {
    const hr = today.getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  }, [today]);

  const firstName = user?.full_name?.split(' ')[0] || user?.name?.split(' ')[0] || 'User';

  const roleSubtitle = useMemo(() => {
    if (isAdmin) return 'Admin';
    if (isOps) return 'Operations';
    if (isHR) return 'HR';
    if (isLead) {
      const count = teamHoursMembers.length;
      return `${user?.department || 'Department'} team lead${count > 0 ? ` · ${count} people` : ''}`;
    }
    return user?.department || 'Team member';
  }, [isAdmin, isOps, isHR, isLead, user?.department, teamHoursMembers.length]);

  const formattedHeaderDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Date range label for charts
  const chartDateRangeLabel = useMemo(() => {
    const activeRange = isLead && teamHoursMembers.length > 0 ? teamHoursRange : myHoursRange;
    const daysCount = activeRange === '7D' ? 7 : activeRange === '14D' ? 14 : 30;
    const start = new Date(today);
    start.setDate(today.getDate() - (daysCount - 1));

    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, [isLead, teamHoursMembers.length, teamHoursRange, myHoursRange, today]);

  // Construct Needs Attention list (§4)
  const needsAttentionItems = useMemo((): NeedsAttentionItem[] => {
    const list: NeedsAttentionItem[] = [];

    // 1. Requests awaiting approval (Admin, Ops, HR)
    if ((isAdmin || isOps || isHR) && pendingRequests.length > 0) {
      const leaveCount = pendingRequests.filter((r) => r.request_type === 'leave').length;
      const wfhCount = pendingRequests.filter((r) => r.request_type === 'wfh').length;
      const otCount = pendingRequests.filter((r) => r.request_type === 'overtime').length;
      const parts = [];
      if (leaveCount) parts.push(`${leaveCount} leave`);
      if (wfhCount) parts.push(`${wfhCount} WFH`);
      if (otCount) parts.push(`${otCount} overtime`);

      list.push({
        id: 'pending_requests',
        icon: ClipboardList,
        title: `${pendingRequests.length} requests awaiting approval`,
        subtitle: parts.length > 0 ? parts.join(' · ') : 'Review leave and attendance requests',
        actionLabel: 'Open',
        onAction: () => onNavigateView('attendance'),
      });
    }

    // 2. Missed punch inquiries to review (Admin, Ops, HR)
    if ((isAdmin || isOps || isHR) && missedInquiries.length > 0) {
      list.push({
        id: 'missed_inquiries_mgmt',
        icon: Fingerprint,
        title: `${missedInquiries.length} missed punch inquiries to review`,
        subtitle: missedInquiries[0]?.created_at ? `Oldest from ${missedInquiries[0].created_at.slice(5, 10)}` : 'Review pending employee inquiries',
        actionLabel: 'Review',
        onAction: () => onNavigateView('attendance'),
      });
    }

    // 3. People missing yesterday's log (Admin only)
    if (isAdmin && yesterdayMissingLogCount > 0) {
      list.push({
        id: 'admin_missing_log_yesterday',
        icon: FileWarning,
        title: `${yesterdayMissingLogCount} people missing yesterday's log`,
        subtitle: yesterdayMissingSubtext || 'Unlogged working hours yesterday',
        actionLabel: 'Review',
        onAction: () => onNavigateView('admin'),
      });
    }

    // 4. Log exceptions inbox (HR, Team lead)
    if ((isHR || isLead) && logExceptionsInboxCount > 0) {
      list.push({
        id: 'log_exceptions_inbox',
        icon: AlertCircle,
        title: `${logExceptionsInboxCount} log exceptions to review`,
        subtitle: "Hours don't match time at work",
        actionLabel: 'Open',
        onAction: () => onNavigateView('exceptions'),
      });
    }

    // 5. My pending missed-punch inquiry (Ops, HR, Lead, Member)
    if (!isAdmin && myPendingInquiries.length > 0) {
      const inq = myPendingInquiries[0];
      list.push({
        id: 'my_pending_inquiry',
        icon: Clock,
        title: `Your missed punch inquiry for ${inq.date || todayIso}`,
        subtitle: 'Waiting for HR response',
        actionLabel: 'View',
        onAction: () => onNavigateView('attendance'),
      });
    }

    // 6. Overdue follow-ups & uncontacted leads (Sales)
    if (overdueFollowupsCount > 0) {
      list.push({
        id: 'overdue_followups',
        icon: Phone,
        title: `${overdueFollowupsCount} follow-ups overdue`,
        subtitle: overdueFollowupsSubtext || 'Overdue CRM client follow-ups',
        actionLabel: 'Open',
        onAction: () => onNavigateView('crm'),
      });
    }
    if (uncontactedLeadsCount > 0) {
      list.push({
        id: 'uncontacted_leads',
        icon: Phone,
        title: `${uncontactedLeadsCount} uncontacted leads`,
        subtitle: uncontactedLeadsSubtext || 'New incoming leads waiting for touch',
        actionLabel: 'Open',
        onAction: () => onNavigateView('crm'),
      });
    }

    // 7. Calendar items overdue (Content / Creative / Social)
    if (calendarOverdueCount > 0) {
      list.push({
        id: 'calendar_overdue',
        icon: Calendar,
        title: `${calendarOverdueCount} calendar items overdue`,
        subtitle: calendarOverdueSubtext || 'Campaign content behind schedule',
        actionLabel: 'Open',
        onAction: () => onNavigateView('content-calendar'),
      });
    }

    // 8. Website tasks overdue (Website / SEO)
    if (websiteOverdueCount > 0) {
      list.push({
        id: 'website_overdue',
        icon: Globe,
        title: `${websiteOverdueCount} website tasks overdue`,
        subtitle: 'Pending project milestones',
        actionLabel: 'Open',
        onAction: () => onNavigateView('website-pipeline'),
      });
    }

    // 9. Missing log for <date> (HR, Lead, Member)
    if (isLogger && myActivity?.missing_dates && myActivity.missing_dates.length > 0) {
      const missingDate = myActivity.missing_dates[0];
      list.push({
        id: 'my_missing_log',
        icon: FileText,
        title: `Missing log for ${missingDate}`,
        subtitle: 'Working hours recorded, nothing logged',
        actionLabel: 'Log',
        onAction: () => onNavigateView('daily-log'),
      });
    }

    return list;
  }, [
    isAdmin,
    isOps,
    isHR,
    isLead,
    isLogger,
    pendingRequests,
    missedInquiries,
    yesterdayMissingLogCount,
    yesterdayMissingSubtext,
    logExceptionsInboxCount,
    myPendingInquiries,
    overdueFollowupsCount,
    overdueFollowupsSubtext,
    uncontactedLeadsCount,
    uncontactedLeadsSubtext,
    calendarOverdueCount,
    calendarOverdueSubtext,
    websiteOverdueCount,
    myActivity,
    todayIso,
    onNavigateView,
  ]);

  // Department categories for leads & members
  const deptCategories = useMemo(() => getDepartmentCategories(user), [user]);

  // Gate Loading Skeleton
  if (!isGateReady) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title={`${greeting}, ${firstName}`}
          description={`${formattedHeaderDate} · ${roleSubtitle} · ${workingDaysLeft} of ${totalWorkingDaysInWeek} working days left this week`}
        />
        <DashboardSkeleton role={role} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={`${formattedHeaderDate} · ${roleSubtitle} · ${workingDaysLeft} of ${totalWorkingDaysInWeek} working days left this week`}
        actions={
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigateView('attendance')}
                  icon={Clock}
                >
                  Daily attendance
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigateView('admin')}
                  icon={ShieldCheck}
                >
                  Log compliance
                </Button>
              </>
            ) : isOps ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setRequestModalTab('leave');
                  setIsRequestModalOpen(true);
                }}
                icon={CalendarCheck}
              >
                Request leave
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRequestModalTab('leave');
                    setIsRequestModalOpen(true);
                  }}
                  icon={CalendarCheck}
                >
                  Request leave
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onNavigateView('daily-log')}
                  icon={Plus}
                >
                  Log work
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* =========================================================================
          ROLE: ADMIN
          Row 1: Team daily attendance (span 2) · Needs attention + Log compliance (col 3)
          Row 2: Sales pipeline · Content calendar · Website pipeline (3 stage cards)
         ========================================================================= */}
      {isAdmin && (
        <div className="space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
            <TeamDailyAttendanceCard
              matrixData={matrixData}
              isLoading={isLoadingAttendance}
              onNavigateView={onNavigateView}
              className="lg:col-span-2"
            />
            <div className="flex flex-col gap-4">
              <NeedsAttentionCard
                items={needsAttentionItems}
                onNavigateView={onNavigateView}
              />
              <LogComplianceCard
                snapshot={weekSnapshot}
                isLoading={false}
                onNavigateView={onNavigateView}
              />
            </div>
          </div>

          {/* Row 2: Stage cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StageCountCard
              title="Sales pipeline"
              subtitle="leads by stage"
              linkText="Open board"
              onNavigate={() => onNavigateView('crm')}
              stages={crmStages}
            />
            <StageCountCard
              title="Content calendar"
              subtitle="items by stage"
              linkText="Open calendar"
              onNavigate={() => onNavigateView('content-calendar')}
              stages={contentStages}
            />
            <StageCountCard
              title="Website pipeline"
              subtitle="projects by stage"
              linkText="Open pipeline"
              onNavigate={() => onNavigateView('website-pipeline')}
              stages={websiteStages}
            />
          </div>
        </div>
      )}

      {/* =========================================================================
          ROLE: OPERATIONS
          Row 1: At work this week · Present in <Month> · Your day (no Log work)
          Row 2: Needs attention (span 3 / full width)
         ========================================================================= */}
      {isOps && (
        <div className="space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
            <AtWorkThisWeekCard
              totalHours={weeklyWorkedHours}
              pastDaysAtWork={pastDaysWorkedCount}
              pastDaysTotal={4}
              todayInProgress={Boolean(todayAttendance?.record?.check_in && !todayAttendance?.record?.check_out)}
              days={weeklyWorkedDays}
              isLoading={isLoadingAttendance}
            />
            <PresentInMonthCard
              monthName={monthName}
              daysPresent={timesheetData?.summary?.days_present ?? 0}
              workingDaysElapsed={workingDaysElapsed}
              lateStrikes={lateStrikes}
              isLateToday={Boolean(todayAttendance?.record?.is_late)}
              dots={monthDots}
              isLoading={isLoadingAttendance}
            />
            <EmployeePunchCard
              variant="your-day"
              todayData={todayAttendance}
              isLoading={isLoadingAttendance}
              onRefresh={loadAttendance}
              onOpenRequestModal={(tab) => {
                setRequestModalTab(tab || 'leave');
                setIsRequestModalOpen(true);
              }}
              onNavigateView={onNavigateView}
            />
          </div>

          {/* Row 2: Full-width Needs attention */}
          <NeedsAttentionCard
            items={needsAttentionItems}
            onNavigateView={onNavigateView}
            className="w-full"
          />
        </div>
      )}

      {/* =========================================================================
          ROLE: HR
          Row 1: Logged this week · Present in <Month> · Your day
          Row 2: My hours (span 2) · Needs attention
          Row 3: Attendance today · Approval inbox (span 2)
         ========================================================================= */}
      {isHR && (
        <div className="space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
            <LoggedThisWeekCard
              totalHours={weeklyLoggedHours}
              pastDaysLogged={pastDaysLoggedCount}
              pastDaysTotal={4}
              days={weeklyLoggedDays}
              isLoading={isLoadingAttendance}
            />
            <PresentInMonthCard
              monthName={monthName}
              daysPresent={timesheetData?.summary?.days_present ?? 0}
              workingDaysElapsed={workingDaysElapsed}
              lateStrikes={lateStrikes}
              isLateToday={Boolean(todayAttendance?.record?.is_late)}
              dots={monthDots}
              isLoading={isLoadingAttendance}
            />
            <EmployeePunchCard
              variant="your-day"
              todayData={todayAttendance}
              isLoading={isLoadingAttendance}
              onRefresh={loadAttendance}
              loggedHours={dayTarget?.logged_hours}
              expectedHours={dayTarget?.expected_hours}
              onOpenRequestModal={(tab) => {
                setRequestModalTab(tab || 'leave');
                setIsRequestModalOpen(true);
              }}
              onNavigateView={onNavigateView}
            />
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
            <MyHoursChart
              days={myHoursDays}
              range={myHoursRange}
              onRangeChange={setMyHoursRange}
              dateRangeLabel={chartDateRangeLabel}
              isLoading={isLoadingMyHours}
              className="lg:col-span-2"
            />
            <NeedsAttentionCard
              items={needsAttentionItems}
              onNavigateView={onNavigateView}
            />
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
            <HrAttendanceTodayCard
              matrixData={matrixData}
              isLoading={false}
              onNavigateView={onNavigateView}
            />
            <HrApprovalInboxCard
              requests={pendingRequests}
              isLoading={false}
              onNavigateView={onNavigateView}
              onOpenReview={(req) => {
                setRequestModalTab((req.request_type as any) || 'leave');
                setIsRequestModalOpen(true);
              }}
              className="lg:col-span-2"
            />
          </div>
        </div>
      )}

      {/* =========================================================================
          ROLE: TEAM LEAD
          Row 1: Logged · Present · Your day
          Row 2: Team hours (span 2, or My hours if 0 members) · Needs attention
          Row 3: Department stage-count card(s), full width
         ========================================================================= */}
      {isLead && (
        <div className="space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
            <LoggedThisWeekCard
              totalHours={weeklyLoggedHours}
              pastDaysLogged={pastDaysLoggedCount}
              pastDaysTotal={4}
              days={weeklyLoggedDays}
              isLoading={isLoadingAttendance}
            />
            <PresentInMonthCard
              monthName={monthName}
              daysPresent={timesheetData?.summary?.days_present ?? 0}
              workingDaysElapsed={workingDaysElapsed}
              lateStrikes={lateStrikes}
              isLateToday={Boolean(todayAttendance?.record?.is_late)}
              dots={monthDots}
              isLoading={isLoadingAttendance}
            />
            <EmployeePunchCard
              variant="your-day"
              todayData={todayAttendance}
              isLoading={isLoadingAttendance}
              onRefresh={loadAttendance}
              loggedHours={dayTarget?.logged_hours}
              expectedHours={dayTarget?.expected_hours}
              onOpenRequestModal={(tab) => {
                setRequestModalTab(tab || 'leave');
                setIsRequestModalOpen(true);
              }}
              onNavigateView={onNavigateView}
            />
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
            {teamHoursMembers.length > 0 && !hasTeamHours404 ? (
              <TeamHoursChart
                members={teamHoursMembers}
                range={teamHoursRange}
                onRangeChange={setTeamHoursRange}
                dateRangeLabel={chartDateRangeLabel}
                onNavigateView={onNavigateView}
                isLoading={isLoadingTeamHours}
                className="lg:col-span-2"
              />
            ) : (
              <MyHoursChart
                days={myHoursDays}
                range={myHoursRange}
                onRangeChange={setMyHoursRange}
                dateRangeLabel={chartDateRangeLabel}
                isLoading={isLoadingMyHours}
                className="lg:col-span-2"
              />
            )}
            <NeedsAttentionCard
              items={needsAttentionItems}
              onNavigateView={onNavigateView}
            />
          </div>

          {/* Row 3: Full-width department cards */}
          {deptCategories.includes('content') && (
            <StageCountCard
              title="Content calendar"
              subtitle="your department's stages"
              linkText="Open calendar"
              onNavigate={() => onNavigateView('content-calendar')}
              stages={contentStages}
              layout="two-col"
            />
          )}
          {deptCategories.includes('sales') && (
            <StageCountCard
              title="Sales pipeline"
              subtitle="team leads + unassigned"
              linkText="Open board"
              onNavigate={() => onNavigateView('crm')}
              stages={crmStages}
              layout="two-col"
            />
          )}
          {deptCategories.includes('website') && (
            <StageCountCard
              title="Website pipeline"
              subtitle="your department's stages"
              linkText="Open pipeline"
              onNavigate={() => onNavigateView('website-pipeline')}
              stages={websiteStages}
              layout="two-col"
            />
          )}
        </div>
      )}

      {/* =========================================================================
          ROLE: TEAM MEMBER
          Row 1: Logged · Present · Your day
          Row 2: My hours (span 2) · Needs attention
          Row 3: Department stage-count card, full width (own items)
         ========================================================================= */}
      {isMember && (
        <div className="space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
            <LoggedThisWeekCard
              totalHours={weeklyLoggedHours}
              pastDaysLogged={pastDaysLoggedCount}
              pastDaysTotal={4}
              days={weeklyLoggedDays}
              isLoading={isLoadingAttendance}
            />
            <PresentInMonthCard
              monthName={monthName}
              daysPresent={timesheetData?.summary?.days_present ?? 0}
              workingDaysElapsed={workingDaysElapsed}
              lateStrikes={lateStrikes}
              isLateToday={Boolean(todayAttendance?.record?.is_late)}
              dots={monthDots}
              isLoading={isLoadingAttendance}
            />
            <EmployeePunchCard
              variant="your-day"
              todayData={todayAttendance}
              isLoading={isLoadingAttendance}
              onRefresh={loadAttendance}
              loggedHours={dayTarget?.logged_hours}
              expectedHours={dayTarget?.expected_hours}
              onOpenRequestModal={(tab) => {
                setRequestModalTab(tab || 'leave');
                setIsRequestModalOpen(true);
              }}
              onNavigateView={onNavigateView}
            />
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
            <MyHoursChart
              days={myHoursDays}
              range={myHoursRange}
              onRangeChange={setMyHoursRange}
              dateRangeLabel={chartDateRangeLabel}
              isLoading={isLoadingMyHours}
              className="lg:col-span-2"
            />
            <NeedsAttentionCard
              items={needsAttentionItems}
              onNavigateView={onNavigateView}
            />
          </div>

          {/* Row 3: Full-width department card (own items) */}
          {deptCategories.includes('sales') && (
            <StageCountCard
              title="Sales pipeline"
              subtitle="my leads + unassigned"
              linkText="Open board"
              onNavigate={() => onNavigateView('crm')}
              stages={crmStages}
              layout="two-col"
            />
          )}
          {deptCategories.includes('content') && (
            <StageCountCard
              title="Content calendar"
              subtitle="my assigned items"
              linkText="Open calendar"
              onNavigate={() => onNavigateView('content-calendar')}
              stages={contentStages}
              layout="two-col"
            />
          )}
          {deptCategories.includes('website') && (
            <StageCountCard
              title="Website pipeline"
              subtitle="my projects & tasks"
              linkText="Open pipeline"
              onNavigate={() => onNavigateView('website-pipeline')}
              stages={websiteStages}
              layout="two-col"
            />
          )}
        </div>
      )}

      {/* Leave Request Management Modal */}
      {isRequestModalOpen && (
        <RequestManagementModal
          isOpen={isRequestModalOpen}
          onClose={() => {
            setIsRequestModalOpen(false);
          }}
          defaultTab={requestModalTab}
          onSuccess={() => {
            loadAttendance();
            loadManagementData();
          }}
        />
      )}
    </div>
  );
};
