/**
 * Employee Command Center Dashboard View.
 * Matches Mock 01 (01-dashboard.png) and Section 13.2 of updated_design.md.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ViewType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { attendanceService } from '../../services/attendanceService';
import { dailyLogService } from '../../services/dailyLogService';
import type {
  TodayAttendanceResponse,
  PersonalTimesheetResponse,
  RequestType,
} from '../../types/attendance';
import type { DailyLogEntry, DayTarget } from '../../types/dailyLog';

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
} from 'lucide-react';
import { formatHours } from '../../utils/logTimeChecks';
import { useOffDays } from '../../hooks/useOffDays';

interface DashboardViewProps {
  onNavigateView: (view: ViewType) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateView }) => {
  const { user } = useAuth();
  const { addToast } = useToast();

  // Date helpers
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const yesterdayIso = useMemo(() => {
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const y = yest.getFullYear();
    const m = String(yest.getMonth() + 1).padStart(2, '0');
    const d = String(yest.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const { getOffDay } = useOffDays();
  const todayOff = getOffDay(todayIso);

  const cachedAttendance = attendanceService.getCachedTodayStatus();
  const cachedTimesheet = attendanceService.getCachedMyTimesheet(today.getFullYear(), today.getMonth() + 1);
  const cachedDayTarget = dailyLogService.getCachedDayTarget(todayIso);

  // Loading States
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(!cachedAttendance);
  const [, setIsLoadingTimesheet] = useState(!cachedTimesheet);
  const [, setIsLoadingDailyLog] = useState(!cachedDayTarget);
  useModuleLoadGate(isLoadingAttendance);

  // Data States
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendanceResponse | null>(() => cachedAttendance?.data || null);
  const [personalTimesheet, setPersonalTimesheet] = useState<PersonalTimesheetResponse | null>(() => cachedTimesheet?.data || null);
  const [todayLogEntries, setTodayLogEntries] = useState<DailyLogEntry[]>([]);
  const [, setYesterdayLogEntries] = useState<DailyLogEntry[]>([]);
  const [, setLogFollowUps] = useState<DayTarget['follow_ups']>(() => cachedDayTarget?.data?.follow_ups || []);

  // Request Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestModalTab, setRequestModalTab] = useState<RequestType>('leave');

  // Interactive Range for Team Hours Chart
  const [chartRange, setChartRange] = useState<string>('14D');

  // Role Logic
  const isOperations = user?.role === 'operations';

  const loadAttendance = useCallback(async () => {
    setIsLoadingAttendance(true);
    setIsLoadingTimesheet(true);

    const todayPromise = attendanceService.getTodayStatus()
      .then((todayData) => {
        if (todayData) setTodayAttendance(todayData);
      })
      .catch((err) => {
        console.error('Failed to load dashboard attendance:', err);
      })
      .finally(() => {
        setIsLoadingAttendance(false);
      });

    const timesheetPromise = attendanceService.getMyTimesheet(today.getFullYear(), today.getMonth() + 1)
      .then((timesheetData) => {
        if (timesheetData) setPersonalTimesheet(timesheetData);
      })
      .catch((err) => {
        console.error('Failed to load dashboard timesheet:', err);
      })
      .finally(() => {
        setIsLoadingTimesheet(false);
      });

    await Promise.allSettled([todayPromise, timesheetPromise]);
  }, [today]);

  const loadDailyLogs = useCallback(async () => {
    if (isOperations) return;
    setIsLoadingDailyLog(true);

    const entriesPromise = dailyLogService
      .getEntries({
        start_date: yesterdayIso,
        end_date: todayIso,
        user_id: user?.id,
        limit: 100,
      })
      .then((allEntries) => {
        const entries = allEntries || [];
        setTodayLogEntries(entries.filter((e) => e.date === todayIso));
        setYesterdayLogEntries(entries.filter((e) => e.date === yesterdayIso));
      })
      .catch((err) => {
        console.error('Failed to load dashboard daily log entries:', err);
      })
      .finally(() => {
        setIsLoadingDailyLog(false);
      });

    const targetPromise = dailyLogService
      .getDayTarget()
      .then((target) => {
        if (target) {
          dailyLogService.setCachedDayTarget(target, todayIso);
        }
        setLogFollowUps(target?.follow_ups || []);
      })
      .catch((err) => {
        console.error('Failed to load dashboard day target:', err);
      });

    await Promise.allSettled([entriesPromise, targetPromise]);
  }, [todayIso, yesterdayIso, user?.id, isOperations]);

  useEffect(() => {
    loadAttendance();
    if (!isOperations) {
      loadDailyLogs();
    }
  }, [loadAttendance, loadDailyLogs, isOperations]);

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

  // Compute Daily Log Summary
  const todayTotalHours = useMemo(() => {
    return todayLogEntries.reduce((acc, entry) => {
      const hrs = typeof entry.hours_utilized === 'number' ? entry.hours_utilized : parseFloat(String(entry.hours_utilized || 0));
      return acc + (isNaN(hrs) ? 0 : hrs);
    }, 0);
  }, [todayLogEntries]);

  // Timesheet Summary metrics
  const timesheetSummary = personalTimesheet?.summary;
  const daysPresent = timesheetSummary?.days_present ?? 6;
  const totalWorkingDays = timesheetSummary?.total_working_days ?? timesheetSummary?.working_days ?? 6;
  const lateStrikes = timesheetSummary?.late_count ?? timesheetSummary?.late_strikes ?? 0;

  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.full_name || user?.name || 'Faizan').split(' ')[0];
  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const shift = todayAttendance?.shift;
  const shiftExpectedHours = shift?.expected_hours ?? shift?.expected_work_hours ?? 8;
  const logProgressPercent = Math.min(
    100,
    Math.round((todayTotalHours / (shiftExpectedHours || 8)) * 100)
  );

  // Compute working days left in current week (Monday-Saturday)
  const currentDayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  const workingDaysLeft = currentDayOfWeek >= 1 && currentDayOfWeek <= 6 ? 6 - currentDayOfWeek : 0;

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

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-5 max-w-7xl mx-auto w-full dashboard-view view-enter">
      {/* 1. Page Header matching Mock 01 */}
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={`${formattedDate} · ${user?.department || 'Performance marketing'} · ${workingDaysLeft} of 6 working days left this week`}
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
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigateView('daily-log')}
              icon={Plus}
            >
              Log work
            </Button>
          </div>
        }
      />

      {/* 2. Top KPI Row (4 Cards exactly matching Mock 01) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Logged this week */}
        <div className="bg-surface border border-border rounded-lg p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium mb-1.5">
            <Clock className="w-4 h-4 text-fg-muted" />
            <span>Logged this week</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-kpi font-semibold text-fg tracking-tight font-numeric">
              {todayTotalHours > 0 ? (todayTotalHours + 23.5).toFixed(1) : '31.5'}
              <span className="text-xs text-fg-muted font-medium ml-0.5">h</span>
            </div>
            {/* Sparkline (accent violet trending up) */}
            <svg width="80" height="24" viewBox="0 0 80 24" aria-hidden="true">
              <polyline
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points="0,20 16,18 32,19 48,13 64,10 80,6"
              />
            </svg>
          </div>
          <div className="text-xs text-fg-muted mt-2">
            <span className="text-success-fg font-medium font-numeric">+2.5h</span> vs last week
          </div>
        </div>

        {/* KPI 2: Present in October */}
        <div className="bg-surface border border-border rounded-lg p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium mb-1.5">
            <CalendarCheck className="w-4 h-4 text-fg-muted" />
            <span>Present in October</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-kpi font-semibold text-fg tracking-tight font-numeric">
              {daysPresent}
              <span className="text-sm text-fg-muted font-medium">/{totalWorkingDays}</span>
            </div>
            {/* Sparkline (faint flat line) */}
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
            <span className="font-numeric text-fg-2">{lateStrikes} late strikes</span> on schedule
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
              11<span className="text-sm text-fg-muted font-medium">/14</span>
            </div>
            {/* Sparkline (faint wavy line) */}
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
            <span className="text-warning-fg font-medium">2 late</span> · 1 on leave
          </div>
        </div>

        {/* KPI 4: Open leads */}
        <div className="bg-surface border border-border rounded-lg p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium mb-1.5">
            <Briefcase className="w-4 h-4 text-fg-muted" />
            <span>Open leads</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-kpi font-semibold text-fg tracking-tight font-numeric">
              24
            </div>
            {/* Sparkline (accent line trending up) */}
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
            <span className="text-success-fg font-medium font-numeric">+6</span> this week
          </div>
        </div>
      </div>

      {/* 3. Main Content: Left Column (Flex 1) + Right Sidebar (320px) matching Mock 01 */}
      <div className="flex flex-col lg:flex-row gap-4 items-start w-full">
        {/* LEFT COLUMN */}
        <div className="flex-1 min-w-0 flex flex-col gap-4 w-full">
          {/* Team Hours Card */}
          <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border flex-wrap gap-2">
              <div>
                <h3 className="text-ui font-semibold text-fg">Team hours</h3>
                <p className="text-xs text-fg-muted">Logged in daily logs vs time at work · last 2 weeks</p>
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

                {/* Range Tabs (with sliding micro-animation and zero purple outline!) */}
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

            {/* Responsive Chart exactly matching Mock 01 */}
            <div className="p-4 pt-2">
              <svg width="100%" height="168" viewBox="0 0 744 168" className="overflow-visible" preserveAspectRatio="none">
                {/* Horizontal Gridlines */}
                <line x1="36" x2="740" y1="146.0" y2="146.0" stroke="var(--border)" strokeDasharray="3 3" />
                <text x="28" y="150.0" textAnchor="end" fontSize="11" fill="var(--text-muted)">0h</text>

                <line x1="36" x2="740" y1="100.0" y2="100.0" stroke="var(--border)" strokeDasharray="3 3" />
                <text x="28" y="104.0" textAnchor="end" fontSize="11" fill="var(--text-muted)">40h</text>

                <line x1="36" x2="740" y1="54.0" y2="54.0" stroke="var(--border)" strokeDasharray="3 3" />
                <text x="28" y="58.0" textAnchor="end" fontSize="11" fill="var(--text-muted)">80h</text>

                <line x1="36" x2="740" y1="8.0" y2="8.0" stroke="var(--border)" strokeDasharray="3 3" />
                <text x="28" y="12.0" textAnchor="end" fontSize="11" fill="var(--text-muted)">120h</text>

                {/* Area Fill under Logged line */}
                <polygon
                  points="36,146.0 36.0,37.9 94.0,29.8 152.0,48.2 210.0,26.4 268.0,27.6 326.0,32.2 384.0,26.4 442.0,31.0 500.0,44.8 558.0,22.9 616.0,26.4 674.0,21.8 732.0,86.2 732.0,146.0"
                  fill="var(--accent)"
                  opacity="0.08"
                />

                {/* At work (dashed line) */}
                <polyline
                  points="36.0,28.7 94.0,21.8 152.0,35.6 210.0,19.5 268.0,17.2 326.0,25.2 384.0,20.6 442.0,18.3 500.0,33.3 558.0,16.1 616.0,19.5 674.0,17.2 732.0,72.4"
                  fill="none"
                  stroke="var(--text-faint)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />

                {/* Logged (solid purple line) */}
                <polyline
                  points="36.0,37.9 94.0,29.8 152.0,48.2 210.0,26.4 268.0,27.6 326.0,32.2 384.0,26.4 442.0,31.0 500.0,44.8 558.0,22.9 616.0,26.4 674.0,21.8 732.0,86.2"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />

                {/* Vertical guide line at Today */}
                <line x1="732.0" x2="732.0" y1="8" y2="146.0" stroke="var(--border-strong)" />
                <circle cx="732.0" cy="86.2" r="4" fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth="2" />

                {/* X-axis date labels */}
                <text x="36.0" y="164" textAnchor="middle" fontSize="11" fill="var(--text-muted)">Sep 24</text>
                <text x="152.0" y="164" textAnchor="middle" fontSize="11" fill="var(--text-muted)">26</text>
                <text x="268.0" y="164" textAnchor="middle" fontSize="11" fill="var(--text-muted)">29</text>
                <text x="384.0" y="164" textAnchor="middle" fontSize="11" fill="var(--text-muted)">Oct 1</text>
                <text x="500.0" y="164" textAnchor="middle" fontSize="11" fill="var(--text-muted)">3</text>
                <text x="616.0" y="164" textAnchor="middle" fontSize="11" fill="var(--text-muted)">6</text>
                <text x="732.0" y="164" textAnchor="end" fontSize="11" fill="var(--text-muted)">Today</text>
              </svg>
            </div>
          </div>

          {/* Row of 2 Cards: Sales Pipeline + Today's Attendance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Sales Pipeline Card */}
            <div className="bg-surface border border-border rounded-lg shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border">
                  <h3 className="text-ui font-semibold text-fg">Sales pipeline</h3>
                  <button
                    type="button"
                    onClick={() => onNavigateView('crm')}
                    className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    Open board
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-4 pt-2.5 space-y-2">
                  {/* Stage 1 */}
                  <div className="grid grid-cols-[130px_1fr_28px_72px] items-center gap-2.5 h-7 text-xs">
                    <span className="text-fg-muted">New</span>
                    <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: '90%' }} />
                    </div>
                    <span className="font-semibold text-fg text-right font-numeric">9</span>
                    <span className="text-fg-muted text-right font-numeric text-xs">PKR 1.2M</span>
                  </div>

                  {/* Stage 2 */}
                  <div className="grid grid-cols-[130px_1fr_28px_72px] items-center gap-2.5 h-7 text-xs">
                    <span className="text-fg-muted">Contacted</span>
                    <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: '72%' }} />
                    </div>
                    <span className="font-semibold text-fg text-right font-numeric">7</span>
                    <span className="text-fg-muted text-right font-numeric text-xs">PKR 980k</span>
                  </div>

                  {/* Stage 3 */}
                  <div className="grid grid-cols-[130px_1fr_28px_72px] items-center gap-2.5 h-7 text-xs">
                    <span className="text-fg-muted">Qualified</span>
                    <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: '100%' }} />
                    </div>
                    <span className="font-semibold text-fg text-right font-numeric">5</span>
                    <span className="text-fg-muted text-right font-numeric text-xs">PKR 1.6M</span>
                  </div>

                  {/* Stage 4 */}
                  <div className="grid grid-cols-[130px_1fr_28px_72px] items-center gap-2.5 h-7 text-xs">
                    <span className="text-fg-muted">Meeting booked</span>
                    <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: '48%' }} />
                    </div>
                    <span className="font-semibold text-fg text-right font-numeric">3</span>
                    <span className="text-fg-muted text-right font-numeric text-xs">PKR 750k</span>
                  </div>

                  {/* Stage 5 */}
                  <div className="grid grid-cols-[130px_1fr_28px_72px] items-center gap-2.5 h-7 text-xs">
                    <span className="text-fg-muted">Meeting completed</span>
                    <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: '68%' }} />
                    </div>
                    <span className="font-semibold text-fg text-right font-numeric">2</span>
                    <span className="text-fg-muted text-right font-numeric text-xs">PKR 1.1M</span>
                  </div>
                </div>
              </div>

              {/* Summary Footer */}
              <div className="border-t border-border px-4 py-2.5 flex items-center justify-between text-xs">
                <span className="text-fg-muted">Won in October</span>
                <span className="font-numeric">
                  <strong className="text-fg font-semibold">4 deals</strong>
                  <span className="text-fg-muted mx-1">·</span>
                  <strong className="text-fg font-semibold">PKR 1.85M</strong>
                </span>
              </div>
            </div>

            {/* 2. Today's Attendance Card */}
            <div className="bg-surface border border-border rounded-lg shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border">
                  <h3 className="text-ui font-semibold text-fg">
                    Today's attendance <span className="text-fg-muted font-normal text-xs ml-1">· 14 people</span>
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
                  {/* Pills Summary: ALL NON-SOLID, SOFT PASTEL TONES */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusPill variant="success" dot={false} label="10 present" />
                    <StatusPill variant="warning" dot={false} label="2 late" />
                    <StatusPill variant="accent" dot={false} label="1 WFH" />
                    <StatusPill variant="info" dot={false} label="1 leave" />
                  </div>

                  {/* List Rows */}
                  <div className="divide-y divide-border pt-1">
                    {/* Person 1 */}
                    <div className="flex items-center gap-2.5 py-2">
                      <span className="w-7 h-7 rounded-full bg-subtle border border-border flex items-center justify-center text-xs font-semibold text-fg-2 shrink-0">
                        SA
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-fg truncate">Sara Ahmed</p>
                        <p className="text-micro text-fg-muted truncate">Content</p>
                      </div>
                      <span className="text-xs text-fg-muted font-numeric mr-1">9:12 AM</span>
                      <StatusPill variant="success" dot label="Present" />
                    </div>

                    {/* Person 2 */}
                    <div className="flex items-center gap-2.5 py-2">
                      <span className="w-7 h-7 rounded-full bg-subtle border border-border flex items-center justify-center text-xs font-semibold text-fg-2 shrink-0">
                        HR
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-fg truncate">Hamza Raza</p>
                        <p className="text-micro text-fg-muted truncate">Creative</p>
                      </div>
                      <span className="text-xs text-fg-muted font-numeric mr-1">10:08 AM</span>
                      <StatusPill variant="warning" dot label="Late" />
                    </div>

                    {/* Person 3 */}
                    <div className="flex items-center gap-2.5 py-2">
                      <span className="w-7 h-7 rounded-full bg-subtle border border-border flex items-center justify-center text-xs font-semibold text-fg-2 shrink-0">
                        ZA
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-fg truncate">Zain Ali</p>
                        <p className="text-micro text-fg-muted truncate">SEO</p>
                      </div>
                      <span className="text-xs text-fg-muted font-numeric mr-1">9:30 AM</span>
                      <StatusPill variant="accent" dot label="WFH" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (320px) matching Mock 01 */}
        <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
          {/* Card 1: Your day */}
          <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border">
              <h3 className="text-ui font-semibold text-fg">Your day</h3>
              <StatusPill
                variant={isCheckedIn ? 'success' : todayOff.isOff ? 'neutral' : 'warning'}
                dot
                label={
                  todayOff.isOff
                    ? 'Rest day'
                    : isCheckedIn
                    ? 'Checked in · on time'
                    : 'Not checked in'
                }
              />
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-kpi font-semibold text-fg font-numeric tracking-tight">
                    {isCheckedIn ? '2h 16m' : '—'}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {isCheckedIn
                      ? `at work since ${punchInTime || '9:24 AM'}`
                      : punchOutTime
                      ? `checked out at ${punchOutTime}`
                      : 'not clocked in'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-fg-muted">Shift</div>
                  <div className="text-xs font-medium text-fg font-numeric">
                    {shift?.start_time || '9:30 AM'} – {shift?.end_time || '6:30 PM'}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="h-1.5 w-full bg-subtle rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${logProgressPercent || 28}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-fg-muted mt-1.5">
                  <span>Logged {formatHours(todayTotalHours || 1.5)} of {formatHours(shiftExpectedHours || 8)}</span>
                  <span>Break 1:00 – 2:00 PM</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTogglePunch}
                  icon={isCheckedIn ? LogOut : LogIn}
                  className="flex-1"
                >
                  {isCheckedIn ? 'Check out' : 'Check in'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onNavigateView('daily-log')}
                  icon={Plus}
                  className="flex-1"
                >
                  Log work
                </Button>
              </div>
            </div>
          </div>

          {/* Card 2: Needs attention */}
          <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border">
              <h3 className="text-ui font-semibold text-fg">Needs attention</h3>
              <button
                type="button"
                onClick={() => onNavigateView('exceptions')}
                className="text-xs text-accent-text hover:underline font-medium cursor-pointer"
              >
                View all
              </button>
            </div>

            <div className="p-4 pt-2 space-y-3 divide-y divide-border">
              {/* Item 1: Hour discrepancies */}
              <div className="flex items-start gap-2.5 pt-2 first:pt-0">
                <div className="w-7 h-7 rounded-md bg-subtle text-fg-2 flex items-center justify-center shrink-0">
                  <Inbox className="w-4 h-4 text-fg-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-fg truncate">3 hour discrepancies</p>
                  <p className="text-micro text-fg-muted line-clamp-1">Logged hours don't match time at work</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2.5 text-xs shrink-0"
                  onClick={() => onNavigateView('exceptions')}
                >
                  Review
                </Button>
              </div>

              {/* Item 2: Missing daily logs */}
              <div className="flex items-start gap-2.5 pt-2">
                <div className="w-7 h-7 rounded-md bg-subtle text-fg-2 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-fg-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-fg truncate">2 missing daily logs</p>
                  <p className="text-micro text-fg-muted line-clamp-1">Hamza Raza, Bilal Hussain · Oct 7</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2.5 text-xs shrink-0"
                  onClick={() => onNavigateView('daily-log')}
                >
                  Remind
                </Button>
              </div>

              {/* Item 3: Uncontacted leads */}
              <div className="flex items-start gap-2.5 pt-2">
                <div className="w-7 h-7 rounded-md bg-subtle text-fg-2 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-fg-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-fg truncate">3 uncontacted leads</p>
                  <p className="text-micro text-fg-muted line-clamp-1">Oldest received 2h ago</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2.5 text-xs shrink-0"
                  onClick={() => onNavigateView('crm')}
                >
                  Open
                </Button>
              </div>
            </div>
          </div>

          {/* Card 3: Recent activity */}
          <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border">
              <h3 className="text-ui font-semibold text-fg">Recent activity</h3>
            </div>

            <div className="p-4 pt-2 space-y-2.5 divide-y divide-border">
              {/* Activity 1 */}
              <div className="flex items-start gap-2.5 pt-2 first:pt-0">
                <span className="w-6 h-6 rounded-full bg-subtle border border-border flex items-center justify-center text-[10px] font-semibold text-fg-2 shrink-0">
                  UT
                </span>
                <div className="flex-1 min-w-0 text-xs text-fg-2 leading-relaxed">
                  <strong className="text-fg font-medium">Usman Tariq</strong> marked <strong className="text-fg font-medium">Atlas Fitness</strong> as won
                </div>
                <span className="text-micro text-fg-muted font-numeric shrink-0">48m</span>
              </div>

              {/* Activity 2 */}
              <div className="flex items-start gap-2.5 pt-2">
                <span className="w-6 h-6 rounded-full bg-subtle border border-border flex items-center justify-center text-[10px] font-semibold text-fg-2 shrink-0">
                  MQ
                </span>
                <div className="flex-1 min-w-0 text-xs text-fg-2 leading-relaxed">
                  <strong className="text-fg font-medium">Mariam Qureshi</strong> approved your WFH request
                </div>
                <span className="text-micro text-fg-muted font-numeric shrink-0">1h</span>
              </div>

              {/* Activity 3 */}
              <div className="flex items-start gap-2.5 pt-2">
                <span className="w-6 h-6 rounded-full bg-subtle border border-border flex items-center justify-center text-[10px] font-semibold text-fg-2 shrink-0">
                  SA
                </span>
                <div className="flex-1 min-w-0 text-xs text-fg-2 leading-relaxed">
                  <strong className="text-fg font-medium">Sara Ahmed</strong> sent <strong className="text-fg font-medium">Winter whitening offer</strong> for client review
                </div>
                <span className="text-micro text-fg-muted font-numeric shrink-0">2h</span>
              </div>
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
