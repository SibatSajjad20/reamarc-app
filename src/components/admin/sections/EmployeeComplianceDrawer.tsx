import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Mail,
  MessageSquare,
  Calendar,
} from 'lucide-react';
import type { MemberActivity } from '../../../types/admin';
import type { EmployeeComplianceDetailResponse, DayComplianceDetail } from '../../../types/dailyLog';
import { logExceptionService } from '../../../services/logExceptionService';
import { formatHours, formatSignedHours, gapTone } from '../../../utils/logTimeChecks';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../../ui/sheet';
import { Button } from '../../ui/button';
import { StatusPill } from '../../ui/StatusPill';
import { Callout } from '../../ui/Callout';
import { cn } from '../../../lib/utils';

interface EmployeeComplianceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberActivity | null;
  startDate: string;
  endDate: string;
  onSendReminder: (userId: string, channel: 'email' | 'in_app' | 'all', customMessage?: string) => Promise<void>;
  isSendingReminder?: boolean;
  canRemind?: boolean;
}

export const EmployeeComplianceDrawer: React.FC<EmployeeComplianceDrawerProps> = ({
  isOpen,
  onClose,
  member,
  startDate,
  endDate,
  onSendReminder,
  isSendingReminder = false,
  canRemind = true,
}) => {
  const [data, setData] = useState<EmployeeComplianceDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen || !member || !startDate || !endDate) {
      setData(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    logExceptionService
      .getEmployeeComplianceDetail(member.user_id, startDate, endDate)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          const defaultExp: Record<string, boolean> = {};
          res.days.forEach((d) => {
            if (d.tasks.length > 0 || d.status === 'missing' || d.worked_hours > 0) {
              defaultExp[d.date] = true;
            }
          });
          setExpandedDays(defaultExp);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load employee compliance detail');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, member, startDate, endDate]);

  const toggleDay = (dateStr: string) => {
    setExpandedDays((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  const getDayStatusPill = (day: DayComplianceDetail) => {
    if (day.is_leave) {
      return <StatusPill variant="neutral" label="On leave" />;
    }
    if (day.is_off_day) {
      return <StatusPill variant="neutral" label={day.off_day_label || 'Off day'} />;
    }
    if (day.status === 'submitted') {
      return <StatusPill variant="success" label="Submitted" />;
    }
    if (day.status === 'missing') {
      return <StatusPill variant="danger" label="Missing" />;
    }
    if (day.status === 'in_shift') {
      return <StatusPill variant="accent" label="In shift" />;
    }
    return <StatusPill variant="neutral" label="Not started" />;
  };

  const netGapTone = data ? gapTone(data.total_signed_gap_hours, true) : 'neutral';

  const initials = member?.full_name
    ? member.full_name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] p-0 flex flex-col h-full overflow-hidden bg-surface text-fg"
      >
        {member && (
          <>
            {/* Header */}
            <SheetHeader className="p-6 border-b border-border bg-canvas/40 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-accent-soft text-accent-text border border-accent-200 font-semibold text-sm flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="text-base font-semibold truncate">
                      {member.full_name}
                    </SheetTitle>
                    <SheetDescription className="text-caption text-fg-muted truncate mt-0.5">
                      {member.email}
                    </SheetDescription>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {canRemind && (data?.days_missing || 0) > 0 && (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Mail}
                      loading={isSendingReminder}
                      onClick={() => onSendReminder(member.user_id, 'email')}
                    >
                      Remind
                    </Button>
                  )}
                  {member.phone && (
                    <a
                      href={`https://wa.me/${member.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        `Hi ${member.full_name}, reminder to submit your Daily Log on Reamarc.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center h-7 px-2 rounded-md border border-border bg-surface text-fg hover:bg-hover transition-colors"
                      title="Send WhatsApp reminder"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-success-fg" />
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-caption text-fg-muted">
                <span className="px-2 py-0.5 rounded-full bg-subtle text-fg font-medium capitalize">
                  {member.role || 'Member'}
                </span>
                {member.department && (
                  <span className="px-2 py-0.5 rounded-full bg-subtle text-fg-muted">
                    {member.department}
                  </span>
                )}
                <span className="font-mono text-fg-muted">
                  {startDate} → {endDate}
                </span>
              </div>
            </SheetHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoading ? (
                <div className="space-y-4 py-8 animate-pulse">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-16 rounded-lg bg-subtle" />
                    ))}
                  </div>
                  <div className="h-28 rounded-lg bg-subtle" />
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 rounded-lg bg-subtle" />
                    ))}
                  </div>
                </div>
              ) : error ? (
                <Callout
                  variant="danger"
                  title="Could not load compliance details"
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setError(null);
                        setIsLoading(true);
                        logExceptionService
                          .getEmployeeComplianceDetail(member.user_id, startDate, endDate)
                          .then(setData)
                          .catch((e) => setError(e?.message))
                          .finally(() => setIsLoading(false));
                      }}
                    >
                      Retry
                    </Button>
                  }
                >
                  {error}
                </Callout>
              ) : data ? (
                <>
                  {/* Summary KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 bg-canvas border border-border rounded-lg">
                      <span className="text-xs font-medium text-fg-muted block">
                        Worked
                      </span>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-base font-semibold font-mono text-fg">
                          {formatHours(data.total_worked_hours)}
                        </span>
                        {data.days.some((d) => d.is_live) && (
                          <span className="text-[10px] font-medium text-accent-text bg-accent-soft px-1 rounded">
                            live
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-fg-muted mt-0.5 block">Punches</span>
                    </div>

                    <div className="p-3 bg-canvas border border-border rounded-lg">
                      <span className="text-xs font-medium text-fg-muted block">
                        Logged
                      </span>
                      <div className="mt-1">
                        <span className="text-base font-semibold font-mono text-accent-text">
                          {formatHours(data.total_logged_hours)}
                        </span>
                      </div>
                      <span className="text-xs text-fg-muted mt-0.5 block">Daily logs</span>
                    </div>

                    <div className="p-3 bg-canvas border border-border rounded-lg">
                      <span className="text-xs font-medium text-fg-muted block">
                        Net Gap
                      </span>
                      <div className="mt-1">
                        <span
                          className={cn(
                            'text-base font-semibold font-mono',
                            netGapTone === 'deficit'
                              ? 'text-danger-fg'
                              : netGapTone === 'surplus'
                              ? 'text-success-fg'
                              : 'text-fg'
                          )}
                        >
                          {formatSignedHours(data.total_signed_gap_hours)}
                        </span>
                      </div>
                      <span className="text-xs text-fg-muted mt-0.5 block">
                        {netGapTone === 'deficit'
                          ? 'Under-logged'
                          : netGapTone === 'surplus'
                          ? 'Over-logged'
                          : 'Balanced'}
                      </span>
                    </div>

                    <div className="p-3 bg-canvas border border-border rounded-lg">
                      <span className="text-xs font-medium text-fg-muted block">
                        Submissions
                      </span>
                      <div className="mt-1">
                        <span className="text-base font-semibold font-mono text-fg">
                          {data.days_logged}/{data.days_expected}
                        </span>
                      </div>
                      <span className="text-xs text-fg-muted mt-0.5 block">
                        {data.days_missing > 0 ? (
                          <span className="text-danger-fg font-medium">
                            {data.days_missing} missing
                          </span>
                        ) : (
                          <span className="text-success-fg font-medium">100% complete</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Mini Calendar Heatmap per §13.15.3 */}
                  <div className="p-4 bg-canvas border border-border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                        <Calendar className="w-3.5 h-3.5 text-fg-muted" />
                        <span>Calendar activity</span>
                      </div>
                      <span className="text-xs text-fg-muted font-mono">
                        {data.days.length} days
                      </span>
                    </div>

                    {/* Heatmap Grid */}
                    <div className="grid grid-cols-7 gap-1.5">
                      {data.days.map((day) => {
                        const dayNumber = day.date ? day.date.split('-')[2] : '';
                        const dayLetter = day.day_name ? day.day_name.slice(0, 3) : '';

                        let cellClass = 'bg-surface border-border text-fg-muted';
                        if (day.status === 'submitted') {
                          cellClass = 'bg-success-bg border-success-bd text-success-fg hover:border-success-solid';
                        } else if (day.status === 'missing') {
                          cellClass = 'bg-danger-bg border-danger-bd text-danger-fg hover:border-danger-solid';
                        } else if (day.status === 'in_shift') {
                          cellClass = 'bg-accent-soft border-accent-200 text-accent-text hover:border-accent';
                        } else if (day.is_off_day) {
                          cellClass = 'bg-subtle/50 border-border text-fg-faint';
                        } else if (day.is_leave) {
                          cellClass = 'bg-warning-bg border-warning-bd text-warning-fg';
                        }

                        return (
                          <button
                            key={day.date}
                            type="button"
                            onClick={() => toggleDay(day.date)}
                            className={cn(
                              'p-1.5 rounded-md border flex flex-col items-center justify-center transition-colors cursor-pointer text-center select-none',
                              cellClass
                            )}
                            title={`${day.date} (${day.day_name}): ${day.status} - ${formatHours(day.logged_hours)} logged / ${formatHours(day.worked_hours)} work`}
                          >
                            <span className="text-[10px] font-medium block opacity-75">
                              {dayLetter}
                            </span>
                            <span className="text-xs font-mono font-semibold tabular-nums leading-tight">
                              {dayNumber}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-3 flex-wrap pt-1 text-xs text-fg-muted">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-success-solid" />
                        <span>Submitted</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-danger-solid" />
                        <span>Missing</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-accent" />
                        <span>In shift</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-subtle" />
                        <span>Off day</span>
                      </div>
                    </div>
                  </div>

                  {/* History Timeline per §13.15.3 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-0.5">
                      <h4 className="text-xs font-semibold text-fg">
                        History timeline
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const allExp: Record<string, boolean> = {};
                            data.days.forEach((d) => (allExp[d.date] = true));
                            setExpandedDays(allExp);
                          }}
                          className="text-xs font-medium text-accent-text hover:underline cursor-pointer"
                        >
                          Expand all
                        </button>
                        <span className="text-border">•</span>
                        <button
                          type="button"
                          onClick={() => setExpandedDays({})}
                          className="text-xs font-medium text-fg-muted hover:text-fg cursor-pointer"
                        >
                          Collapse all
                        </button>
                      </div>
                    </div>

                    {/* Vertical Timeline Rail */}
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
                      {data.days.map((day) => {
                        const isExpanded = Boolean(expandedDays[day.date]);
                        const tone = gapTone(day.signed_gap_hours, day.worked_hours > 0 && day.status !== 'missing');

                        let dotColor = 'bg-subtle border-border';
                        if (day.status === 'submitted') {
                          dotColor = 'bg-success-solid border-success-bd';
                        } else if (day.status === 'missing') {
                          dotColor = 'bg-danger-solid border-danger-bd';
                        } else if (day.status === 'in_shift') {
                          dotColor = 'bg-accent border-accent-200';
                        }

                        return (
                          <div key={day.date} className="relative">
                            {/* Dot on rail */}
                            <div
                              className={cn(
                                'absolute -left-6 top-3 w-4 h-4 rounded-full border-2 border-surface flex items-center justify-center shrink-0',
                                dotColor
                              )}
                            />

                            {/* Day Card */}
                            <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-xs">
                              <div
                                onClick={() => toggleDay(day.date)}
                                className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-hover select-none transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="min-w-[80px]">
                                    <div className="text-xs font-semibold text-fg">
                                      {day.day_name}
                                    </div>
                                    <div className="text-xs text-fg-muted font-mono">
                                      {day.date}
                                    </div>
                                  </div>
                                  <div>{getDayStatusPill(day)}</div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right">
                                    <div className="text-xs font-mono font-medium text-fg tabular-nums">
                                      {formatHours(day.logged_hours)}
                                      <span className="text-fg-muted font-normal"> / {formatHours(day.worked_hours)}</span>
                                    </div>
                                    {day.worked_hours > 0 && (
                                      <div
                                        className={cn(
                                          'text-[10px] font-mono font-semibold tabular-nums',
                                          tone === 'deficit'
                                            ? 'text-danger-fg'
                                            : tone === 'surplus'
                                            ? 'text-success-fg'
                                            : 'text-fg-muted'
                                        )}
                                      >
                                        {formatSignedHours(day.signed_gap_hours)}
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-fg-muted">
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Collapsible Details */}
                              {isExpanded && (
                                <div className="px-4 pb-4 pt-2 border-t border-border bg-subtle/20 space-y-3">
                                  {/* Attendance punch details */}
                                  <div className="flex items-center gap-4 text-xs text-fg-muted flex-wrap">
                                    <span>
                                      Check in:{' '}
                                      <strong className="text-fg font-mono">
                                        {day.check_in || '—'}
                                      </strong>
                                    </span>
                                    <span>
                                      Check out:{' '}
                                      <strong className="text-fg font-mono">
                                        {day.check_out || '—'}
                                      </strong>
                                    </span>
                                    <span>
                                      Duration:{' '}
                                      <strong className="text-fg font-mono">
                                        {formatHours(day.worked_hours)}
                                      </strong>
                                      {day.is_live && (
                                        <span className="ml-1 text-[10px] font-medium text-accent-text bg-accent-soft px-1 rounded">
                                          live
                                        </span>
                                      )}
                                    </span>
                                  </div>

                                  {/* Member reason if any */}
                                  {day.member_reason && (
                                    <Callout variant="warning" title="Employee explanation">
                                      {day.member_reason}
                                    </Callout>
                                  )}

                                  {/* Tasks */}
                                  {day.tasks.length > 0 ? (
                                    <div className="space-y-1.5 pt-1">
                                      <span className="text-xs font-medium text-fg-muted block">
                                        Logged tasks ({day.tasks.length})
                                      </span>
                                      <div className="space-y-1.5">
                                        {day.tasks.map((t, idx) => (
                                          <div
                                            key={t.id || idx}
                                            className="p-2.5 bg-surface border border-border rounded-md flex items-start justify-between gap-3 text-xs"
                                          >
                                            <div className="space-y-1 min-w-0 flex-1">
                                              <div className="font-medium text-fg leading-snug">
                                                {t.task_description}
                                              </div>
                                              <div className="flex items-center gap-2 flex-wrap text-caption text-fg-muted">
                                                {t.client_project && (
                                                  <span className="font-semibold text-fg">
                                                    {t.client_project}
                                                  </span>
                                                )}
                                                {t.task_type && (
                                                  <span className="px-1.5 py-0.2 rounded bg-subtle text-[10px]">
                                                    {t.task_type}
                                                  </span>
                                                )}
                                                {t.task_status && (
                                                  <span
                                                    className={cn(
                                                      'px-1.5 py-0.2 rounded text-[10px] font-medium',
                                                      t.task_status === 'Completed'
                                                        ? 'bg-success-bg text-success-fg'
                                                        : 'bg-warning-bg text-warning-fg'
                                                    )}
                                                  >
                                                    {t.task_status}
                                                  </span>
                                                )}
                                              </div>
                                              {t.blockers && (
                                                <div className="text-caption text-danger-fg">
                                                  Blocker: {t.blockers}
                                                </div>
                                              )}
                                            </div>
                                            <div className="shrink-0 font-mono font-medium tabular-nums text-fg bg-subtle px-2 py-0.5 rounded text-xs">
                                              {formatHours(t.hours_utilized)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : day.status === 'missing' ? (
                                    <div className="p-2.5 bg-danger-bg border border-danger-bd rounded-md text-xs text-danger-fg flex items-center gap-2">
                                      <AlertTriangle className="w-4 h-4 shrink-0" />
                                      <span>
                                        No Daily Log submitted for this shift ({formatHours(day.worked_hours)} at work).
                                      </span>
                                    </div>
                                  ) : !day.is_off_day && !day.is_leave && day.worked_hours === 0 ? (
                                    <div className="text-xs text-fg-faint italic py-1">
                                      No attendance or logs recorded for this day.
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
