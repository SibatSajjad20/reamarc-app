import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  Inbox,
  Loader2,
  MessageSquare,
  MoreVertical,
  Search,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { logExceptionService } from '../../services/logExceptionService';
import { dailyLogService } from '../../services/dailyLogService';
import type { LogExceptionItem, DailyLogEntry } from '../../types/dailyLog';
import { formatHours, formatSignedHours } from '../../utils/logTimeChecks';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { OffDayBanner } from '../ui/OffDayBanner';
import { useOffDays } from '../../hooks/useOffDays';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getInitials = (name?: string): string => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

type QuickFilterType = 'all' | 'missing' | 'gap' | 'pending_reason' | 'escalated';

export const ExceptionInboxView: React.FC<{ onOpenDailyLog?: (date: string) => void }> = ({
  onOpenDailyLog,
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isLead = user?.role === 'team_lead';

  // Data states
  const [items, setItems] = useState<LogExceptionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  useModuleLoadGate(isLoading);

  // Interaction states
  const [actingId, setActingId] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState<LogExceptionItem | null>(null);
  const [detailTasks, setDetailTasks] = useState<DailyLogEntry[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // Filters
  const [range, setRange] = useState<'today' | 'week' | 'date'>('week');
  const [pickedDate, setPickedDate] = useState(todayIso());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<QuickFilterType>('all');

  const { getOffDay } = useOffDays();
  const viewingOff =
    range === 'date'
      ? getOffDay(pickedDate)
      : range === 'today'
      ? getOffDay(todayIso())
      : { isOff: false, label: 'Working day' as const };

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

  // Click outside listener for table actions dropdown
  useEffect(() => {
    if (!openDropdownId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && !target.closest(`[data-exception-dropdown="${openDropdownId}"]`)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdownId]);

  // Listen for member deletion event
  useEffect(() => {
    const onDeleted = () => {
      load();
    };
    window.addEventListener('reamarc-member-deleted', onDeleted);
    return () => window.removeEventListener('reamarc-member-deleted', onDeleted);
  }, [load]);

  // Fetch tasks when inspection drawer opens
  useEffect(() => {
    if (!selectedDetailItem) {
      setDetailTasks([]);
      return;
    }
    let isCancelled = false;
    const fetchTasks = async () => {
      setIsLoadingTasks(true);
      try {
        const entries = await dailyLogService.getEntries({
          start_date: selectedDetailItem.date,
          end_date: selectedDetailItem.date,
          user_id: selectedDetailItem.user_id,
        });
        if (!isCancelled) {
          setDetailTasks(entries || []);
        }
      } catch (err) {
        if (!isCancelled) {
          setDetailTasks([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTasks(false);
        }
      }
    };
    fetchTasks();
    return () => {
      isCancelled = true;
    };
  }, [selectedDetailItem]);

  // KPI counts
  const counts = useMemo(() => {
    let missing = 0;
    let gap = 0;
    let pendingReason = 0;
    let escalated = 0;

    items.forEach((i) => {
      if (i.is_missing_log || i.exception_type === 'missing_log') {
        missing++;
      } else {
        gap++;
      }
      if (i.action_status === 'waiting_on_reviewer') {
        pendingReason++;
      }
      if (i.escalated || i.action_status === 'escalated') {
        escalated++;
      }
    });

    return { missing, gap, pendingReason, escalated, total: items.length };
  }, [items]);

  // Filtered rows
  const filteredItems = useMemo(() => {
    let list = items;

    // Filter tab
    if (activeFilter === 'missing') {
      list = list.filter((i) => i.is_missing_log || i.exception_type === 'missing_log');
    } else if (activeFilter === 'gap') {
      list = list.filter((i) => !(i.is_missing_log || i.exception_type === 'missing_log'));
    } else if (activeFilter === 'pending_reason') {
      list = list.filter((i) => i.action_status === 'waiting_on_reviewer');
    } else if (activeFilter === 'escalated') {
      list = list.filter((i) => i.escalated || i.action_status === 'escalated');
    }

    // Search query
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) =>
        i.full_name.toLowerCase().includes(q) ||
        (i.department || '').toLowerCase().includes(q) ||
        i.date.includes(q),
    );
  }, [items, activeFilter, searchQuery]);

  // Action dispatcher
  const handleAction = async (
    item: LogExceptionItem,
    action: 'explain' | 'correct' | 'review' | 'escalate' | 'accept' | 'ask_again',
  ) => {
    const notified =
      item.employee_notified ||
      item.action_status === 'waiting_on_employee' ||
      item.action_status === 'waiting_on_reviewer';
    if (notified && (action === 'explain' || action === 'correct')) {
      addToast(
        'Already requested',
        `Already requested by ${item.action_by_name || 'a reviewer'}.`,
        'info',
      );
      return;
    }
    setActingId(item.id);
    try {
      const res = await logExceptionService.act(item.id, action);
      if (res.already_requested) {
        addToast('Already requested', 'The employee was already notified.', 'info');
      } else if (action === 'review') {
        addToast('Marked as looks fine', 'Exception resolved and cleared.', 'success');
      } else if (action === 'accept') {
        addToast('Reason accepted', 'Employee explanation accepted. Exception cleared.', 'success');
      } else if (action === 'ask_again') {
        addToast('Asked again', 'Request sent back to employee for updated log.', 'success');
      } else if (action === 'escalate') {
        addToast('Sent to HR', 'Exception escalated to HR management.', 'success');
      } else {
        addToast('Request sent', 'Employee notified to explain / log hours.', 'success');
      }

      setOpenDropdownId(null);
      if (selectedDetailItem?.id === item.id) {
        setSelectedDetailItem(null);
      }
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

  // Status Badge Component
  const renderStatusBadge = (item: LogExceptionItem) => {
    if (item.action_status === 'waiting_on_reviewer') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          <MessageSquare className="w-3 h-3 text-blue-500" />
          <span>Reason Submitted</span>
        </span>
      );
    }
    if (item.action_status === 'waiting_on_employee' || Boolean(item.employee_notified)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50/70 dark:bg-blue-950/30 text-blue-600 dark:text-blue-300 border border-blue-200/80 dark:border-blue-900/40">
          <Clock className="w-3 h-3 text-blue-500" />
          <span>Awaiting Employee</span>
        </span>
      );
    }
    if (item.escalated || item.action_status === 'escalated') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
          <ShieldAlert className="w-3 h-3 text-rose-500" />
          <span>Sent to HR</span>
        </span>
      );
    }
    if (item.action_status === 'reviewed' || item.action_status === 'cleared') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          <span>Resolved</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
        <AlertCircle className="w-3 h-3 text-amber-500" />
        <span>Needs Review</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-50 dark:bg-[#090a0f] overflow-hidden">
      {/* ─── Header & Search Bar ─── */}
      <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0f1117] shrink-0 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
                <span>{isLead ? 'Team Exceptions' : 'Company Exceptions'}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {counts.total} open
                </span>
              </h1>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                Review and resolve discrepancies between daily logs and attendance timesheets.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(['today', 'week', 'date'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setRange(id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  range === id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#151722] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                {id === 'today' ? 'Today' : id === 'week' ? 'Last 7 workdays' : 'Pick a date'}
              </button>
            ))}
            {range === 'date' && (
              <div className="w-38">
                <CustomDatePicker
                  value={pickedDate}
                  onChange={(val) => setPickedDate(val || todayIso())}
                  maxDate={todayIso()}
                  offDayMode="mark"
                />
              </div>
            )}
          </div>
        </div>

        {/* ─── Top KPI Metric Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setActiveFilter(activeFilter === 'missing' ? 'all' : 'missing')}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              activeFilter === 'missing'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 shadow-xs ring-2 ring-amber-500/20'
                : 'bg-zinc-50/70 dark:bg-[#141620] border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Missing Logs
              </p>
              {isLoading ? (
                <div className="h-6 w-8 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mt-0.5" />
              ) : (
                <p className="text-lg font-extrabold text-amber-600 dark:text-amber-400">
                  {counts.missing}
                </p>
              )}
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter(activeFilter === 'gap' ? 'all' : 'gap')}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              activeFilter === 'gap'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 shadow-xs ring-2 ring-rose-500/20'
                : 'bg-zinc-50/70 dark:bg-[#141620] border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Hours Discrepancies
              </p>
              {isLoading ? (
                <div className="h-6 w-8 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mt-0.5" />
              ) : (
                <p className="text-lg font-extrabold text-rose-600 dark:text-rose-400">{counts.gap}</p>
              )}
            </div>
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Clock className="w-4 h-4" />
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveFilter(activeFilter === 'pending_reason' ? 'all' : 'pending_reason')
            }
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              activeFilter === 'pending_reason'
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 shadow-xs ring-2 ring-blue-500/20'
                : 'bg-zinc-50/70 dark:bg-[#141620] border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Reasons Awaiting Review
              </p>
              {isLoading ? (
                <div className="h-6 w-8 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mt-0.5" />
              ) : (
                <p className="text-lg font-extrabold text-blue-600 dark:text-blue-400">
                  {counts.pendingReason}
                </p>
              )}
            </div>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <MessageSquare className="w-4 h-4" />
            </div>
          </button>
        </div>

        {/* ─── Search and Active Filter Indicator ─── */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            {[
              { id: 'all', label: 'All Items', count: counts.total },
              { id: 'missing', label: 'Missing Logs', count: counts.missing },
              { id: 'gap', label: 'Hour Discrepancy', count: counts.gap },
              { id: 'pending_reason', label: 'Reason Submitted', count: counts.pendingReason },
              ...(counts.escalated > 0
                ? [{ id: 'escalated', label: 'Sent to HR', count: counts.escalated }]
                : []),
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id as QuickFilterType)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] font-numeric px-1.5 py-0.2 rounded-full ${
                    activeFilter === tab.id
                      ? 'bg-blue-700/60 text-white'
                      : 'bg-zinc-200/80 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {isLoading ? '·' : tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-64 max-w-xs shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or dept..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-700/80 rounded-xl placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* ─── Table Content ─── */}
      <div className="flex-1 min-h-0 overflow-auto p-6">
        {viewingOff.isOff && !isLoading ? (
          <div className="max-w-lg mx-auto mt-10">
            <OffDayBanner info={viewingOff} date={range === 'date' ? pickedDate : todayIso()} />
          </div>
        ) : (
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900/60 text-[11px] uppercase tracking-wider text-zinc-400 border-b border-zinc-200 dark:border-zinc-800/80 sticky top-0 z-10 backdrop-blur-xs">
                <tr>
                  <th className="px-4 py-3.5 font-bold">Team Member</th>
                  <th className="px-4 py-3.5 font-bold">Date</th>
                  <th className="px-4 py-3.5 font-bold">At Work</th>
                  <th className="px-4 py-3.5 font-bold">Logged</th>
                  <th className="px-4 py-3.5 font-bold">Time Gap</th>
                  <th className="px-4 py-3.5 font-bold">Status</th>
                  <th className="px-4 py-3.5 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, idx) => (
                    <tr key={`exc-skeleton-${idx}`} className="animate-pulse">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                          <div className="space-y-1">
                            <div className="h-3.5 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
                            <div className="h-2.5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-5 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="h-7 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-xl ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16">
                      <div className="max-w-md mx-auto text-center space-y-3 p-8">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">All Exceptions Resolved</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          No open attendance discrepancies or missing logs found for the selected view.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                  const waiting =
                    item.action_status === 'waiting_on_employee' || Boolean(item.employee_notified);
                  const pendingReason = item.action_status === 'waiting_on_reviewer';
                  const busy = actingId === item.id;
                  const missing = item.is_missing_log || item.exception_type === 'missing_log';

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedDetailItem(item)}
                      className="cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors group"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                            {getInitials(item.full_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {item.full_name}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate">
                              {item.department || 'General'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 font-numeric font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                        {item.date}
                      </td>

                      <td className="px-4 py-3.5 font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                        {item.has_checkout || (item.worked_hours || 0) > 0
                          ? formatHours(item.worked_hours || 0)
                          : item.has_checkin
                          ? 'In'
                          : '—'}
                      </td>

                      <td className="px-4 py-3.5 font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                        {formatHours(item.logged_hours)}
                      </td>

                      <td className="px-4 py-3.5 font-bold whitespace-nowrap">
                        {missing ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Didn't Log
                          </span>
                        ) : (item.signed_gap_hours || 0) > 0.01 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {formatSignedHours(item.signed_gap_hours || 0)}
                          </span>
                        ) : (item.signed_gap_hours || 0) < -0.01 ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {formatSignedHours(item.signed_gap_hours || 0)}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-normal">0h</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          {renderStatusBadge(item)}
                          {pendingReason && item.member_reason && (
                            <p className="text-[11px] text-zinc-500 line-clamp-1 max-w-[200px]">
                              “{item.member_reason}”
                            </p>
                          )}
                          {item.reopen_note &&
                            !item.reopen_note.includes('+0:00') &&
                            !item.reopen_note.includes('-0:00') &&
                            !item.reopen_note.includes('+0h') &&
                            !item.reopen_note.includes('-0h') && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold line-clamp-1 max-w-[200px]">
                                {item.reopen_note}
                              </p>
                            )}
                        </div>
                      </td>

                      <td
                        className="px-4 py-3.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="relative inline-block text-left"
                          data-exception-dropdown={item.id}
                        >
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setOpenDropdownId(openDropdownId === item.id ? null : item.id)
                            }
                            className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
                            title="Actions"
                          >
                            {busy ? (
                              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                            ) : (
                              <MoreVertical className="w-4 h-4" />
                            )}
                          </button>

                          {openDropdownId === item.id && (
                            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenDropdownId(null);
                                  setSelectedDetailItem(item);
                                }}
                                className="w-full px-3 py-2 text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 rounded-xl flex items-center gap-2 font-medium cursor-pointer transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Inspect Details</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenDropdownId(null);
                                  openLog(item);
                                }}
                                className="w-full px-3 py-2 text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 rounded-xl flex items-center gap-2 font-medium cursor-pointer transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Open Full Daily Log</span>
                              </button>

                              <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

                              {pendingReason ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleAction(item, 'accept')}
                                    className="w-full px-3 py-2 text-left text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>Accept Reason</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAction(item, 'ask_again')}
                                    className="w-full px-3 py-2 text-left text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-xl flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <Wrench className="w-3.5 h-3.5 text-blue-500" />
                                    <span>Ask to Fix</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleAction(item, 'review')}
                                    className="w-full px-3 py-2 text-left text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>Mark as Looks Fine</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={waiting}
                                    onClick={() => handleAction(item, 'explain')}
                                    className="w-full px-3 py-2 text-left text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-xl flex items-center gap-2 font-semibold cursor-pointer transition-colors disabled:opacity-40"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                                    <span>{waiting ? 'Already Requested' : 'Request Explanation'}</span>
                                  </button>

                                  {isLead && (
                                    <button
                                      type="button"
                                      onClick={() => handleAction(item, 'escalate')}
                                      className="w-full px-3 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                    >
                                      <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                                      <span>Escalate to HR</span>
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>

      {/* ─── Inspection Sidebar Drawer (Slide-Over) ─── */}
      {selectedDetailItem && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setSelectedDetailItem(null)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white dark:bg-[#11131a] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-extrabold text-sm flex items-center justify-center shrink-0">
                    {getInitials(selectedDetailItem.full_name)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {selectedDetailItem.full_name}
                    </h2>
                    <p className="text-xs text-zinc-400 truncate">
                      {selectedDetailItem.department || 'General'} · {selectedDetailItem.date}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDetailItem(null)}
                  className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                {/* Status Pill Card */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      Exception Status
                    </span>
                    {renderStatusBadge(selectedDetailItem)}
                  </div>

                  {selectedDetailItem.action_by_name && (
                    <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                      Last action by <strong>{selectedDetailItem.action_by_name}</strong>
                    </p>
                  )}
                </div>

                {/* Hours Breakdown Card */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span>Time Comparison</span>
                  </h3>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800">
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase">At Work</p>
                      <p className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200 mt-0.5">
                        {selectedDetailItem.has_checkout || (selectedDetailItem.worked_hours || 0) > 0
                          ? formatHours(selectedDetailItem.worked_hours || 0)
                          : selectedDetailItem.has_checkin
                          ? 'In'
                          : '—'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800">
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase">Logged</p>
                      <p className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200 mt-0.5">
                        {formatHours(selectedDetailItem.logged_hours)}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800">
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase">Gap</p>
                      <p
                        className={`text-sm font-extrabold mt-0.5 ${
                          selectedDetailItem.is_missing_log
                            ? 'text-amber-600'
                            : (selectedDetailItem.signed_gap_hours || 0) > 0
                            ? 'text-emerald-600'
                            : (selectedDetailItem.signed_gap_hours || 0) < 0
                            ? 'text-rose-600'
                            : 'text-zinc-400'
                        }`}
                      >
                        {selectedDetailItem.is_missing_log
                          ? "Didn't log"
                          : formatSignedHours(selectedDetailItem.signed_gap_hours || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Member Reason Card (If provided) */}
                {selectedDetailItem.member_reason && (
                  <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-1.5">
                    <h3 className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                      <span>Employee Explanation</span>
                    </h3>
                    <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed italic bg-white/70 dark:bg-[#11131a]/70 p-3 rounded-xl border border-blue-200/50 dark:border-blue-900/30">
                      “{selectedDetailItem.member_reason}”
                    </p>
                  </div>
                )}

                {/* Reopen note (If truly human reviewed and reopened) */}
                {selectedDetailItem.reopen_note &&
                  !selectedDetailItem.reopen_note.includes('+0:00') &&
                  !selectedDetailItem.reopen_note.includes('-0:00') &&
                  !selectedDetailItem.reopen_note.includes('+0h') &&
                  !selectedDetailItem.reopen_note.includes('-0h') && (
                    <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 space-y-1">
                      <p className="font-bold text-[11px] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Reopened Exception
                      </p>
                      <p className="text-xs leading-relaxed">{selectedDetailItem.reopen_note}</p>
                    </div>
                  )}

                {/* Daily Log Tasks Breakdown */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Daily Log Entries ({detailTasks.length})</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => openLog(selectedDetailItem)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-500 flex items-center gap-1 cursor-pointer"
                    >
                      Open Full Sheet <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>

                  {isLoadingTasks ? (
                    <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-[#161822] text-center text-zinc-400">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-blue-600" />
                      <p className="text-[11px]">Loading logged tasks...</p>
                    </div>
                  ) : detailTasks.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 space-y-1">
                      <p className="font-semibold text-xs text-zinc-600 dark:text-zinc-300">
                        No Daily Log Tasks Recorded
                      </p>
                      <p className="text-[11px]">
                        The employee has not logged any tasks in their daily sheet for this date.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {detailTasks.map((entry) => (
                        <div
                          key={entry.id}
                          className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs truncate">
                              {entry.client_project || entry.department || 'General'}
                            </span>
                            <span className="font-numeric text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0">
                              {formatHours(Number(entry.hours_utilized) || 0)}
                            </span>
                          </div>
                          {entry.task_description && (
                            <p className="text-zinc-600 dark:text-zinc-300 text-[11px] leading-relaxed line-clamp-2">
                              {entry.task_description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#151722] flex items-center justify-end gap-2 shrink-0">
                {selectedDetailItem.action_status === 'waiting_on_reviewer' ? (
                  <>
                    <button
                      type="button"
                      disabled={actingId === selectedDetailItem.id}
                      onClick={() => handleAction(selectedDetailItem, 'ask_again')}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
                    >
                      Ask to Fix Log
                    </button>
                    <button
                      type="button"
                      disabled={actingId === selectedDetailItem.id}
                      onClick={() => handleAction(selectedDetailItem, 'accept')}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                    >
                      Accept Reason & Close
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={
                        actingId === selectedDetailItem.id ||
                        selectedDetailItem.employee_notified ||
                        selectedDetailItem.action_status === 'waiting_on_employee'
                      }
                      onClick={() => handleAction(selectedDetailItem, 'explain')}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 cursor-pointer disabled:opacity-50"
                    >
                      {selectedDetailItem.employee_notified ? 'Requested' : 'Request Fix / Reason'}
                    </button>

                    {isLead && (
                      <button
                        type="button"
                        disabled={actingId === selectedDetailItem.id}
                        onClick={() => handleAction(selectedDetailItem, 'escalate')}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 cursor-pointer disabled:opacity-50"
                      >
                        Escalate to HR
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={actingId === selectedDetailItem.id}
                      onClick={() => handleAction(selectedDetailItem, 'review')}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                    >
                      Mark as Looks Fine
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

