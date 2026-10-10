import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  Mail,
  CheckCircle2,
  Send,
  Search,
  Layers,
  Coffee,
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
  pluralize,
} from '../../../utils/logTimeChecks';
import { useToast } from '../../../context/ToastContext';
import { PageHeader } from '../../ui/PageHeader';
import { Button } from '../../ui/button';
import {
  TableCard,
  TableToolbar,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
  TableSkeletonRows,
} from '../../ui/DataTable';
import { Progress } from '../../ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';
import { cn } from '../../../lib/utils';

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
  const { addToast } = useToast();
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
  const { getOffDay } = useOffDays();
  const viewingOff = range === 'today' ? getOffDay(todayIso()) : { isOff: false, label: 'Working day' as const };
  const isSelectedDateExpired = range === 'week' ? !isCurrentWeek : range === 'range' ? customEndDate < todayIso() : false;
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
          addToast('Could not load overview', err.message || 'Try again.', 'error');
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
    rows.sort((a, b) => {
      const sa = personStatus(a.user_id);
      const sb = personStatus(b.user_id);
      if (sa === 'missing' && sb !== 'missing') return -1;
      if (sb === 'missing' && sa !== 'missing') return 1;
      return a.full_name.localeCompare(b.full_name);
    });
    return rows;
  }, [filteredActivities, personStatus]);

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
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-canvas p-6 space-y-6">
      <PageHeader
        title="Log compliance"
        description="Track daily log submissions, missing logs, and send compliance reminders."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-md border border-border p-0.5 bg-subtle">
              <button
                type="button"
                onClick={() => {
                  setRange('today');
                  setIsRangePickerOpen(false);
                }}
                className={cn(
                  'px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                  range === 'today'
                    ? 'bg-surface text-fg shadow-xs font-semibold'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  setRange('week');
                  setIsRangePickerOpen(false);
                }}
                className={cn(
                  'px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                  range === 'week'
                    ? 'bg-surface text-fg shadow-xs font-semibold'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                This week
              </button>
            </div>

            {range === 'week' && (
              <div className="flex items-center gap-1 bg-surface px-1.5 py-0.5 rounded-md border border-border">
                <button
                  type="button"
                  onClick={handlePrevWeek}
                  title="Previous week (Mon-Sat)"
                  className="p-1 rounded hover:bg-hover text-fg-muted hover:text-fg transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-numeric font-medium px-1 text-fg tabular-nums">
                  {weekLabel}
                </span>
                <button
                  type="button"
                  onClick={handleNextWeek}
                  disabled={!canGoNextWeek}
                  title={canGoNextWeek ? 'Next week (Mon-Sat)' : 'Current week (latest)'}
                  className="p-1 rounded hover:bg-hover text-fg-muted hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="relative" ref={rangePickerRef}>
              <Button
                variant={range === 'range' ? 'primary' : 'secondary'}
                size="sm"
                icon={Calendar}
                onClick={() => setIsRangePickerOpen((o) => !o)}
              >
                {range === 'range'
                  ? `${formatShortDisplay(customStartDate)} – ${formatShortDisplay(customEndDate)}`
                  : 'Date range'}
              </Button>

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
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-warning-bg text-warning-fg border border-warning-bd text-xs font-medium">
                <Coffee className="w-3.5 h-3.5 shrink-0" />
                <span>{viewingOff.label}</span>
              </div>
            )}

            {showRemindColumn && missingTodayCount > 0 && !viewingOff.isOff && (
              <Button
                variant="primary"
                size="sm"
                icon={BellRing}
                loading={isSendingBatch}
                onClick={handleBatchReminder}
              >
                Remind missing ({missingTodayCount})
              </Button>
            )}
          </div>
        }
      />

      {batchSuccessMsg && (
        <div className="p-3 bg-success-bg border border-success-bd text-success-fg text-xs font-medium rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{batchSuccessMsg}</span>
        </div>
      )}

      {viewingOff.isOff && (snap?.logs_submitted || 0) === 0 && (snap?.worked_hours || 0) === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center shadow-xs">
          <div className="w-12 h-12 rounded-lg bg-warning-bg text-warning-fg flex items-center justify-center mx-auto mb-3 border border-warning-bd">
            <Coffee className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-fg">
            No compliance monitoring required
          </h3>
          <p className="mt-1 text-xs text-fg-muted max-w-md mx-auto">
            Today is a scheduled non-working day ({viewingOff.label}). Shifts and daily logs are not enforced, and compliance reminders are suspended.
          </p>
        </div>
      ) : (
        <TableCard>
          <TableToolbar>
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
                <input
                  type="text"
                  placeholder="Search member..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-md border border-border p-0.5 bg-subtle">
                {(['all', 'missing', 'logged'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                      statusFilter === st
                        ? 'bg-surface text-fg shadow-xs font-semibold'
                        : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    {st === 'all' ? 'All' : st === 'missing' ? 'Missing' : 'Logged'}
                  </button>
                ))}
              </div>

              <div className="w-44">
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
          </TableToolbar>

          {snap && (
            <div className="px-4 py-2 border-b border-border bg-subtle/30 text-xs text-fg-muted flex items-center justify-between">
              <div>
                <span className="font-medium text-fg">{snap.summary || fallbackSummary}</span>
                <span className="ml-2">
                  {formatHours(snap.worked_hours || 0)} at work vs {formatHours(snap.logged_hours || 0)} in the log
                </span>
              </div>
              <div className="text-fg-faint">
                {sortedActivities.length} {pluralize(sortedActivities.length, 'member')}
              </div>
            </div>
          )}

          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Department</TH>
                <TH>Days missing</TH>
                <TH>Last log date</TH>
                <TH>Compliance</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {snapLoading || isLoading ? (
                <TableSkeletonRows rows={6} columns={6} />
              ) : sortedActivities.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="py-12 text-center text-fg-muted">
                    No compliance records found matching the active filters.
                  </TD>
                </TR>
              ) : (
                sortedActivities.map((act) => {
                  const hours = hoursByUser[act.user_id];
                  const hasOpen = hours?.hasOpen || openRequestIds.has(act.user_id);
                  const status = personStatus(act.user_id);
                  const canRemind = status === 'missing' && !hasOpen;

                  const daysMissing =
                    range === 'today'
                      ? status === 'missing'
                        ? 1
                        : 0
                      : act.days_missed !== undefined && act.days_missed >= 0
                      ? act.days_missed
                      : (act.missing_dates?.length ?? (status === 'missing' ? 1 : 0));

                  let compliancePct = 100;
                  if (range === 'today') {
                    if (status === 'missing') compliancePct = 0;
                    else if (status === 'submitted') compliancePct = 100;
                    else if (hours?.worked && hours.worked > 0 && hours.loggedHours !== undefined) {
                      compliancePct = Math.min(100, Math.round((hours.loggedHours / hours.worked) * 100));
                    } else {
                      compliancePct = 100;
                    }
                  } else {
                    if (hours?.worked && hours.worked > 0 && hours.loggedHours !== undefined) {
                      compliancePct = Math.min(100, Math.round((hours.loggedHours / hours.worked) * 100));
                    } else if (act.days_missed !== undefined) {
                      const totalDays = range === 'week' ? 6 : 7;
                      compliancePct = Math.max(0, Math.round(((totalDays - act.days_missed) / totalDays) * 100));
                    } else if (status === 'missing') {
                      compliancePct = 0;
                    } else {
                      compliancePct = 100;
                    }
                  }

                  const initials = act.full_name
                    ? act.full_name
                        .split(' ')
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'U';

                  const lastLogStr = act.last_logged_date
                    ? formatShortDisplay(act.last_logged_date)
                    : 'Never';

                  return (
                    <TR
                      key={act.user_id}
                      clickable
                      onClick={() => setSelectedEmployee(act)}
                    >
                      {/* Member */}
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-text border border-accent-200 font-semibold text-xs flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-fg truncate">
                              {act.full_name}
                            </div>
                            <div className="text-caption text-fg-muted truncate">
                              {act.email}
                            </div>
                          </div>
                        </div>
                      </TD>

                      {/* Department */}
                      <TD>
                        <span className="text-small text-fg-muted">
                          {act.department || '—'}
                        </span>
                      </TD>

                      {/* Days missing */}
                      <TD>
                        <span
                          className={cn(
                            'font-numeric tabular-nums text-small',
                            daysMissing > 0 ? 'text-danger-fg font-semibold' : 'text-fg-muted'
                          )}
                        >
                          {daysMissing}
                        </span>
                      </TD>

                      {/* Last log date */}
                      <TD>
                        <span className="text-small text-fg-muted">
                          {lastLogStr}
                        </span>
                      </TD>

                      {/* Compliance % as Progress (48px) + value */}
                      <TD>
                        <div className="flex items-center gap-2">
                          <div className="w-12">
                            <Progress
                              value={compliancePct}
                              indicatorClassName={
                                compliancePct >= 80
                                  ? 'bg-accent'
                                  : compliancePct >= 50
                                  ? 'bg-warning-solid'
                                  : 'bg-danger-solid'
                              }
                            />
                          </div>
                          <span className="font-numeric text-small tabular-nums text-fg-muted w-9">
                            {compliancePct}%
                          </span>
                        </div>
                      </TD>

                      {/* Actions */}
                      <TD align="right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {showRemindColumn && canRemind ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={Mail}
                              loading={isSendingReminder[act.user_id]}
                              onClick={() => {
                                setCustomReminderUser(act);
                                setCustomMessage(
                                  `Hi ${act.full_name}, reminder to submit your Daily Log on Reamarc.`
                                );
                              }}
                            >
                              Send reminder
                            </Button>
                          ) : hasOpen ? (
                            <span className="text-caption text-fg-muted">
                              Lead already asked
                            </span>
                          ) : null}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedEmployee(act)}
                          >
                            View
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </TableCard>
      )}

      {/* Send reminder dialog (Dialog 400 per §13.15.3) */}
      <Dialog
        open={Boolean(customReminderUser)}
        onOpenChange={(open) => {
          if (!open) setCustomReminderUser(null);
        }}
      >
        <DialogContent maxWidth="sm">
          <DialogHeader>
            <DialogTitle>Send reminder to {customReminderUser?.full_name}</DialogTitle>
            <DialogDescription>
              Send an email reminder to submit missing daily logs.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-3">
            <div className="text-xs text-fg-muted">
              Recipient:{' '}
              <span className="font-medium text-fg">{customReminderUser?.email}</span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-fg">Message</label>
              <Textarea
                rows={4}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Enter reminder note..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setCustomReminderUser(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={Send}
              loading={customReminderUser ? isSendingReminder[customReminderUser.user_id] : false}
              onClick={handleSendCustomReminder}
            >
              Send reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail drawer (Sheet 480 per §13.15.3) */}
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
