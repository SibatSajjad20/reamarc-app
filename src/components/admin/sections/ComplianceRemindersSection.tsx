import React, { useState, useMemo } from 'react';
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
  Sparkles,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import type { MemberActivity } from '../../../types/admin';
import { DEPARTMENTS } from '../AddMemberModal';
import { CustomSelect } from '../../ui/CustomSelect';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'missing' | 'logged'>('all');

  // Custom Message Modal State
  const [customReminderUser, setCustomReminderUser] = useState<MemberActivity | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [isSendingBatch, setIsSendingBatch] = useState(false);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState<string | null>(null);

  const activityList = useMemo(() => Object.values(activities), [activities]);

  // Calculations & Compliance KPIs
  const monitoredMembers = useMemo(
    () => activityList.filter((a) => a.role !== 'admin' && a.role !== 'hr' && a.role !== 'client'),
    [activityList]
  );

  const loggedTodayCount = useMemo(
    () => monitoredMembers.filter((a) => a.logged_today).length,
    [monitoredMembers]
  );

  const missingTodayCount = monitoredMembers.length - loggedTodayCount;
  const complianceRate = monitoredMembers.length > 0
    ? Math.round((loggedTodayCount / monitoredMembers.length) * 100)
    : 100;

  const totalMissedWorkdays = useMemo(
    () => monitoredMembers.reduce((acc, curr) => acc + (curr.days_missed || 0), 0),
    [monitoredMembers]
  );

  // Department Compliance Breakdown
  const deptStats = useMemo(() => {
    const map: Record<string, { total: number; logged: number; missed: number }> = {};
    DEPARTMENTS.forEach((d) => {
      map[d.toLowerCase()] = { total: 0, logged: 0, missed: 0 };
    });

    monitoredMembers.forEach((m) => {
      const deptKey = (m.department || 'other').toLowerCase();
      if (!map[deptKey]) {
        map[deptKey] = { total: 0, logged: 0, missed: 0 };
      }
      map[deptKey].total += 1;
      if (m.logged_today) map[deptKey].logged += 1;
      map[deptKey].missed += m.days_missed || 0;
    });

    return map;
  }, [monitoredMembers]);

  // Filtered List
  const filteredActivities = useMemo(() => {
    return monitoredMembers.filter((a) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        a.full_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.department && a.department.toLowerCase().includes(q)) ||
        (a.role && a.role.toLowerCase().includes(q));

      const matchesDept =
        departmentFilter === 'all' ||
        (a.department && a.department.toLowerCase() === departmentFilter.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'missing' && !a.logged_today) ||
        (statusFilter === 'logged' && a.logged_today);

      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [monitoredMembers, searchQuery, departmentFilter, statusFilter]);

  const handleBatchReminder = async () => {
    const nonLogged = monitoredMembers.filter((m) => !m.logged_today || m.days_missed > 0);
    if (nonLogged.length === 0) return;

    try {
      setIsSendingBatch(true);
      setBatchSuccessMsg(null);
      for (const m of nonLogged) {
        await onSendReminder(m.user_id, 'email');
      }
      setBatchSuccessMsg(`Successfully dispatched reminders to ${nonLogged.length} team members!`);
      setTimeout(() => setBatchSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Failed batch reminder dispatch:', err);
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
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      {/* Top Header */}
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#10121a] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50">Log Compliance & Reminders Hub</h1>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Workday Attendance
            </span>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Monitor daily log submissions, track missed workdays, and trigger 1-click reminders
          </p>
        </div>

        {missingTodayCount > 0 && (
          <button
            type="button"
            onClick={handleBatchReminder}
            disabled={isSendingBatch}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-amber-600/20 hover:shadow-amber-600/30 cursor-pointer disabled:cursor-not-allowed select-none"
          >
            {isSendingBatch ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sending Reminders...</span>
              </>
            ) : (
              <>
                <BellRing className="w-4 h-4" />
                <span>Remind All Non-Logged ({missingTodayCount})</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Success Banner */}
      {batchSuccessMsg && (
        <div className="px-5 py-3 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{batchSuccessMsg}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">Today's Compliance</span>
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{complianceRate}%</span>
              <span className="text-xs text-zinc-400 font-medium">({loggedTodayCount}/{monitoredMembers.length} logged)</span>
            </div>
            <div className="mt-2 w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${complianceRate}%` }}
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">Logged Today</span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{loggedTodayCount}</span>
              <span className="text-xs text-zinc-400 ml-2 font-medium">members submitted</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">Pending Today</span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{missingTodayCount}</span>
              <span className="text-xs text-zinc-400 ml-2 font-medium">awaiting log</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">Total Workdays Missed</span>
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{totalMissedWorkdays}</span>
              <span className="text-xs text-zinc-400 ml-2 font-medium">past 7 workdays</span>
            </div>
          </div>
        </div>

        {/* Department Compliance Breakdown */}
        <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>Departmental Compliance (Today)</span>
            </h3>
            <span className="text-[11px] text-zinc-400">Live Breakdown</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {DEPARTMENTS.map((dept) => {
              const stat = deptStats[dept.toLowerCase()] || { total: 0, logged: 0, missed: 0 };
              const pct = stat.total > 0 ? Math.round((stat.logged / stat.total) * 100) : 100;
              const isFull = pct === 100;

              return (
                <div
                  key={dept}
                  className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 text-left space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{dept}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        isFull
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {stat.logged} of {stat.total} logged
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isFull ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 shadow-2xs">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search member name, email, department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
              {(['all', 'missing', 'logged'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === st
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  {st === 'all' ? 'All Members' : st === 'missing' ? 'Missing Only' : 'Logged Today'}
                </button>
              ))}
            </div>

            {/* Department Filter */}
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

        {/* Attendance Activity Table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs font-medium">Loading compliance records...</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Department & Role</th>
                <th className="py-3 px-4">Today's Status</th>
                <th className="py-3 px-4">Missing Workdays</th>
                <th className="py-3 px-4">Last Logged</th>
                <th className="py-3 px-4 text-right">Reminder Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 text-xs">
              {filteredActivities.map((act) => {
                const isSending = isSendingReminder[act.user_id];
                const hasMissing = act.days_missed > 0 || !act.logged_today;

                return (
                  <tr key={act.user_id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                    {/* Member */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-zinc-900 dark:text-zinc-100">{act.full_name}</div>
                      <div className="text-[11px] text-zinc-400">{act.email}</div>
                    </td>

                    {/* Department & Role */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-800 dark:text-zinc-200">{act.department || 'Unassigned'}</div>
                      <div className="text-[11px] text-zinc-400 font-medium capitalize">{act.role.replace('_', ' ')}</div>
                    </td>

                    {/* Today's Status */}
                    <td className="py-3 px-4">
                      {act.logged_today ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Submitted</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending Log</span>
                        </span>
                      )}
                    </td>

                    {/* Missing Workdays */}
                    <td className="py-3 px-4">
                      {act.days_missed > 0 ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400">
                            {act.days_missed} {act.days_missed === 1 ? 'day' : 'days'} missed
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {act.missing_dates.slice(0, 3).map((d) => (
                              <span key={d} className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                                {d}
                              </span>
                            ))}
                            {act.missing_dates.length > 3 && (
                              <span className="text-[10px] text-zinc-400">+{act.missing_dates.length - 3}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-400 text-xs font-medium">100% Up to date</span>
                      )}
                    </td>

                    {/* Last Logged */}
                    <td className="py-3 px-4 font-mono text-zinc-600 dark:text-zinc-400">
                      {act.last_logged_date || <span className="text-zinc-400 italic">No entries yet</span>}
                    </td>

                    {/* Reminder Action */}
                    <td className="py-3 px-4 text-right">
                      {hasMissing ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSendReminder(act.user_id, 'email')}
                            disabled={isSending}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                            title="Send instant email reminder"
                          >
                            {isSending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Mail className="w-3 h-3" />
                            )}
                            <span>Remind</span>
                          </button>

                          {act.phone && (
                            <a
                              href={`https://wa.me/${act.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                `Hi ${act.full_name}, reminder to submit your Daily Log on Reamarc for ${act.missing_dates.join(', ')}.`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
                              title="Send WhatsApp Reminder"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setCustomReminderUser(act);
                              setCustomMessage(`Hi ${act.full_name}, please log your tasks for ${act.missing_dates.join(', ')}.`);
                            }}
                            className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition cursor-pointer"
                            title="Custom Message Reminder"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">Compliant</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {/* Future Insights Placeholders */}
        <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600 text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                Compliance Analytics & Insights Engine
              </h4>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Automated weekly attendance reports and AI-generated work habit summaries will appear here.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            Coming Soon
          </span>
        </div>
      </div>

      {/* Custom Message Reminder Modal */}
      {customReminderUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Send Custom Reminder to {customReminderUser.full_name}
              </h3>
              <button
                type="button"
                onClick={() => setCustomReminderUser(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Message Content
              </label>
              <textarea
                rows={4}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full p-3 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="Enter custom reminder instructions..."
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomReminderUser(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendCustomReminder}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Reminder</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
