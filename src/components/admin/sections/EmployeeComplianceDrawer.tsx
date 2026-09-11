import React, { useEffect, useState } from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  MessageSquare,
  Coffee,
} from 'lucide-react';
import type { MemberActivity } from '../../../types/admin';
import type { EmployeeComplianceDetailResponse, DayComplianceDetail } from '../../../types/dailyLog';
import { logExceptionService } from '../../../services/logExceptionService';
import { formatHours, formatSignedHours, gapTone } from '../../../utils/logTimeChecks';

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

  if (!isOpen || !member) return null;

  const toggleDay = (dateStr: string) => {
    setExpandedDays((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  const getStatusBadge = (day: DayComplianceDetail) => {
    if (day.is_leave) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
          On leave
        </span>
      );
    }
    if (day.is_off_day) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
          <Coffee className="w-3 h-3" /> {day.off_day_label || 'Off Day'}
        </span>
      );
    }
    if (day.status === 'submitted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" /> Submitted
        </span>
      );
    }
    if (day.status === 'missing') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3 h-3" /> Missing
        </span>
      );
    }
    if (day.status === 'in_shift') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
          <Clock className="w-3 h-3" /> In shift
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
        Not started
      </span>
    );
  };

  const netGapTone = data ? gapTone(data.total_signed_gap_hours, true) : 'neutral';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#10121a] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0d12] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm shrink-0">
              {member.full_name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{member.full_name}</h2>
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {member.role || 'Member'}
                </span>
                {member.department && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    {member.department}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                <span>{member.email}</span>
                <span>•</span>
                <span className="font-mono text-[11px]">
                  {startDate} → {endDate}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canRemind && (data?.days_missing || 0) > 0 && (
              <button
                type="button"
                onClick={() => onSendReminder(member.user_id, 'email')}
                disabled={isSendingReminder}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer"
              >
                {isSendingReminder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                <span>Remind</span>
              </button>
            )}
            {member.phone && (
              <a
                href={`https://wa.me/${member.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  `Hi ${member.full_name}, please make sure all your Daily Logs are submitted on Reamarc.`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                title="Send WhatsApp Reminder"
              >
                <MessageSquare className="w-4 h-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                <span>Loading compliance breakdown...</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800/50" />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="p-6 text-center space-y-3 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl">
              <AlertTriangle className="w-6 h-6 text-rose-500 mx-auto" />
              <p className="text-xs text-rose-700 dark:text-rose-400 font-semibold">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setIsLoading(true);
                  logExceptionService
                    .getEmployeeComplianceDetail(member.user_id, startDate, endDate)
                    .then(setData)
                    .catch((e) => setError(e?.message))
                    .finally(() => setIsLoading(false));
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : data ? (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Worked</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                      {formatHours(data.total_worked_hours)}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">Attendance punches</span>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Logged</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">
                      {formatHours(data.total_logged_hours)}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">Daily task logs</span>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Net Gap</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span
                      className={`text-base font-extrabold ${
                        netGapTone === 'deficit'
                          ? 'text-rose-600 dark:text-rose-400'
                          : netGapTone === 'surplus'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      {formatSignedHours(data.total_signed_gap_hours)}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">
                    {netGapTone === 'deficit' ? 'Under-logged' : netGapTone === 'surplus' ? 'Over-logged' : 'Balanced'}
                  </span>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Submissions</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                      {data.days_logged} / {data.days_expected}
                    </span>
                    <span className="text-[11px] text-zinc-400">days</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">
                    {data.days_missing > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">{data.days_missing} missing</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">100% complete</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Day-by-Day Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                    Daily Breakdown ({data.days.length} days)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allExp: Record<string, boolean> = {};
                        data.days.forEach((d) => (allExp[d.date] = true));
                        setExpandedDays(allExp);
                      }}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Expand all
                    </button>
                    <span className="text-zinc-300 dark:text-zinc-700">•</span>
                    <button
                      type="button"
                      onClick={() => setExpandedDays({})}
                      className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 cursor-pointer"
                    >
                      Collapse all
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {data.days.map((day) => {
                    const isExpanded = Boolean(expandedDays[day.date]);
                    const tone = gapTone(day.signed_gap_hours, day.worked_hours > 0 && day.status !== 'missing');

                    return (
                      <div
                        key={day.date}
                        className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-2xs transition-colors"
                      >
                        {/* Day Card Header */}
                        <div
                          onClick={() => toggleDay(day.date)}
                          className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 select-none transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="min-w-[100px]">
                              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                                <span>{day.day_name}</span>
                              </div>
                              <div className="text-[10px] text-zinc-400 font-mono">{day.date}</div>
                            </div>
                            <div>{getStatusBadge(day)}</div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right hidden sm:block">
                              <div className="text-xs font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
                                {formatHours(day.logged_hours)} logged
                                <span className="text-zinc-400 font-normal"> / {formatHours(day.worked_hours)} work</span>
                              </div>
                              {day.worked_hours > 0 && (
                                <div
                                  className={`text-[10px] font-bold tabular-nums ${
                                    tone === 'deficit'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : tone === 'surplus'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-zinc-400'
                                  }`}
                                >
                                  {formatSignedHours(day.signed_gap_hours)}
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Details */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/30 dark:bg-zinc-900/20 space-y-3">
                            <div className="flex items-center justify-between text-xs pt-2">
                              <div className="flex items-center gap-4 text-zinc-500 dark:text-zinc-400">
                                <span className="font-semibold text-zinc-700 dark:text-zinc-300">Attendance:</span>
                                <span>
                                  Check In: <strong className="text-zinc-900 dark:text-zinc-100">{day.check_in || '—'}</strong>
                                </span>
                                <span>
                                  Check Out: <strong className="text-zinc-900 dark:text-zinc-100">{day.check_out || '—'}</strong>
                                </span>
                                <span>
                                  Work Duration: <strong className="text-zinc-900 dark:text-zinc-100">{formatHours(day.worked_hours)}</strong>
                                </span>
                              </div>
                            </div>

                            {day.member_reason && (
                              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                                <span className="font-bold text-amber-800 dark:text-amber-300 block mb-0.5">
                                  Employee Explanation:
                                </span>
                                <p className="text-amber-700 dark:text-amber-400">{day.member_reason}</p>
                              </div>
                            )}

                            {day.tasks.length > 0 ? (
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                                  Logged Tasks ({day.tasks.length})
                                </span>
                                <div className="space-y-1">
                                  {day.tasks.map((t, idx) => (
                                    <div
                                      key={t.id || idx}
                                      className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-xl flex items-start justify-between gap-3 text-xs"
                                    >
                                      <div className="space-y-1 min-w-0 flex-1">
                                        <div className="font-medium text-zinc-900 dark:text-zinc-100 leading-snug break-words">
                                          {t.task_description}
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap text-[11px] text-zinc-400">
                                          {t.client_project && (
                                            <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                                              {t.client_project}
                                            </span>
                                          )}
                                          {t.task_type && (
                                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px]">
                                              {t.task_type}
                                            </span>
                                          )}
                                          {t.task_status && (
                                            <span
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                t.task_status === 'Completed'
                                                  ? 'bg-emerald-500/10 text-emerald-600'
                                                  : 'bg-amber-500/10 text-amber-600'
                                              }`}
                                            >
                                              {t.task_status}
                                            </span>
                                          )}
                                        </div>
                                        {t.blockers && (
                                          <div className="text-[11px] text-rose-500 font-medium">
                                            Blocker: {t.blockers}
                                          </div>
                                        )}
                                      </div>
                                      <div className="shrink-0 font-bold tabular-nums text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg text-xs">
                                        {formatHours(t.hours_utilized)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : day.status === 'missing' ? (
                              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                                <span>No Daily Log submitted for this shift ({formatHours(day.worked_hours)} at work).</span>
                              </div>
                            ) : !day.is_off_day && !day.is_leave && day.worked_hours === 0 ? (
                              <div className="text-xs text-zinc-400 italic py-1">No attendance or logs recorded for this day.</div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
