import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Coffee,
  ShieldAlert,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import type { MemberActivity } from '../../../types/admin';
import type { OperatingSnapshot } from '../../../types/dailyLog';
import { DEPARTMENTS } from '../AddMemberModal';
import { CustomSelect } from '../../ui/CustomSelect';
import { DateRangeCalendarPicker } from '../../daily-log/DateRangeCalendarPicker';
import { EmployeeComplianceDrawer } from './EmployeeComplianceDrawer';
import { useOffDays } from '../../../hooks/useOffDays';
import { logExceptionService } from '../../../services/logExceptionService';
import {
  formatHours,
  formatSignedHours,
  pluralize,
  gapTone,
  GAP_NEUTRAL_HOURS,
} from '../../../utils/logTimeChecks';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatIso = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getMonday = (d: Date): Date => {
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun, 1 Mon, ..., 6 Sat
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getSaturday = (monday: Date): Date => {
  const sat = new Date(monday);
  sat.setDate(monday.getDate() + 5);
  sat.setHours(23, 59, 59, 999);
  return sat;
};

const formatShortDisplay = (isoStr: string): string => {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

type PersonStatus = 'submitted' | 'missing' | 'in_shift' | 'not_started' | 'on_leave';

function HoursCompareBar({
  logged,
  worked,
  comparable,
  missing,
  inShift,
}: {
  logged: number;
  worked: number;
  comparable: boolean;
  missing: boolean;
  inShift?: boolean;
}) {
  if (!comparable) {
    return (
      <div className="min-w-[160px] max-w-[240px]">
        <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800" />
        <div className="mt-1 text-[10px] text-zinc-400">—</div>
      </div>
    );
  }

  const max = Math.max(logged, worked, 0.01);
  const overlapPct = (Math.min(logged, worked) / max) * 100;
  const deficitHours = Math.max(0, worked - logged);
  const surplusHours = Math.max(0, logged - worked);
  const deficitPct = (deficitHours / max) * 100;
  const surplusPct = (surplusHours / max) * 100;
  const deficitIsSignificant = deficitHours >= GAP_NEUTRAL_HOURS;

  return (
    <div className="min-w-[180px] max-w-[260px]">
      <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="bg-indigo-500/70 dark:bg-indigo-400/70" style={{ width: `${overlapPct}%` }} />
        {deficitPct > 0 && (
          <div
            className={deficitIsSignificant ? 'bg-rose-500' : 'bg-amber-400/80'}
            style={{ width: `${deficitPct}%` }}
          />
        )}
        {surplusPct > 0 && <div className="bg-emerald-500/80" style={{ width: `${surplusPct}%` }} />}
      </div>
      <div className="mt-1 text-[10px] text-zinc-500 tabular-nums">
        {missing ? (
          <span className="text-amber-700 dark:text-amber-300">Didn't log · {formatHours(worked)} at work</span>
        ) : (
          <>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{formatHours(logged)}</span>
            {' logged · '}
            <span>
              {formatHours(worked)} at work
              {inShift && (
                <span className="ml-1 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-1 py-0.2 rounded">
                  live
                </span>
              )}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

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
  const [range, setRange] = useState<'today' | 'week' | 'range'>('today');
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return formatIso(d);
  });
  const [customEndDate, setCustomEndDate] = useState(todayIso);
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<MemberActivity | null>(null);
  const rangePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRangePickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rangePickerRef.current && !rangePickerRef.current.contains(e.target as Node)) {
        setIsRangePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRangePickerOpen]);

  const currentWeekMonday = useMemo(() => getMonday(new Date()), []);
  const selectedMonday = useMemo(() => getMonday(weekAnchor), [weekAnchor]);
  const selectedSaturday = useMemo(() => getSaturday(selectedMonday), [selectedMonday]);

  const selectedMondayIso = useMemo(() => formatIso(selectedMonday), [selectedMonday]);
  const selectedSaturdayIso = useMemo(() => formatIso(selectedSaturday), [selectedSaturday]);

  const isCurrentWeek = useMemo(
    () => formatIso(selectedMonday) === formatIso(currentWeekMonday),
    [selectedMonday, currentWeekMonday],
  );

  const canGoNextWeek = useMemo(
    () => formatIso(selectedMonday) < formatIso(currentWeekMonday),
    [selectedMonday, currentWeekMonday],
  );

  const weekLabel = useMemo(() => {
    const startFmt = formatShortDisplay(selectedMondayIso);
    const endFmt = formatShortDisplay(selectedSaturdayIso);
    return `${startFmt} – ${endFmt}`;
  }, [selectedMondayIso, selectedSaturdayIso]);

  const handlePrevWeek = () => {
    setWeekAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const handleNextWeek = () => {
    if (!canGoNextWeek) return;
    setWeekAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const activeStartDate = useMemo(() => {
    if (range === 'today') return todayIso();
    if (range === 'week') return selectedMondayIso;
    return customStartDate;
  }, [range, selectedMondayIso, customStartDate]);

  const activeEndDate = useMemo(() => {
    if (range === 'today') return todayIso();
    if (range === 'week') return selectedSaturdayIso;
    return customEndDate;
  }, [range, selectedSaturdayIso, customEndDate]);

  const [snap, setSnap] = useState<OperatingSnapshot | null>(null);
  const [snapLoading, setSnapLoading] = useState(true);
  const [gapSortDir, setGapSortDir] = useState<'deficit' | 'surplus'>('deficit');
  const { getOffDay } = useOffDays();
  const viewingOff = range === 'today' ? getOffDay(todayIso()) : { isOff: false, label: 'Working day' as const };
  const isSelectedDateExpired = range === 'week' ? !isCurrentWeek : range === 'range' ? customEndDate < todayIso() : false;
  // Hide Remind entirely once the log window has closed (past dates/weeks).
  const showRemindColumn = !isSelectedDateExpired;

  const [customReminderUser, setCustomReminderUser] = useState<MemberActivity | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [isSendingBatch, setIsSendingBatch] = useState(false);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapLoading(true);
    let dateArg: string | undefined = undefined;
    let rangeArg: 'today' | 'week' | 'range' = 'today';
    let sDate: string | undefined = undefined;
    let eDate: string | undefined = undefined;

    if (range === 'today') {
      dateArg = todayIso();
      rangeArg = 'today';
    } else if (range === 'week') {
      dateArg = selectedMondayIso;
      rangeArg = 'week';
    } else {
      rangeArg = 'range';
      sDate = customStartDate;
      eDate = customEndDate;
    }

    logExceptionService
      .getSnapshot(dateArg, rangeArg, sDate, eDate)
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
  }, [range, selectedMondayIso, customStartDate, customEndDate, addToast]);

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
        role: string;
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
        role: p.role || '',
      };
    });
    return map;
  }, [snap]);

  const personStatus = useCallback((userId: string): PersonStatus => {
    const hours = hoursByUser[userId];
    if (hours?.onLeave) return 'on_leave';
    if (hours?.logged) return 'submitted';
    if (hours?.due) return 'missing';
    if (hours?.hasCheckin && !isSelectedDateExpired) return 'in_shift';
    return 'not_started';
  }, [hoursByUser, isSelectedDateExpired]);

  const openRequestIds = useMemo(() => new Set(snap?.open_request_user_ids || []), [snap]);

  const missingTodayCount = useMemo(
    () =>
      monitoredMembers.filter((m) => personStatus(m.user_id) === 'missing' && !openRequestIds.has(m.user_id)).length,
    [monitoredMembers, personStatus, openRequestIds],
  );

  const hrExceptionUserIds = useMemo(() => {
    const ids = new Set<string>();
    (snap?.hr_exceptions || []).forEach((item) => {
      if (item.user_id) ids.add(item.user_id);
    });
    return ids;
  }, [snap?.hr_exceptions]);

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
  }, [monitoredMembers, searchQuery, departmentFilter, statusFilter, hoursByUser, snap, personStatus]);

  const sortedActivities = useMemo(() => {
    const rows = [...filteredActivities];
    const rank = (userId: string) => {
      const status = personStatus(userId);
      const hours = hoursByUser[userId];
      const hasWorked = Boolean(hours?.hasCheckout || (hours?.worked || 0) > 0);
      if (status === 'on_leave' || status === 'not_started' || (status === 'in_shift' && !hasWorked)) {
        return Number.POSITIVE_INFINITY;
      }
      if (status === 'missing') {
        return -(hours?.worked || 0) - 0.001;
      }
      return hours?.signedGap ?? 0;
    };
    rows.sort((a, b) => {
      const ra = rank(a.user_id);
      const rb = rank(b.user_id);
      if (ra !== rb) return gapSortDir === 'deficit' ? ra - rb : rb - ra;
      return a.full_name.localeCompare(b.full_name);
    });
    return rows;
  }, [filteredActivities, hoursByUser, gapSortDir, personStatus]);

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
      const verb = sent === 1 ? 'has' : 'have';
      setBatchSuccessMsg(`Reminders sent to ${sent} ${pluralize(sent, 'person', 'people')} who ${verb} not logged.`);
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

  const submittedCount = snap?.logs_submitted || 0;
  const expectedCount = snap?.employees_expected || 0;
  const fallbackSummary = `${submittedCount} of ${expectedCount} ${pluralize(expectedCount, 'person', 'people')} logged.`;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#10121a] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50">Log Compliance</h1>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Who logged, hours at work vs logged, and reminders for missing logs
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['today', 'week'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setRange(id);
                setIsRangePickerOpen(false);
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer transition ${
                range === id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {id === 'today' ? 'Today' : 'This week'}
            </button>
          ))}

          {range === 'week' && (
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={handlePrevWeek}
                title="Previous week (Mon-Sat)"
                className="p-1 rounded-lg hover:bg-white dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-bold px-2 text-zinc-800 dark:text-zinc-200 tabular-nums">
                {weekLabel}
              </span>
              <button
                type="button"
                onClick={handleNextWeek}
                disabled={!canGoNextWeek}
                title={canGoNextWeek ? 'Next week (Mon-Sat)' : 'Current week (latest)'}
                className="p-1 rounded-lg hover:bg-white dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="relative" ref={rangePickerRef}>
            <button
              type="button"
              onClick={() => {
                setIsRangePickerOpen((o) => !o);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer transition ${
                range === 'range'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {range === 'range'
                  ? `${formatShortDisplay(customStartDate)} – ${formatShortDisplay(customEndDate)}`
                  : 'Date Range'}
              </span>
            </button>

            {isRangePickerOpen && (
              <div className="absolute right-0 top-full mt-2 z-50">
                <DateRangeCalendarPicker
                  initialStartDate={customStartDate}
                  initialEndDate={customEndDate}
                  onApply={({ startDate, endDate }) => {
                    setCustomStartDate(startDate);
                    setCustomEndDate(endDate);
                    setRange('range');
                    setIsRangePickerOpen(false);
                  }}
                  onCancel={() => setIsRangePickerOpen(false)}
                />
              </div>
            )}
          </div>

          {viewingOff.isOff && range === 'today' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-semibold">
              <Coffee className="w-3.5 h-3.5 shrink-0" />
              <span>{viewingOff.label}</span>
            </div>
          )}

          {showRemindColumn && missingTodayCount > 0 && !viewingOff.isOff && (
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

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {snapLoading || isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 rounded-xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800" />
            <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <div className="h-12 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40" />
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-14 px-4 flex items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 w-36 bg-zinc-200 dark:bg-zinc-800 rounded" />
                      <div className="h-2.5 w-48 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                    </div>
                    <div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                    <div className="h-2 w-36 bg-zinc-200 dark:bg-zinc-800 rounded-full hidden sm:block" />
                    <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-7 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : viewingOff.isOff && (snap?.logs_submitted || 0) === 0 && (snap?.worked_hours || 0) === 0 ? (
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
              Today is a scheduled non-working day ({viewingOff.label}). Employee
              shifts, check-ins, and daily task logs are not enforced, and compliance reminders are suspended.
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
            <div className="px-1 text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">{snap?.summary || fallbackSummary}</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">
                {formatHours(snap?.worked_hours || 0)} at work vs {formatHours(snap?.logged_hours || 0)} in the log
                {typeof snap?.missed_workdays === 'number'
                  ? ` · ${snap.missed_workdays} missed ${pluralize(snap.missed_workdays, 'workday')}`
                  : ''}
              </span>
            </div>

            <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-zinc-200 dark:border-zinc-800">
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

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4">Dept</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Hours</th>
                      <th className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setGapSortDir((d) => (d === 'deficit' ? 'surplus' : 'deficit'))}
                          className="inline-flex items-center gap-1 uppercase tracking-wider font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                          title={
                            gapSortDir === 'deficit'
                              ? 'Sorted by largest deficit. Click to reverse.'
                              : 'Sorted by surplus first. Click to show largest deficits.'
                          }
                        >
                          Gap
                          {gapSortDir === 'deficit' ? (
                            <ArrowDown className="w-3 h-3 text-rose-500" />
                          ) : (
                            <ArrowUp className="w-3 h-3 text-emerald-500" />
                          )}
                        </button>
                      </th>
                      {showRemindColumn && <th className="py-3 px-4 text-right">Remind</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 text-xs">
                    {sortedActivities.length === 0 ? (
                      <tr>
                        <td colSpan={showRemindColumn ? 6 : 5} className="py-12 text-center text-zinc-400 font-medium">
                          No member compliance records found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      sortedActivities.map((act) => {
                        const hours = hoursByUser[act.user_id];
                        const isSending = isSendingReminder[act.user_id];
                        const hasOpen = hours?.hasOpen || openRequestIds.has(act.user_id);
                        const status = personStatus(act.user_id);
                        const canRemind = status === 'missing' && !hasOpen;
                        const hasWorked = Boolean(hours?.hasCheckout || (hours?.worked || 0) > 0);
                        const comparable = status !== 'on_leave' && status !== 'not_started' && hasWorked;
                        const signedGap = hours?.signedGap || 0;
                        const tone = gapTone(signedGap, comparable && status !== 'missing');
                        const role = (hours?.role || act.role || '').toLowerCase();
                        const showHrBadge =
                          isAdmin &&
                          role === 'hr' &&
                          (hrExceptionUserIds.has(act.user_id) ||
                            status === 'missing' ||
                            (comparable && Math.abs(signedGap) > 0.01));
                        const rowTint =
                          status !== 'missing' && tone === 'deficit'
                            ? 'bg-rose-50/60 dark:bg-rose-950/20'
                            : '';

                        return (
                          <tr
                            key={act.user_id}
                            onClick={() => setSelectedEmployee(act)}
                            className={`hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 cursor-pointer transition-colors ${rowTint}`}
                            title="Click to view full compliance breakdown and tasks"
                          >
                            <td className="py-3 px-4">
                              <div className="font-bold text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                <span className="hover:underline underline-offset-2">
                                  {act.full_name}
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-400">{act.email}</div>
                            </td>
                            <td className="py-3 px-4">{act.department || '—'}</td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap items-center gap-1">
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
                                {showHrBadge && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                                    <ShieldAlert className="w-3 h-3" /> HR
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <HoursCompareBar
                                logged={hours?.loggedHours || 0}
                                worked={hours?.worked || 0}
                                comparable={comparable}
                                missing={status === 'missing'}
                                inShift={status === 'in_shift'}
                              />
                            </td>
                            <td className="py-3 px-4 font-bold tabular-nums">
                              {status === 'on_leave' || status === 'not_started' || (status === 'in_shift' && !comparable) ? (
                                <span className="text-zinc-400">—</span>
                              ) : status === 'missing' ? (
                                <span className="text-amber-700 dark:text-amber-300">Didn't log</span>
                              ) : tone === 'deficit' ? (
                                <span className="text-rose-600 dark:text-rose-400">{formatSignedHours(signedGap)}</span>
                              ) : tone === 'surplus' ? (
                                <span className="text-emerald-600 dark:text-emerald-400">{formatSignedHours(signedGap)}</span>
                              ) : tone === 'minor' ? (
                                <span className="text-amber-600 dark:text-amber-400">{formatSignedHours(signedGap)}</span>
                              ) : (
                                <span className="text-zinc-400">0h</span>
                              )}
                            </td>
                            {showRemindColumn && (
                              <td className="py-3 px-4 text-right">
                                {hasOpen ? (
                                  <span className="text-[11px] text-zinc-400 font-semibold">Lead already asked</span>
                                ) : canRemind ? (
                                  <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSendReminder(act.user_id, 'email');
                                      }}
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
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                                      >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
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
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
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

      <EmployeeComplianceDrawer
        isOpen={Boolean(selectedEmployee)}
        onClose={() => setSelectedEmployee(null)}
        member={selectedEmployee}
        startDate={activeStartDate}
        endDate={activeEndDate}
        onSendReminder={onSendReminder}
        isSendingReminder={selectedEmployee ? Boolean(isSendingReminder[selectedEmployee.user_id]) : false}
        canRemind={showRemindColumn}
      />
    </div>
  );
};
