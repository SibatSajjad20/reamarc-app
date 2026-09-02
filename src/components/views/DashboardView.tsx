/**
 * Employee Command Center Dashboard View.
 * Provides a clean personalized banner, live Attendance Punch Terminal,
 * Daily Log compliance tracker (for HR & Team Members), and personal monthly punctuality overview.
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

import { EmployeePunchCard } from '../attendance/EmployeePunchCard';
import { RequestManagementModal } from '../attendance/RequestManagementModal';

import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Award,
  Clock,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { getDeptBadgeClass, getRoleLabel, getInitials } from '../../utils/badgeStyles';
import { useOffDays } from '../../hooks/useOffDays';
import { OffDayBanner } from '../ui/OffDayBanner';

interface DashboardViewProps {
  onNavigateView: (view: ViewType) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateView }) => {
  const { user } = useAuth();

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
  const yesterdayOff = getOffDay(yesterdayIso);

  // Loading States
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(true);
  const [isLoadingTimesheet, setIsLoadingTimesheet] = useState(true);
  const [isLoadingDailyLog, setIsLoadingDailyLog] = useState(true);
  useModuleLoadGate(isLoadingAttendance);

  // Data States
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendanceResponse | null>(null);
  const [personalTimesheet, setPersonalTimesheet] = useState<PersonalTimesheetResponse | null>(null);
  const [todayLogEntries, setTodayLogEntries] = useState<DailyLogEntry[]>([]);
  const [yesterdayLogEntries, setYesterdayLogEntries] = useState<DailyLogEntry[]>([]);
  const [logFollowUps, setLogFollowUps] = useState<DayTarget['follow_ups']>([]);

  // Request Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestModalTab, setRequestModalTab] = useState<RequestType>('leave');

  // Role Logic: Operations does NOT log daily tasks
  const isOperations = user?.role === 'operations';
  const showDailyLogSection = !isOperations;

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

  // Load Daily Log Data (Skipped for Operations)
  const loadDailyLogs = useCallback(async () => {
    if (isOperations) return;
    try {
      setIsLoadingDailyLog(true);
      const [todayRes, yesterdayRes, targetRes] = await Promise.allSettled([
        dailyLogService.getEntries({
          start_date: todayIso,
          end_date: todayIso,
          user_id: user?.id,
          limit: 100,
        }),
        dailyLogService.getEntries({
          start_date: yesterdayIso,
          end_date: yesterdayIso,
          user_id: user?.id,
          limit: 100,
        }),
        dailyLogService.getDayTarget(),
      ]);

      if (todayRes.status === 'fulfilled') {
        setTodayLogEntries(todayRes.value || []);
      }
      if (yesterdayRes.status === 'fulfilled') {
        setYesterdayLogEntries(yesterdayRes.value || []);
      }
      if (targetRes.status === 'fulfilled') {
        setLogFollowUps(targetRes.value.follow_ups || []);
      }
    } catch (err) {
      console.error('Failed to load dashboard daily logs:', err);
    } finally {
      setIsLoadingDailyLog(false);
    }
  }, [todayIso, yesterdayIso, user?.id, isOperations]);

  useEffect(() => {
    loadAttendance();
    if (showDailyLogSection) {
      loadDailyLogs();
    }
  }, [loadAttendance, loadDailyLogs, showDailyLogSection]);

  const handleOpenRequestModal = (tab: RequestType = 'leave') => {
    setRequestModalTab(tab);
    setIsRequestModalOpen(true);
  };

  // Compute Daily Log Summary
  const isTodayLogSubmitted = todayLogEntries.length > 0;
  const todayTotalHours = useMemo(() => {
    return todayLogEntries.reduce((acc, entry) => {
      const hrs = typeof entry.hours_utilized === 'number' ? entry.hours_utilized : parseFloat(String(entry.hours_utilized || 0));
      return acc + (isNaN(hrs) ? 0 : hrs);
    }, 0);
  }, [todayLogEntries]);

  // Check if yesterday was a workday with missed log (exclude Sunday)
  const isYesterdayMissed = useMemo(() => {
    if (yesterdayOff.isOff) return false;
    return yesterdayLogEntries.length === 0;
  }, [yesterdayOff.isOff, yesterdayLogEntries]);

  // Timesheet Summary metrics
  const timesheetSummary = personalTimesheet?.summary;
  const daysPresent = timesheetSummary?.days_present ?? 0;
  const totalWorkingDays = timesheetSummary?.total_working_days ?? timesheetSummary?.working_days ?? 22;
  const lateStrikes = timesheetSummary?.late_count ?? timesheetSummary?.late_strikes ?? 0;
  const leavesTaken = timesheetSummary?.leave_count ?? timesheetSummary?.leaves_taken ?? 0;
  const punctualityScore = timesheetSummary?.punctuality_score_percent ?? timesheetSummary?.punctuality_percentage ?? 100;
  const netVarianceFormatted = timesheetSummary?.net_variance_formatted || '—';
  const netVarianceHelper = useMemo(() => {
    if (!netVarianceFormatted || netVarianceFormatted === '—') return null;
    const sign = netVarianceFormatted.startsWith('+') ? 'overtime' : netVarianceFormatted.startsWith('-') ? 'undertime' : null;
    if (!sign) return null;
    const raw = netVarianceFormatted.replace(/^[+-]/, '');
    const [hStr] = raw.split(':');
    const hours = parseInt(hStr || '0', 10);
    return `${hours} hrs ${sign}`;
  }, [netVarianceFormatted]);

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-6 max-w-7xl mx-auto w-full dashboard-view">
      {/* 1. Top User Profile Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 shadow-sm">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-8 w-64 h-64 bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {/* Avatar Initials */}
            <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-xl font-black shrink-0">
              {getInitials(user?.full_name || user?.name, user?.email)}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  Welcome back, {user?.full_name || user?.name || 'Team Member'} 👋
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-300 font-medium">
                  {user?.email}
                </span>
                <span className="text-zinc-400 dark:text-zinc-500">•</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200 border border-zinc-200 dark:border-white/10">
                  {getRoleLabel(user?.role)}
                </span>
                {user?.department && (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getDeptBadgeClass(
                      user.department
                    )}`}
                  >
                    {user.department}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Today Date Badge */}
          <div className="flex items-center gap-3 bg-zinc-50 dark:bg-white/5 backdrop-blur-sm px-4 py-2.5 rounded-2xl border border-zinc-200 dark:border-white/10 shrink-0">
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <div className="text-right">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 block uppercase tracking-wider">
                Current Date
              </span>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                {today.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Live Punch Terminal Widget */}
      <EmployeePunchCard
        todayData={todayAttendance}
        isLoading={isLoadingAttendance}
        onRefresh={loadAttendance}
        onOpenRequestModal={handleOpenRequestModal}
      />

      {/* 3. Operational Hub: Daily Log Status (HR & Team Members) + Monthly Performance Snapshot */}
      <div className={`grid grid-cols-1 ${showDailyLogSection ? 'lg:grid-cols-12' : ''} gap-6`}>
        {/* Left Column: Today's Daily Log Status Card (Hidden for Operations role) */}
        {showDailyLogSection && (
          <div className="lg:col-span-6 flex flex-col h-full min-h-[280px]">
            <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 p-6 flex-1 flex flex-col justify-between shadow-sm h-full">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900/50 text-amber-600 dark:text-amber-400">
                      <ClipboardList className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                        Daily Work Log Status
                      </h3>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={loadDailyLogs}
                    disabled={isLoadingDailyLog}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-lg transition-colors cursor-pointer"
                    title="Refresh daily log status"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingDailyLog ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Status Display */}
                <div className="pt-5 space-y-4">
                  {todayOff.isOff ? (
                    <OffDayBanner info={todayOff} date={todayIso} />
                  ) : isTodayLogSubmitted ? (
                    <div className="p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                          Today's Work Log Submitted
                        </h4>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                          You have logged <span className="font-bold">{todayLogEntries.length} tasks</span> totaling{' '}
                          <span className="font-bold">{todayTotalHours} hours</span> for today.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                          Today's Work Log Pending
                        </h4>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          You have not logged any tasks for today yet. Make sure to record your daily activities before concluding your shift.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Missed Yesterday Notice */}
                  {logFollowUps && logFollowUps.length > 0 && (
                    <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 space-y-2">
                      <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">Requests</p>
                      {logFollowUps.map((fu) => (
                        <div key={`${fu.date}-${fu.action_status}`} className="flex items-center justify-between gap-2 text-xs text-indigo-900 dark:text-indigo-200">
                          <span>
                            {fu.action_status === 'waiting_on_reviewer'
                              ? `Your reason for ${fu.date} is waiting on ${fu.action_by_name || 'your lead'}.`
                              : `You have a log request for ${fu.date}.`}
                          </span>
                          <button
                            type="button"
                            onClick={() => onNavigateView('daily-log')}
                            className="underline font-bold cursor-pointer shrink-0"
                          >
                            Open Daily Log
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {isYesterdayMissed && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 flex items-center justify-between text-xs text-rose-800 dark:text-rose-300">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        <span>Reminder: No work log was found for yesterday.</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigateView('daily-log')}
                        className="underline font-bold hover:text-rose-900 dark:hover:text-rose-100 cursor-pointer"
                      >
                        Catch Up
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Link to Daily Log Module */}
              <div className="pt-5 mt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end">
                <button
                  type="button"
                  onClick={() => onNavigateView('daily-log')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
                >
                  <span>{todayOff.isOff || isTodayLogSubmitted ? 'View Daily Log' : 'Open Daily Log Terminal'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right / Full-Width Column: My Monthly Attendance Snapshot */}
        <div className={`${showDailyLogSection ? 'lg:col-span-6' : 'w-full'} flex flex-col h-full min-h-[280px]`}>
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 p-6 flex-1 flex flex-col justify-between shadow-sm h-full">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                      My Monthly Performance
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold font-numeric">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{isLoadingTimesheet ? '…' : `${punctualityScore}% Score`}</span>
                </div>
              </div>

              {/* 4 Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5">
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90 text-center">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                    Present Days
                  </span>
                  <span className="text-base font-extrabold font-numeric text-zinc-900 dark:text-zinc-100">
                    {daysPresent} / {totalWorkingDays}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90 text-center">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                    Late Strikes
                  </span>
                  <span
                    className={`text-base font-extrabold font-numeric ${
                      lateStrikes > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {lateStrikes}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90 text-center">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                    Leaves Taken
                  </span>
                  <span className="text-base font-extrabold font-numeric text-zinc-700 dark:text-zinc-300">
                    {leavesTaken}d
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90 text-center">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                    Net Variance
                  </span>
                  <span
                    className={`text-base font-extrabold font-numeric ${
                      netVarianceFormatted.startsWith('+')
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : netVarianceFormatted.startsWith('-')
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-zinc-400'
                    }`}
                    title={netVarianceHelper || 'On expected hours'}
                  >
                    {netVarianceFormatted}
                  </span>
                  {netVarianceHelper && (
                    <span className="block text-[10px] font-medium text-zinc-400 mt-0.5">
                      ({netVarianceHelper})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Link to Attendance Module */}
            <div className="pt-5 mt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end">
              <button
                type="button"
                onClick={() => onNavigateView('attendance')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
              >
                <span>View Full Monthly Timesheet</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
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

