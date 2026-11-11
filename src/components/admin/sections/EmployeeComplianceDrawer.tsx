import React, { useEffect, useState, useMemo } from 'react';
import {
  Download,
  Mail,
  Info,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { EmployeeDetailResponse, LogVarianceDay } from '../../../types/logVariance';
import { logVarianceService } from '../../../services/logVarianceService';
import {
  formatMinutes,
  formatSignedMinutes,
  formatPercentage,
  getCoverageTone,
  getToneTextClass,
  pktTodayIso,
} from '../../../utils/logVarianceFormat';
import { Badge } from '../../ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet';
import { Button } from '../../ui/button';
import { StatusPill } from '../../ui/StatusPill';
import { Callout } from '../../ui/Callout';
import { Avatar } from '../../ui/Avatar';
import { DrawerSkeleton } from '../../ui/Skeletons';
import { ErrorState } from '../../ui/ErrorState';
import { cn } from '../../../lib/utils';
import { getRoleDisplayName } from '../../../lib/roleLabel';

interface EmployeeComplianceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  member: {
    user_id: string;
    full_name?: string;
    name?: string;
    email?: string;
    department?: string | null;
    role?: string;
  } | null;
  startDate: string;
  endDate: string;
  rangeLabel?: string;
  onSendReminder?: (userId: string, channel: 'email' | 'in_app' | 'all', customMessage?: string) => Promise<void>;
  isSendingReminder?: boolean;
  canRemind?: boolean;
}

