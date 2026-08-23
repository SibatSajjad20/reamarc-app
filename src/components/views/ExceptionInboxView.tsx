import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Inbox,
  Loader2,
  MessageSquareWarning,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { logExceptionService } from '../../services/logExceptionService';
import type { LogExceptionItem } from '../../types/dailyLog';
import { formatHours, formatSignedHours } from '../../utils/logTimeChecks';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { OffDayBanner } from '../ui/OffDayBanner';
import { useOffDays } from '../../hooks/useOffDays';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const statusLabel = (item: LogExceptionItem) => {
  if (item.action_status === 'waiting_on_reviewer') return 'They sent a reason';
  if (item.action_status === 'waiting_on_employee') return 'Waiting on them';
  if (item.escalated || item.action_status === 'escalated') return 'Sent to HR';
  if (item.action_status === 'reviewed' || item.action_status === 'cleared') return 'Done';
  return 'Needs you';
};

interface ExceptionInboxViewProps {
  onOpenDailyLog?: (date: string) => void;
}

export const ExceptionInboxView: React.FC<ExceptionInboxViewProps> = ({ onOpenDailyLog }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isLead = user?.role === 'team_lead';
  const [items, setItems] = useState<LogExceptionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  useModuleLoadGate(isLoading);
  const [actingId, setActingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const [range, setRange] = useState<'today' | 'week' | 'date'>('week');
  const [pickedDate, setPickedDate] = useState(todayIso());
  const [searchQuery, setSearchQuery] = useState('');
  const { getOffDay } = useOffDays();
  const viewingOff = range === 'date' ? getOffDay(pickedDate) : range === 'today' ? getOffDay(todayIso()) : { isOff: false, label: 'Working day' as const };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const dateArg = range === 'today' ? todayIso() : range === 'date' ? pickedDate : undefined;
      const rows = await logExceptionService.getInbox(dateArg);
      setItems(rows);
    } catch (err: any) {
      addToast('Could not load exceptions', err.message || 'Please try again.', 'warning');
    } finally {
      setIsLoading(false);
    }
  }, [addToast, range, pickedDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!openMenuId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && !target.closest(`[data-actions-menu="${openMenuId}"]`)) {
        setOpenMenuId(null);
        setMenuPos(null);
      }
    };
    const onScroll = () => {
      setOpenMenuId(null);
      setMenuPos(null);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openMenuId]);

  useEffect(() => {
    const onDeleted = () => {
      load();
    };
    window.addEventListener('reamarc-member-deleted', onDeleted);
    return () => window.removeEventListener('reamarc-member-deleted', onDeleted);
  }, [load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.full_name.toLowerCase().includes(q) ||
        (i.department || '').toLowerCase().includes(q) ||
        i.date.includes(q),
    );
  }, [items, searchQuery]);

  const handleAction = async (
    item: LogExceptionItem,
    action: 'explain' | 'correct' | 'review' | 'escalate' | 'accept' | 'ask_again',
  ) => {
    const notified = item.employee_notified || item.action_status === 'waiting_on_employee' || item.action_status === 'waiting_on_reviewer';
    if (notified && (action === 'explain' || action === 'correct')) {
      addToast('Already requested', `Already asked by ${item.action_by_name || 'a reviewer'}. No second message.`, 'info');
      return;
    }
    setActingId(item.id);
    try {
      const res = await logExceptionService.act(item.id, action);
      if (res.already_requested) {
        addToast('Already requested', 'The employee was already notified. No second message sent.', 'info');
      } else if (action === 'review') {
        addToast('Marked as looks fine', 'Removed from the open queue.', 'success');
      } else if (action === 'accept') {
        addToast('Reason accepted', 'The gap is allowed. Their banner will clear.', 'success');
      } else if (action === 'ask_again') {
        addToast('Asked again', 'They can fix the log or send another reason.', 'success');
      } else if (action === 'escalate') {
        addToast('Sent to HR', 'Pinned for HR. No extra message to the employee.', 'success');
      } else {
        addToast('Request sent', 'They will see this on Daily Log.', 'success');
      }
      setOpenMenuId(null);
      setMenuPos(null);
      await load();
    } catch (err: any) {
      addToast('Action failed', err.message || 'Please try again.', 'warning');
    } finally {
      setActingId(null);
    }
  };

  const openLog = (item: LogExceptionItem) => {
    try {
      localStorage.setItem(
        'reamarc_daily_log_focus',
        JSON.stringify({ date: item.date, resourceName: item.full_name }),
      );
    } catch {
      /* ignore */
    }
    if (onOpenDailyLog) onOpenDailyLog(item.date);
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-50 dark:bg-[#090a0f] overflow-hidden">
      <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0f1117] shrink-0 space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Inbox className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {isLead ? 'Team exceptions' : 'Company exceptions'}
            </h1>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              People whose logged hours don’t match time in/out, or who didn’t log.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
              {id === 'today' ? 'Today' : id === 'week' ? 'Last 7 workdays' : 'Pick a date'}
            </button>
          ))}
          {range === 'date' && (
            <div className="w-40">
              <CustomDatePicker value={pickedDate} onChange={(val) => setPickedDate(val || todayIso())} maxDate={todayIso()} offDayMode="mark" />
            </div>
          )}
          <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or dept..."
              className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : viewingOff.isOff ? (
          <div className="max-w-lg mx-auto mt-10">
            <OffDayBanner info={viewingOff} date={range === 'date' ? pickedDate : todayIso()} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="max-w-md mx-auto mt-16 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Nothing needs you right now</p>
            <p className="text-xs text-zinc-500">
              A row appears when someone didn’t log, or their hours don’t match time in/out.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-[11px] uppercase tracking-wider text-zinc-400 sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-bold">Person</th>
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-4 py-3 font-bold">At work</th>
                  <th className="px-4 py-3 font-bold">Logged</th>
                  <th className="px-4 py-3 font-bold">Gap</th>
                  <th className="px-4 py-3 font-bold">Tasks</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const waiting = item.action_status === 'waiting_on_employee' || Boolean(item.employee_notified);
                  const pendingReason = item.action_status === 'waiting_on_reviewer';
                  const escalated = Boolean(item.escalated) || item.action_status === 'escalated';
                  const busy = actingId === item.id;
                  const missing = item.is_missing_log || item.exception_type === 'missing_log';
                  return (
                    <tr
                      key={item.id}
                      className={`border-t border-zinc-100 dark:border-zinc-800/80 ${
                        escalated ? 'bg-amber-50/70 dark:bg-amber-950/20' : pendingReason ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-zinc-900 dark:text-zinc-100">{item.full_name}</div>
                        <div className="text-[11px] text-zinc-400">{item.department || '—'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-600 dark:text-zinc-300">{item.date}</td>
                      <td className="px-4 py-3 font-semibold">
                        {item.has_checkout || (item.worked_hours || 0) > 0
                          ? formatHours(item.worked_hours || 0)
                          : item.has_checkin
                            ? 'In'
                            : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold">{formatHours(item.logged_hours)}</td>
                      <td className="px-4 py-3 font-bold">
                        {missing ? (
                          <span className="text-amber-700 dark:text-amber-300">Didn't log</span>
                        ) : (item.signed_gap_hours || 0) > 0.01 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {formatSignedHours(item.signed_gap_hours || 0)}
                          </span>
                        ) : (item.signed_gap_hours || 0) < -0.01 ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {formatSignedHours(item.signed_gap_hours || 0)}
                          </span>
                        ) : (
                          <span className="text-zinc-400">0h</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{item.task_count ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                          {statusLabel(item)}
                          {item.action_by_name ? ` · ${item.action_by_name}` : ''}
                        </div>
                        {pendingReason && item.member_reason && (
                          <p className="mt-1 text-[11px] text-zinc-500 max-w-[220px]">“{item.member_reason}”</p>
                        )}
                        {item.reopen_note && (
                          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300 max-w-[220px]">
                            {item.reopen_note}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-block text-left" data-actions-menu={item.id}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => {
                              if (openMenuId === item.id) {
                                setOpenMenuId(null);
                                setMenuPos(null);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              const menuHeight = 240;
                              const spaceBelow = window.innerHeight - rect.bottom;
                              const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
                              setMenuPos({
                                right: Math.max(8, window.innerWidth - rect.right),
                                top: openUp ? undefined : rect.bottom + 4,
                                bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
                              });
                              setOpenMenuId(item.id);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Actions'}
                            <ChevronDown className={`w-3 h-3 transition-transform ${openMenuId === item.id ? 'rotate-180' : ''}`} />
                          </button>
                          {openMenuId === item.id && menuPos ? (
                            <div
                              className="fixed z-50 w-52 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-1.5 space-y-0.5"
                              style={{ top: menuPos.top, bottom: menuPos.bottom, right: menuPos.right }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  openLog(item);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold text-left cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                                <ExternalLink className="w-3 h-3 text-zinc-400" />
                                Open log
                              </button>
                              {pendingReason ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleAction(item, 'accept')}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold text-left cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                    <CheckCircle2 className="w-3 h-3" />
                                    Accept reason
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAction(item, 'ask_again')}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold text-left cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                    Ask again
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={waiting}
                                    title={waiting ? `Already asked by ${item.action_by_name || 'reviewer'}` : undefined}
                                    onClick={() => handleAction(item, 'correct')}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold text-left cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-200 disabled:opacity-40"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                    <Wrench className="w-3 h-3" />
                                    Ask to add time
                                  </button>
                                  <button
                                    type="button"
                                    disabled={waiting}
                                    title={waiting ? `Already asked by ${item.action_by_name || 'reviewer'}` : undefined}
                                    onClick={() => handleAction(item, 'explain')}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold text-left cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 disabled:opacity-40"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                    <MessageSquareWarning className="w-3 h-3" />
                                    Ask for a reason
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAction(item, 'review')}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold text-left cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                    <CheckCircle2 className="w-3 h-3" />
                                    Looks fine
                                  </button>
                                  {isLead && (
                                    <button
                                      type="button"
                                      onClick={() => handleAction(item, 'escalate')}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold text-left cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                      <ShieldAlert className="w-3 h-3" />
                                      Send to HR
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
