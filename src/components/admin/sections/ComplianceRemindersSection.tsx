import React, { useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  Mail,
  MessageSquare,
  Clock,
  CheckCircle2,
  Send,
  Loader2,
  Search,
  Layers,
  AlertTriangle,
  Users,
  Coffee,
  ShieldAlert,
} from 'lucide-react';
import type { MemberActivity } from '../../../types/admin';
import type { LogExceptionItem, OperatingSnapshot } from '../../../types/dailyLog';
import { DEPARTMENTS } from '../AddMemberModal';
import { CustomSelect } from '../../ui/CustomSelect';
import { CustomDatePicker } from '../../ui/CustomDatePicker';
import { useOffDays } from '../../../hooks/useOffDays';
import { logExceptionService } from '../../../services/logExceptionService';
import { formatHours, formatSignedHours, isLogDateExpired } from '../../../utils/logTimeChecks';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatExceptionDate = (iso?: string) => {
  if (!iso) return '';
  try {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

const getInitials = (name?: string) => {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

interface ComplianceRemindersSectionProps {
  activities: Record<string, MemberActivity>;
  isLoading?: boolean;
  onSendReminder: (userId: string, channel: 'email' | 'in_app' | 'all', customMessage?: string) => Promise<void>;
  isSendingReminder: Record<string, boolean>;
}

export const ComplianceRemindersSection: React.FC<ComplianceRemindersSectionProps> = ({
  activities,
  isLoading,
  onSendReminder,
  isSendingReminder,
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'missing' | 'logged'>('all');
  const [range, setRange] = useState<'today' | 'week' | 'date'>('today');
  const [pickedDate, setPickedDate] = useState(todayIso);
  const [snap, setSnap] = useState<OperatingSnapshot | null>(null);
  const [snapLoading, setSnapLoading] = useState(true);
  const { getOffDay, holidays, workingSaturdays } = useOffDays();
  const viewingOff = range === 'date' ? getOffDay(pickedDate) : range === 'today' ? getOffDay(todayIso()) : { isOff: false, label: 'Working day' as const };
  const isDateExpired = (dateStr?: string | null) => {
    if (!dateStr) return false;
    return isLogDateExpired(dateStr, holidays, workingSaturdays);
  };
  const isSelectedDateExpired = range === 'date' ? isDateExpired(pickedDate) : false;

  const [customReminderUser, setCustomReminderUser] = useState<MemberActivity | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [isSendingBatch, setIsSendingBatch] = useState(false);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapLoading(true);
    const dateArg = range === 'date' ? pickedDate : undefined;
    const rangeArg = range === 'week' ? 'week' : 'today';
    logExceptionService
      .getSnapshot(dateArg, rangeArg)
      .then((data) => {
        if (!cancelled) setSnap(data);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setSnap(null);
          addToast('Could not load overview', err.message || 'Try again.', 'warning');
        }
      })
      .finally(() => {
        if (!cancelled) setSnapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, pickedDate, addToast]);

  const activityList = useMemo(() => Object.values(activities), [activities]);
  const monitoredMembers = useMemo(
    () => activityList.filter((a) => a.role !== 'admin' && a.role !== 'client' && a.role !== 'operations'),
    [activityList],
  );
  const hoursByUser = useMemo(() => {
    const map: Record<
      string,
      {
        worked: number;
        loggedHours: number;
        gap: number;
        signedGap: number;
        hasOpen: boolean;
        logged: boolean;
        due: boolean;
        hasCheckin: boolean;
        hasCheckout: boolean;
        onLeave: boolean;
      }
    > = {};
    (snap?.people || []).forEach((p) => {
      map[p.user_id] = {
        worked: p.worked_hours,
        loggedHours: p.logged_hours,
        gap: p.gap_hours,
        signedGap: p.signed_gap_hours ?? (p.logged_hours - p.worked_hours),
        hasOpen: p.has_open_request,
        logged: Boolean(p.logged),
        due: Boolean(p.due),
        hasCheckin: Boolean(p.has_checkin),
        hasCheckout: Boolean(p.has_checkout),
        onLeave: Boolean(p.is_full_leave),
      };
    });
    return map;
  }, [snap]);

  const personStatus = (userId: string): 'submitted' | 'missing' | 'in_shift' | 'not_started' | 'on_leave' => {
    const hours = hoursByUser[userId];
    if (hours?.onLeave) return 'on_leave';
    if (hours?.logged) return 'submitted';
    if (hours?.due) return 'missing';
    if (hours?.hasCheckin) return 'in_shift';
    return 'not_started';
  };

  const openRequestIds = new Set(snap?.open_request_user_ids || []);

  const missingTodayCount = useMemo(
    () =>
      monitoredMembers.filter((m) => personStatus(m.user_id) === 'missing' && !openRequestIds.has(m.user_id)).length,
    [monitoredMembers, hoursByUser, openRequestIds],
  );

  const groupedHrExceptions = useMemo(() => {
    const groups: Record<
      string,
      {
        userId: string;
        fullName: string;
        department?: string;
        items: LogExceptionItem[];
        totalGap: number;
        activity?: MemberActivity;
      }
    > = {};

    (snap?.hr_exceptions || []).forEach((item) => {
      const key = item.user_id || item.full_name;
      if (!groups[key]) {
        groups[key] = {
          userId: item.user_id,
          fullName: item.full_name,
          department: item.department || 'HR',
          items: [],
          totalGap: 0,
          activity: activities[item.user_id],
        };
      }
      groups[key].items.push(item);
      const gap = Math.abs(item.signed_gap_hours ?? item.gap_hours ?? 0);
      groups[key].totalGap += gap;
    });

    return Object.values(groups);
  }, [snap?.hr_exceptions, activities]);

  const missingHighlight = snap?.highlights?.find(
    (h) => h.label.toLowerCase().includes("didn't log") || h.label.toLowerCase().includes('missing'),
  );
  const biggestGapHighlight = snap?.highlights?.find(
    (h) => h.label.toLowerCase().includes('gap') || h.label.toLowerCase().includes('biggest'),
  );
  const totalExceptions = (snap?.top_exceptions?.length || 0) + (isAdmin ? snap?.hr_exceptions?.length || 0 : 0);

  const filteredActivities = useMemo(() => {
    return monitoredMembers.filter((a) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        a.full_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.department && a.department.toLowerCase().includes(q));
      const matchesDept =
        departmentFilter === 'all' ||
        (a.department && a.department.toLowerCase() === departmentFilter.toLowerCase());
      if (snap && !hoursByUser[a.user_id]) return false;
      const status = personStatus(a.user_id);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'missing' && status === 'missing') ||
        (statusFilter === 'logged' && status === 'submitted');
      return matchesSearch && matchesDept && matchesStatus;
    });
  },     [monitoredMembers, searchQuery, departmentFilter, statusFilter, hoursByUser, snap],
  );

  const handleBatchReminder = async () => {
    if (isSelectedDateExpired) return;
    const targets = monitoredMembers.filter(
      (m) => personStatus(m.user_id) === 'missing' && !openRequestIds.has(m.user_id),
    );
    if (targets.length === 0) return;
    try {
      setIsSendingBatch(true);
      setBatchSuccessMsg(null);
      let sent = 0;
      for (const m of targets) {
        try {
          await onSendReminder(m.user_id, 'email');
          sent += 1;
        } catch {
          /* skip 409 / already requested */
        }
      }
      setBatchSuccessMsg(`Reminders sent to ${sent} people who have not logged.`);
      setTimeout(() => setBatchSuccessMsg(null), 5000);
    } finally {
      setIsSendingBatch(false);
    }
  };

  const handleSendCustomReminder = async () => {
    if (!customReminderUser) return;
    try {
      await onSendReminder(customReminderUser.user_id, 'email', customMessage.trim() || undefined);
      setCustomReminderUser(null);
      setCustomMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#10121a] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50">Log Compliance</h1>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Who logged, hours at work vs logged, and reminders for missing logs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['today', 'week', 'date'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                range === id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {id === 'today' ? 'Today' : id === 'week' ? 'This week' : 'Pick a date'}
            </button>
          ))}
          {range === 'date' && (
            <div className="w-40">
              <CustomDatePicker
                value={pickedDate}
                onChange={(val) => setPickedDate(val || todayIso())}
                maxDate={todayIso()}
                offDayMode="mark"
              />
            </div>
          )}
          {viewingOff.isOff && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-semibold">
              <Coffee className="w-3.5 h-3.5 shrink-0" />
              <span>{viewingOff.label}</span>
            </div>
          )}
          {!isSelectedDateExpired && missingTodayCount > 0 && !viewingOff.isOff && (
            <button
              type="button"
              onClick={handleBatchReminder}
              disabled={isSendingBatch}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
            >
              {isSendingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
              <span>Remind missing ({missingTodayCount})</span>
            </button>
          )}
        </div>
      </div>

      {batchSuccessMsg && (
        <div className="px-5 py-3 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{batchSuccessMsg}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {snapLoading || isLoading ? (
          <div className="space-y-5 animate-pulse">
            {/* Overview summary skeleton */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <div className="h-5 w-72 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
              <div className="h-3.5 w-48 bg-zinc-100 dark:bg-zinc-800/60 rounded-md" />
            </div>

            {/* Department Grid Skeleton */}
            <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="h-3.5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
                      <div className="h-3 w-8 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    </div>
                    <div className="h-3 w-28 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                  </div>
                ))}
              </div>
            </div>

            {/* Table skeleton */}
            <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <div className="h-10 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40" />
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-14 px-4 flex items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 w-36 bg-zinc-200 dark:bg-zinc-800 rounded" />
                      <div className="h-2.5 w-48 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                    </div>
                    <div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded hidden sm:block" />
                    <div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                    <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-7 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : viewingOff.isOff && (snap?.logs_submitted || 0) === 0 && (snap?.worked_hours || 0) === 0 ? (
          /* Dedicated Off-Day / Holiday State */
          <div className="bg-white dark:bg-[#12141c] border border-amber-200/60 dark:border-amber-900/40 rounded-2xl p-8 sm:p-12 text-center shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-200/60 dark:border-amber-800/40 shadow-xs">
              <Coffee className="w-8 h-8" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100/70 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/50 mb-3">
              Official Off Day · {viewingOff.label || 'Rest Day'}
            </div>
            <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
              No Compliance Monitoring Required
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed">
              {range === 'date' ? pickedDate : 'Today'} is a scheduled non-working day ({viewingOff.label}). Employee shifts, check-ins, and daily task logs are not enforced, and compliance reminders are suspended.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <span className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                All members exempt
              </span>
              <span className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                0 shifts scheduled
              </span>
              <span className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                Reminders suspended
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 rounded-2xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800">
              <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-relaxed">
                {snap?.summary ||
                  `${snap?.logs_submitted || 0} of ${snap?.employees_expected || 0} people logged.`}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                {formatHours(snap?.worked_hours || 0)} at work vs {formatHours(snap?.logged_hours || 0)} in the log
                {typeof snap?.missed_workdays === 'number' ? ` · ${snap.missed_workdays} missed workdays in range` : ''}
              </p>
            </div>

            {snap?.departments && snap.departments.length > 0 && (
              <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  By department
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {snap.departments.map((dept) => (
                    <button
                      key={dept.name}
                      type="button"
                      onClick={() => setDepartmentFilter(dept.name)}
                      className={`p-3 rounded-xl border text-left space-y-1 cursor-pointer transition-colors ${
                        departmentFilter.toLowerCase() === dept.name.toLowerCase()
                          ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold truncate">{dept.name}</span>
                        <span className="text-[10px] font-bold text-zinc-400">{dept.logged}/{dept.total}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {formatHours(dept.logged_hours)} logged / {formatHours(dept.worked_hours)} at work
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {((snap?.highlights && snap.highlights.some((h) => h.value !== '0' && h.value !== '0%')) ||
              (snap?.top_exceptions && snap.top_exceptions.length > 0) ||
              (isAdmin && snap?.hr_exceptions && snap.hr_exceptions.length > 0)) && (
              <div className="bg-white dark:bg-[#12141c] border border-amber-200/80 dark:border-amber-900/40 rounded-2xl p-5 space-y-5 shadow-xs">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200/60 dark:border-amber-800/50">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Needs Attention</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          {totalExceptions} {totalExceptions === 1 ? 'discrepancy' : 'discrepancies'}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {range === 'week' ? 'Weekly compliance audit & unallocated hours' : 'Unlogged shifts and hours discrepancies awaiting review'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Highlights KPI Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Card 1: Missing Logs */}
                  <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">Unsubmitted Daily Logs</span>
                      <p className="text-[10px] text-zinc-500">Shifts finished without task logs</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-amber-600 dark:text-amber-400">
                        {missingHighlight?.value ?? '0'}
                      </span>
                      <span className="text-[10px] font-bold text-zinc-400 block">people</span>
                    </div>
                  </div>

                  {/* Card 2: Biggest Gap */}
                  {biggestGapHighlight && (
                    <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/30 flex items-center justify-between gap-3 sm:col-span-1 lg:col-span-2">
                      <div className="space-y-0.5 min-w-0">
                        <span className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-rose-500" />
                          Largest Hours Deficit
                        </span>
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {biggestGapHighlight.value}
                        </p>
                      </div>
                      <span className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-300/60 dark:border-rose-800/40">
                        Attention Required
                      </span>
                    </div>
                  )}
                </div>

                {/* Team Exceptions List */}
                {(snap?.top_exceptions || []).length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-zinc-400" />
                        Team Exceptions & Hours Gaps ({snap?.top_exceptions?.length})
                      </span>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden bg-zinc-50/40 dark:bg-zinc-900/30">
                      {snap?.top_exceptions.map((row) => {
                        const act = activities[row.user_id];
                        const isSending = isSendingReminder[row.user_id];
                        const canRemind = row.user_id && !openRequestIds.has(row.user_id);
                        const hasGap = (row.gap_hours || 0) > 0.05 || (row.signed_gap_hours || 0) !== 0;
                        const gapVal = Math.abs(row.signed_gap_hours ?? row.gap_hours ?? 0);

                        return (
                          <div
                            key={row.id}
                            className="p-3 sm:px-4 flex flex-wrap items-center justify-between gap-3 hover:bg-white dark:hover:bg-zinc-800/40 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-[200px]">
                              <div className="w-8 h-8 rounded-xl bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs flex items-center justify-center shrink-0 border border-zinc-300/40 dark:border-zinc-700/60">
                                {getInitials(row.full_name)}
                              </div>
                              <div>
                                <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 flex-wrap">
                                  <span>{row.full_name}</span>
                                  {row.department && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                      {row.department}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                                  {row.date && <span>{formatExceptionDate(row.date)}</span>}
                                  {row.date && <span>·</span>}
                                  <span>{row.role || 'Member'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 flex-wrap">
                              {row.is_missing_log ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                                  <Clock className="w-3.5 h-3.5" /> Didn't log
                                </span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                    {formatHours(row.logged_hours)} logged
                                    <span className="text-zinc-400 font-normal"> / {formatHours(row.worked_hours || 0)} work</span>
                                  </span>
                                  {hasGap && (
                                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                                      -{formatHours(gapVal)} gap
                                    </span>
                                  )}
                                </div>
                              )}

                              {!isDateExpired(row.date) && canRemind && act && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onSendReminder(act.user_id, 'email')}
                                    disabled={isSending}
                                    title="Send Email Reminder"
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-[11px] font-bold cursor-pointer disabled:opacity-50 transition-colors"
                                  >
                                    {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                                    <span>Remind</span>
                                  </button>
                                  {act.phone && (
                                    <a
                                      href={`https://wa.me/${act.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                        `Hi ${act.full_name}, reminder to submit/complete your Daily Log on Reamarc.`,
                                      )}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      title="Send WhatsApp Reminder"
                                      className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* HR's Own Issues - Grouped by Member */}
                {isAdmin && groupedHrExceptions.length > 0 && (
                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-purple-500" />
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          HR Administrative Audit
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                          Internal Compliance
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        {snap?.hr_exceptions?.length} total occurrences
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {groupedHrExceptions.map((group) => {
                        const act = group.activity;
                        const isSending = act ? isSendingReminder[act.user_id] : false;

                        return (
                          <div
                            key={group.userId || group.fullName}
                            className="p-3.5 rounded-xl border border-purple-200/70 dark:border-purple-900/40 bg-purple-50/30 dark:bg-purple-950/20 space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold text-xs flex items-center justify-center border border-purple-300/60 dark:border-purple-700/50">
                                  {getInitials(group.fullName)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{group.fullName}</span>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                      HR Team
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-zinc-500">
                                    {group.items.length} {group.items.length === 1 ? 'day' : 'days'} with hours gaps · Total deficit: <span className="font-bold text-rose-600 dark:text-rose-400">-{formatHours(group.totalGap)}</span>
                                  </p>
                                </div>
                              </div>

                              {act && group.items.some((item) => !isDateExpired(item.date)) && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onSendReminder(act.user_id, 'email')}
                                    disabled={isSending}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-[11px] font-bold cursor-pointer disabled:opacity-50 hover:bg-zinc-50 transition-colors shadow-2xs"
                                  >
                                    {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                                    <span>Remind</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Individual Workday Gap Pills */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {group.items.map((item) => {
                                const gapVal = Math.abs(item.signed_gap_hours ?? item.gap_hours ?? 0);
                                return (
                                  <div
                                    key={item.id}
                                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] flex items-center gap-1.5 shadow-2xs"
                                  >
                                    <span className="font-bold text-zinc-700 dark:text-zinc-300">
                                      {formatExceptionDate(item.date)}:
                                    </span>
                                    <span className="text-zinc-500">
                                      {formatHours(item.logged_hours)} / {formatHours(item.worked_hours || 0)}
                                    </span>
                                    <span className="font-bold text-rose-600 dark:text-rose-400">
                                      (-{formatHours(gapVal)})
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filter controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search member..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  {(['all', 'missing', 'logged'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        statusFilter === st ? 'bg-white dark:bg-zinc-800 shadow-2xs' : 'text-zinc-500'
                      }`}
                    >
                      {st === 'all' ? 'All' : st === 'missing' ? 'Missing' : 'Logged'}
                    </button>
                  ))}
                </div>
                <div className="w-48">
                  <CustomSelect
                    value={departmentFilter}
                    onChange={setDepartmentFilter}
                    options={[
                      { value: 'all', label: 'All Departments' },
                      ...DEPARTMENTS.map((dept) => ({ value: dept, label: dept })),
                    ]}
                    icon={Layers}
                    placeholder="All Departments"
                  />
                </div>
              </div>
            </div>

            {/* Compliance Table */}
            <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Member</th>
                    <th className="py-3 px-4">Dept</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">At work</th>
                    <th className="py-3 px-4">Logged</th>
                    <th className="py-3 px-4">Gap</th>
                    <th className="py-3 px-4 text-right">Remind</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 text-xs">
                  {filteredActivities.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-400 font-medium">
                        No member compliance records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredActivities.map((act) => {
                      const hours = hoursByUser[act.user_id];
                      const isSending = isSendingReminder[act.user_id];
                      const hasOpen = hours?.hasOpen || openRequestIds.has(act.user_id);
                      const status = personStatus(act.user_id);
                      const canRemind = status === 'missing' && !hasOpen;
                      const isTableDateExpired = isDateExpired(range === 'date' ? pickedDate : todayIso());
                      return (
                        <tr key={act.user_id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold">{act.full_name}</div>
                            <div className="text-[11px] text-zinc-400">{act.email}</div>
                          </td>
                          <td className="py-3 px-4">{act.department || '—'}</td>
                          <td className="py-3 px-4">
                            {status === 'on_leave' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
                                On leave
                              </span>
                            ) : status === 'submitted' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Submitted
                              </span>
                            ) : status === 'missing' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                <Clock className="w-3 h-3" /> Missing
                              </span>
                            ) : status === 'in_shift' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
                                <Clock className="w-3 h-3" /> In shift
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
                                Not started
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-semibold">
                            {hours?.hasCheckout || (hours?.worked || 0) > 0
                              ? formatHours(hours?.worked || 0)
                              : hours?.hasCheckin
                                ? 'In'
                                : '—'}
                          </td>
                          <td className="py-3 px-4 font-semibold">{formatHours(hours?.loggedHours || 0)}</td>
                          <td className="py-3 px-4 font-bold">
                            {status === 'on_leave' ? (
                              <span className="text-zinc-400">—</span>
                            ) : status === 'missing' ? (
                              <span className="text-amber-700 dark:text-amber-300">Didn't log</span>
                            ) : (hours?.signedGap || 0) > 0.01 ? (
                              <span className="text-emerald-600 dark:text-emerald-400">{formatSignedHours(hours?.signedGap || 0)}</span>
                            ) : (hours?.signedGap || 0) < -0.01 ? (
                              <span className="text-rose-600 dark:text-rose-400">{formatSignedHours(hours?.signedGap || 0)}</span>
                            ) : (
                              <span className="text-zinc-400">0h</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {hasOpen ? (
                              <span className="text-[11px] text-zinc-400 font-semibold">Lead already asked</span>
                            ) : isTableDateExpired ? (
                              <span className="text-zinc-400">—</span>
                            ) : canRemind ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onSendReminder(act.user_id, 'email')}
                                  disabled={isSending}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors"
                                >
                                  {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                                  Remind
                                </button>
                                {act.phone && (
                                  <a
                                    href={`https://wa.me/${act.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                      `Hi ${act.full_name}, reminder to submit your Daily Log on Reamarc.`,
                                    )}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomReminderUser(act);
                                    setCustomMessage(`Hi ${act.full_name}, please log your tasks.`);
                                  }}
                                  className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer transition-colors"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-bold">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {customReminderUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-sm font-bold">Send reminder to {customReminderUser.full_name}</h3>
            <textarea
              rows={4}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="w-full p-3 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCustomReminderUser(null)} className="px-4 py-2 text-xs font-semibold rounded-xl">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendCustomReminder}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

