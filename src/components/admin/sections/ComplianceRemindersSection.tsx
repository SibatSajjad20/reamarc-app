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
} from 'lucide-react';
import type { MemberActivity } from '../../../types/admin';
import type { OperatingSnapshot } from '../../../types/dailyLog';
import { DEPARTMENTS } from '../AddMemberModal';
import { CustomSelect } from '../../ui/CustomSelect';
import { CustomDatePicker } from '../../ui/CustomDatePicker';
import { OffDayBanner } from '../../ui/OffDayBanner';
import { useOffDays } from '../../../hooks/useOffDays';
import { logExceptionService } from '../../../services/logExceptionService';
import { formatHours, formatSignedHours } from '../../../utils/logTimeChecks';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const { getOffDay } = useOffDays();
  const viewingOff = range === 'date' ? getOffDay(pickedDate) : range === 'today' ? getOffDay(todayIso()) : { isOff: false, label: 'Working day' as const };

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
            <div className="w-full mt-2">
              <OffDayBanner info={viewingOff} date={range === 'date' ? pickedDate : todayIso()} compact />
            </div>
          )}
          {missingTodayCount > 0 && !viewingOff.isOff && (
            <button
              type="button"
              onClick={handleBatchReminder}
              disabled={isSendingBatch}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer"
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
        {snapLoading && !snap ? (
          <div className="flex items-center justify-center py-12 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" />
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

            <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-500" />
                By department
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(snap?.departments || []).map((dept) => (
                  <button
                    key={dept.name}
                    type="button"
                    onClick={() => setDepartmentFilter(dept.name)}
                    className={`p-3 rounded-xl border text-left space-y-1 cursor-pointer ${
                      departmentFilter.toLowerCase() === dept.name.toLowerCase()
                        ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60'
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

            <div className="p-4 rounded-2xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 space-y-2">
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Needs attention
              </h3>
              {(snap?.highlights || []).map((h) => (
                <div key={h.label} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 font-semibold">{h.label}</span>
                  <span className="font-bold">{h.value}</span>
                </div>
              ))}
              {(snap?.top_exceptions || []).slice(0, 5).map((row) => (
                <p key={row.id} className="text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="font-bold">{row.full_name}</span>
                  {' · '}
                  {row.is_missing_log ? "didn't log" : row.message}
                </p>
              ))}
              {isAdmin && (snap?.hr_exceptions || []).length > 0 && (
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[11px] font-bold text-zinc-400 flex items-center gap-1 mb-1">
                    <Users className="w-3.5 h-3.5" />
                    HR’s own issues
                  </p>
                  {snap?.hr_exceptions.map((row) => (
                    <p key={row.id} className="text-xs">
                      <span className="font-bold">{row.full_name}</span> · {row.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

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
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
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

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin mb-3" />
            <p className="text-xs font-medium">Loading people...</p>
          </div>
        ) : (
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
                {filteredActivities.map((act) => {
                  const hours = hoursByUser[act.user_id];
                  const isSending = isSendingReminder[act.user_id];
                  const hasOpen = hours?.hasOpen || openRequestIds.has(act.user_id);
                  const status = personStatus(act.user_id);
                  const canRemind = status === 'missing' && !hasOpen;
                  return (
                    <tr key={act.user_id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30">
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
                        ) : canRemind ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSendReminder(act.user_id, 'email')}
                              disabled={isSending}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 border border-indigo-200 text-xs font-bold cursor-pointer disabled:opacity-50"
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
                                className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200"
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
                              className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-500 cursor-pointer"
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
                })}
              </tbody>
            </table>
          </div>
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