const formatDisplayDate = (isoStr: string): string => {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const EmployeeComplianceDrawer: React.FC<EmployeeComplianceDrawerProps> = ({
  isOpen,
  onClose,
  member,
  startDate,
  endDate,
  rangeLabel,
  onSendReminder,
  isSendingReminder = false,
  canRemind = true,
}) => {
  const [data, setData] = useState<EmployeeDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!isOpen || !member?.user_id || !startDate || !endDate) {
      setData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    const fetchDetail = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await logVarianceService.getEmployeeDetail(member.user_id, startDate, endDate);
        if (isMounted) {
          setData(res);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load employee drilldown');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchDetail();
    return () => {
      isMounted = false;
    };
  }, [isOpen, member?.user_id, startDate, endDate]);

  const toggleDayExpanded = (dStr: string) => {
    setExpandedDays((prev) => ({ ...prev, [dStr]: !prev[dStr] }));
  };

  const handleExport = async () => {
    if (!startDate || !endDate) return;
    setIsExporting(true);
    try {
      const blob = await logVarianceService.exportExcel(startDate, endDate, data?.user.department || undefined);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Log variance ${startDate}_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // Export error
    } finally {
      setIsExporting(false);
    }
  };

  const pendingOtDaysNote = useMemo(() => {
    if (!data?.days) return '';
    const otList = data.days
      .filter((d) => d.pending_ot > 0)
      .map((d) => `${formatDisplayDate(d.date)} ${formatMinutes(d.pending_ot)}`);
    return otList.join(', ');
  }, [data]);

  const summary = data?.summary;
  const user = data?.user;

  // Direct from server summary (§2.8.3, §2.9.1), with fallback for legacy responses
  const totalPendingOtMinutes =
    summary?.pending_ot != null
      ? summary.pending_ot
      : (data?.days?.reduce((acc, d) => acc + (d.pending_ot || 0), 0) ?? 0);

  // Hide future days (§2.9.3)
  const todayCutoff = data?.range?.today || pktTodayIso();
  const visibleDays = useMemo(() => {
    return (data?.days || []).filter((d) => d.date <= todayCutoff);
  }, [data?.days, todayCutoff]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="xl" className="flex flex-col h-full p-0 bg-surface">
        {/* Header */}
        <SheetHeader className="p-5 border-b border-border bg-surface shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar
                name={user?.name || member?.full_name || member?.name || 'User'}
                src={user?.avatar || undefined}
                size={36}
              />
              <div>
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-lg font-semibold text-fg">
                    {user?.name || member?.full_name || member?.name}
                  </SheetTitle>
                  {user?.inactive && (
                    <Badge variant="outline" className="text-micro text-danger-fg border-danger-bd bg-danger-bg font-semibold uppercase px-1.5 py-0.5 rounded">
                      INACTIVE
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-fg-muted mt-0.5">
                  <span>{getRoleDisplayName(user?.role || member?.role || 'team_member')}</span>
                  {(user?.department || member?.department) && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span>{user?.department || member?.department}</span>
                    </>
                  )}
                  {(user?.email || member?.email) && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span>{user?.email || member?.email}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canRemind && onSendReminder && member?.user_id && !user?.inactive && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Mail}
                  disabled={isSendingReminder}
                  onClick={() => onSendReminder(member.user_id, 'email')}
                >
                  Remind
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                loading={isExporting}
                onClick={handleExport}
              >
                Export
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 text-xs text-fg-muted">
            <div className="flex items-center gap-1 font-medium text-fg">
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>{rangeLabel || `${startDate} – ${endDate}`}</span>
            </div>
            <span>·</span>
            <span>Showing days up to today. Future days hidden.</span>
          </div>
        </SheetHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {isLoading && <DrawerSkeleton />}

          {error && !isLoading && (
            <ErrorState title="Could not load employee details" message={error} />
          )}

          {!isLoading && !error && summary && (
            <>
              {/* Range KPIs: 8 cards in 2 rows */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Worked */}
                <div className="p-3 bg-canvas border border-border rounded-lg flex flex-col justify-between">
                  <span className="text-xs text-fg-muted font-medium">Worked</span>
                  <div className="my-1">
                    <span className="text-xl font-semibold text-fg">
                      {formatMinutes(summary.worked)}
                    </span>
                  </div>
                  <span className="text-[11px] text-fg-muted truncate">
                    {totalPendingOtMinutes > 0
                      ? `incl. ${formatMinutes(totalPendingOtMinutes)} pending OT`
                      : `${summary.days_present} present days`}
                  </span>
                </div>

                {/* Logged */}
                <div className="p-3 bg-canvas border border-border rounded-lg flex flex-col justify-between">
                  <span className="text-xs text-fg-muted font-medium">Logged</span>
                  <div className="my-1">
                    <span className="text-xl font-semibold text-fg">
                      {formatMinutes(summary.logged)}
                    </span>
                  </div>
                  <span className="text-[11px] text-fg-muted truncate">
                    same present days
                  </span>
                </div>

                {/* Variance */}
                <div className="p-3 bg-canvas border border-border rounded-lg flex flex-col justify-between">
                  <span className="text-xs text-fg-muted font-medium">Variance</span>
                  <div className="my-1">
                    <span className={cn('text-xl font-semibold', getToneTextClass(summary.variance > 60 ? 'danger' : summary.variance > 30 ? 'warning' : 'success'))}>
                      {formatSignedMinutes(summary.variance)}
                    </span>
                  </div>
                  <span className="text-[11px] text-fg-muted truncate">
                    worked − logged
                  </span>
                </div>

                {/* Coverage */}
                <div className="p-3 bg-canvas border border-border rounded-lg flex flex-col justify-between">
                  <span className="text-xs text-fg-muted font-medium">Coverage</span>
                  <div className="my-1">
                    <span className={cn('text-xl font-semibold', getToneTextClass(getCoverageTone(summary.coverage_pct)))}>
                      {formatPercentage(summary.coverage_pct, 0)}
                    </span>
                  </div>
                  <span className="text-[11px] text-fg-muted truncate">
                    logged ÷ worked
                  </span>
                </div>

                {/* Avg logged / day */}
                <div className="p-3 bg-canvas border border-border rounded-lg flex flex-col justify-between">
                  <span className="text-xs text-fg-muted font-medium">Avg logged / day</span>
                  <div className="my-1">
                    <span className="text-xl font-semibold text-fg">
                      {formatMinutes(summary.avg_logged_per_day)}
                    </span>
                  </div>
                  <span className="text-[11px] text-fg-muted truncate">
                    {summary.days_present > 0
                      ? `${formatMinutes(summary.logged)} ÷ ${summary.days_present} days present`
                      : '—'}
                  </span>
                </div>

                {/* Avg worked / day */}
                <div className="p-3 bg-canvas border border-border rounded-lg flex flex-col justify-between">
                  <span className="text-xs text-fg-muted font-medium">Avg worked / day</span>
                  <div className="my-1">
                    <span className="text-xl font-semibold text-fg">
                      {formatMinutes(summary.avg_worked_per_day)}
                    </span>
                  </div>
                  <span className="text-[11px] text-fg-muted truncate">
                    {summary.days_present > 0
                      ? `${formatMinutes(summary.worked)} ÷ ${summary.days_present} days present`
                      : '—'}
                  </span>
                </div>

                {/* Submission */}
                <div className="p-3 bg-canvas border border-border rounded-lg flex flex-col justify-between">
                  <span className="text-xs text-fg-muted font-medium">Submission</span>
                  <div className="my-1">
                    <span className="text-xl font-semibold text-fg">
                      {formatPercentage(summary.submission_pct, 0)}
                    </span>
                  </div>
                  <span className="text-[11px] text-fg-muted truncate">
                    {summary.days_logged} of {summary.days_present} present days
                  </span>
                </div>

                {/* Excluded logs */}
                <div className="p-3 bg-canvas border border-border rounded-lg flex flex-col justify-between">
                  <span className="text-xs text-fg-muted font-medium">Excluded logs</span>
                  <div className="my-1">
                    <span className="text-xl font-semibold text-fg">
                      {formatMinutes(summary.logged_outside)}
                    </span>
                  </div>
                  <span className="text-[11px] text-fg-muted truncate">
                    on leave/off days, not in totals
                  </span>
                </div>
              </div>

              {/* Day by Day Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-fg">Day by day</h4>
                  <span className="text-xs text-fg-muted">
                    Greyed days are shown for context and excluded from totals and averages
                  </span>
                </div>

                <div className="border border-border rounded-lg overflow-hidden bg-surface">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-canvas border-b border-border text-fg-muted font-medium">
                        <tr>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">In</th>
                          <th className="py-2.5 px-3">Out</th>
                          <th className="py-2.5 px-3 text-right">Worked</th>
                          <th className="py-2.5 px-3 text-right">Pending OT</th>
                          <th className="py-2.5 px-3 text-right">Logged</th>
                          <th className="py-2.5 px-3 text-right">Variance</th>
                          <th className="py-2.5 px-3">Flags</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {visibleDays.map((day) => {
                          const isGreyed = !day.compare_ready && day.status !== 'live';
                          const isExpanded = Boolean(expandedDays[day.date]);
                          const hasTasks = day.tasks && day.tasks.length > 0;

                          return (
                            <React.Fragment key={day.date}>
                              <tr
                                className={cn(
                                  'hover:bg-hover transition-colors',
                                  isGreyed && 'opacity-60 bg-canvas/40'
                                )}
                              >
                                <td className="py-2 px-3 font-medium text-fg whitespace-nowrap">
                                  {formatDisplayDate(day.date)}
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                  {renderStatusPill(day)}
                                </td>
                                <td className="py-2 px-3 text-fg-muted whitespace-nowrap">
                                  {day.check_in || '—'}
                                </td>
                                <td className="py-2 px-3 text-fg-muted whitespace-nowrap">
                                  {day.check_out || '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-medium text-fg whitespace-nowrap">
                                  {day.status === 'live'
                                    ? `${formatMinutes(day.worked)} so far`
                                    : day.compare_ready
                                    ? formatMinutes(day.worked)
                                    : '—'}
                                </td>
                                <td className="py-2 px-3 text-right text-fg-muted whitespace-nowrap">
                                  {day.pending_ot > 0 ? formatMinutes(day.pending_ot) : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-medium text-fg whitespace-nowrap">
                                  {day.logged > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => hasTasks && toggleDayExpanded(day.date)}
                                      className={cn(
                                        'inline-flex items-center gap-1 hover:underline cursor-pointer',
                                        hasTasks && 'text-accent-fg font-semibold'
                                      )}
                                    >
                                      {formatMinutes(day.logged)}
                                      {hasTasks && (
                                        isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                      )}
                                    </button>
                                  ) : day.compare_ready ? (
                                    '0m'
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-medium whitespace-nowrap">
                                  {day.compare_ready ? (
                                    <span className={getToneTextClass(day.tone)}>
                                      {formatSignedMinutes(day.variance)}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {renderDayFlags(day)}
                                  </div>
                                </td>
                              </tr>

                              {/* Expanded Tasks Row */}
                              {isExpanded && hasTasks && (
                                <tr className="bg-canvas/80 border-b border-border">
                                  <td colSpan={9} className="p-3">
                                    <div className="space-y-2">
                                      <span className="text-xs font-semibold text-fg">
                                        Tasks logged on this day:
                                      </span>
                                      <div className="divide-y divide-border border border-border rounded bg-surface text-xs">
                                        {day.tasks.map((task, tIdx) => (
                                          <div
                                            key={task.id || tIdx}
                                            className="p-2 flex items-center justify-between gap-3"
                                          >
                                            <div className="flex-1 min-w-0">
                                              <p className="font-medium text-fg truncate">
                                                {task.task_description}
                                              </p>
                                              <div className="flex items-center gap-2 text-[11px] text-fg-muted mt-0.5">
                                                {task.client_project && <span>{task.client_project}</span>}
                                                {task.task_type && (
                                                  <>
                                                    <span>·</span>
                                                    <span>{task.task_type}</span>
                                                  </>
                                                )}
                                                {task.task_status && (
                                                  <>
                                                    <span>·</span>
                                                    <span className="capitalize">{task.task_status}</span>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                            <span className="font-semibold text-fg whitespace-nowrap">
                                              {task.hours_utilized}h
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      {/* Footer: Totals */}
                      <tfoot className="bg-canvas border-t-2 border-border font-semibold text-fg">
                        <tr>
                          <td className="py-2.5 px-3">
                            Total · {summary.days_present} present days
                          </td>
                          <td colSpan={3}></td>
                          <td className="py-2.5 px-3 text-right">
                            {formatMinutes(summary.worked)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {totalPendingOtMinutes > 0 ? formatMinutes(totalPendingOtMinutes) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatMinutes(summary.logged)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={getToneTextClass(summary.variance > 60 ? 'danger' : summary.variance > 30 ? 'warning' : 'success')}>
                              {formatSignedMinutes(summary.variance)}
                            </span>
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* Explanatory Callout */}
              <Callout
                variant="info"
                icon={Info}
                className="text-xs text-fg-muted"
              >
                Worked includes{' '}
                <strong className="text-fg font-semibold">
                  {formatMinutes(totalPendingOtMinutes)} pending overtime
                </strong>{' '}
                {pendingOtDaysNote ? `(${pendingOtDaysNote}) ` : ''}so it matches what{' '}
                {user?.name || 'the employee'} sees on their own Daily Log. If a lead rejects it,
                it drops out of Worked. Off days, leave and today are shown for context only.
              </Callout>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

function renderStatusPill(day: LogVarianceDay) {
  switch (day.status) {
    case 'present':
      return <StatusPill variant="success">{day.status_label || 'Present'}</StatusPill>;
    case 'live':
      return <StatusPill variant="info">{day.status_label || 'Live'}</StatusPill>;
    case 'half_day':
      return <StatusPill variant="warning">{day.status_label || 'Half day'}</StatusPill>;
    case 'wfh':
      return <StatusPill variant="info">{day.status_label || 'WFH'}</StatusPill>;
    case 'missing_checkout':
      return <StatusPill variant="danger">Missing checkout</StatusPill>;
    case 'absent':
      return <StatusPill variant="danger">Absent</StatusPill>;
    case 'leave':
      return <StatusPill variant="neutral">{day.status_label || 'Leave'}</StatusPill>;
    case 'off':
    case 'holiday':
      return <span className="text-xs text-fg-muted">{day.status_label || 'Off'}</span>;
    case 'not_employed':
      return <span className="text-xs text-fg-muted">Not employed</span>;
    default:
      return <span className="text-xs text-fg-muted">{day.status_label || day.status}</span>;
  }
}

function renderDayFlags(day: LogVarianceDay) {
  if (day.flags.includes('EXCLUDED FROM AVERAGE')) {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted-bg text-fg-muted border border-border">
        EXCLUDED FROM AVERAGE
      </span>
    );
  }
  if (day.flags.includes('NOT IN TOTALS YET')) {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-info-bg text-info-fg border border-info-bd">
        NOT IN TOTALS YET
      </span>
    );
  }

  return day.flags.map((flag, idx) => {
    if (flag === 'large_variance') {
      return (
        <span
          key={idx}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning-bg text-warning-fg border border-warning-bd"
        >
          Large variance
        </span>
      );
    }
    if (flag === 'missing_checkout') {
      return (
        <span
          key={idx}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-danger-bg text-danger-fg border border-danger-bd"
        >
          Missing checkout
        </span>
      );
    }
    if (flag === 'over_logged') {
      return (
        <span
          key={idx}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-info-bg text-info-fg border border-info-bd"
        >
          Logged &gt; worked
        </span>
      );
    }
    if (flag === 'no_log') {
      return (
        <span
          key={idx}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-danger-bg text-danger-fg border border-danger-bd"
        >
          No log
        </span>
      );
    }
    return null;
  });
}
