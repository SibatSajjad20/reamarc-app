import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  FileText,
  History,
  Inbox,
  Loader2,
  RotateCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { logExceptionService } from '../../services/logExceptionService';
import { dailyLogService } from '../../services/dailyLogService';
import type { LogExceptionItem, DailyLogEntry } from '../../types/dailyLog';
import { formatHours, formatSignedHours } from '../../utils/logTimeChecks';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { OffDayBanner } from '../ui/OffDayBanner';
import { useOffDays } from '../../hooks/useOffDays';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/button';
import { StatusPill } from '../ui/StatusPill';
import { EmptyState } from '../ui/EmptyState';
import { Callout } from '../ui/Callout';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Skeleton } from '../ui/skeleton';
import { DrawerSkeleton } from '../ui/Skeletons';
import { getRoleDisplayName } from '../../lib/roleLabel';
import { Avatar } from '../ui/Avatar';
import { useMemberAvatars } from '../../hooks/useMemberAvatars';
import { cn } from '../../lib/utils';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatItemDate = (isoString?: string): string => {
  if (!isoString) return '';
  try {
    const [year, month, day] = isoString.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return isoString;
  }
};

type QuickFilterType = 'all' | 'gap' | 'missing' | 'pending_reason' | 'escalated';

export const ExceptionInboxView: React.FC<{ onOpenDailyLog?: (date: string) => void }> = ({
  onOpenDailyLog,
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { getAvatarUrl } = useMemberAvatars();
  const isLead = user?.role === 'team_lead' || user?.role === 'admin' || user?.role === 'operations';

  const cachedInbox = logExceptionService.getCachedInbox();

  // Data states
  const [items, setItems] = useState<LogExceptionItem[]>(() => cachedInbox?.data || []);
  const [isLoading, setIsLoading] = useState(!cachedInbox);
  useModuleLoadGate(isLoading);

  // Interaction states
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState<LogExceptionItem | null>(null);
  const [detailTasks, setDetailTasks] = useState<DailyLogEntry[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // Filters & range
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
    const dateArg = range === 'today' ? todayIso() : range === 'date' ? pickedDate : undefined;
    const cached = logExceptionService.getCachedInbox(dateArg);
    if (cached) {
      setItems(cached.data);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    try {
      const rows = await logExceptionService.getInbox(dateArg);
      setItems(rows || []);
    } catch (err: any) {
      addToast('Could not load exceptions', err.message || 'Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast, range, pickedDate]);

  useEffect(() => {
    load();
  }, [load]);

  useCacheInvalidation(['exceptions', 'daily-log'], () => {
    void load();
  });

  // Listen for member deletion event
  useEffect(() => {
    const onDeleted = () => {
      load();
    };
    window.addEventListener('reamarc-member-deleted', onDeleted);
    return () => window.removeEventListener('reamarc-member-deleted', onDeleted);
  }, [load]);

  // Fetch tasks when inspection item changes
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
      } catch {
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

    if (activeFilter === 'missing') {
      list = list.filter((i) => i.is_missing_log || i.exception_type === 'missing_log');
    } else if (activeFilter === 'gap') {
      list = list.filter((i) => !(i.is_missing_log || i.exception_type === 'missing_log'));
    } else if (activeFilter === 'pending_reason') {
      list = list.filter((i) => i.action_status === 'waiting_on_reviewer');
    } else if (activeFilter === 'escalated') {
      list = list.filter((i) => i.escalated || i.action_status === 'escalated');
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) =>
        i.full_name.toLowerCase().includes(q) ||
        (i.department || '').toLowerCase().includes(q) ||
        i.date.includes(q),
    );
  }, [items, activeFilter, searchQuery]);

  // Auto-selection of detail item
  useEffect(() => {
    setSelectedDetailItem((current) => {
      if (filteredItems.length === 0) return null;
      if (current && filteredItems.some((i) => i.id === current.id)) {
        return filteredItems.find((i) => i.id === current.id) || current;
      }
      return filteredItems[0];
    });
  }, [filteredItems]);

  // Keyboard navigation up / down
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currIdx = filteredItems.findIndex((i) => i.id === selectedDetailItem?.id);
      if (currIdx < filteredItems.length - 1) {
        setSelectedDetailItem(filteredItems[currIdx + 1]);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currIdx = filteredItems.findIndex((i) => i.id === selectedDetailItem?.id);
      if (currIdx > 0) {
        setSelectedDetailItem(filteredItems[currIdx - 1]);
      }
    }
  };

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

      await load();
    } catch (err: any) {
      addToast('Action failed', err.message || 'Please try again.', 'error');
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

  // Status Pill renderer
  const renderStatusPill = (item: LogExceptionItem) => {
    if (item.action_status === 'waiting_on_reviewer') {
      return <StatusPill variant="info" label="Reason submitted" dot />;
    }
    if (item.action_status === 'waiting_on_employee' || Boolean(item.employee_notified)) {
      return <StatusPill variant="warning" label="Awaiting employee" dot />;
    }
    if (item.escalated || item.action_status === 'escalated') {
      return <StatusPill variant="neutral" label="Sent to HR" dot />;
    }
    if (item.action_status === 'reviewed' || item.action_status === 'cleared') {
      return <StatusPill variant="success" label="Resolved" dot />;
    }
    return <StatusPill variant="accent" label="Needs review" dot />;
  };

  const filterTabs = [
    { id: 'all' as const, label: 'All', count: counts.total },
    { id: 'gap' as const, label: 'Discrepancy', count: counts.gap },
    { id: 'missing' as const, label: 'Missing logs', count: counts.missing },
    ...(counts.pendingReason > 0 || activeFilter === 'pending_reason'
      ? [{ id: 'pending_reason' as const, label: 'Reason submitted', count: counts.pendingReason }]
      : []),
    ...(counts.escalated > 0 || activeFilter === 'escalated'
      ? [{ id: 'escalated' as const, label: 'Sent to HR', count: counts.escalated }]
      : []),
  ];

  return (
    <div className="flex flex-col h-full w-full bg-canvas overflow-hidden">
      {/* ─── Page Header ─── */}
      <div className="px-6 pt-6 pb-2 shrink-0">
        <PageHeader
          title="Exceptions"
          description="Days where logged hours don't match time at work, or no log was submitted."
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <SegmentedControl
                size="sm"
                value={range}
                onValueChange={(val: string) => setRange(val as 'today' | 'week' | 'date')}
                options={[
                  { value: 'week', label: 'Last 7 workdays' },
                  { value: 'today', label: 'Today' },
                  { value: 'date', label: 'Pick a date' },
                ]}
              />

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
          }
        />
      </div>

      {/* ─── Off-day Banner if applicable ─── */}
      {viewingOff.isOff && !isLoading && (
        <div className="px-6 mb-3">
          <OffDayBanner info={viewingOff} date={range === 'date' ? pickedDate : todayIso()} />
        </div>
      )}

      {/* ─── Main Content ─── */}
      {!isLoading && items.length === 0 ? (
        /* Empty Inbox State (Mock 18) */
        <div className="flex-1 min-h-0 px-6 pb-6 overflow-y-auto">
          <div className="h-full bg-surface border border-border rounded-lg shadow-xs flex flex-col justify-between overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 overflow-x-auto text-ui">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    disabled
                    className="px-2.5 py-1 rounded-md text-xs font-medium text-fg-muted flex items-center gap-1.5 opacity-60"
                  >
                    <span>{tab.label}</span>
                    <span className="text-micro font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-subtle">
                      0
                    </span>
                  </button>
                ))}
              </div>

              <div className="relative w-64 max-w-xs shrink-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
                <input
                  type="text"
                  disabled
                  placeholder="Search by name or department"
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-subtle border border-border rounded-md text-fg-muted cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center py-16">
              <EmptyState
                icon={CheckCircle2}
                title="You're all caught up"
                description="No open exceptions for your team in the last 30 days. New ones appear here when logged hours and time at work don't match, or a daily log is missing."
                actions={
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRange('week');
                        load();
                      }}
                      className="gap-1.5"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>View resolved</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDailyLog?.(pickedDate)}
                      className="gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Open team daily logs</span>
                    </Button>
                  </div>
                }
              />
            </div>

            {/* Bottom KPI strip (Mock 18) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border bg-subtle/30 divide-x divide-border">
              <div className="p-4">
                <p className="text-small text-fg-muted font-medium">Logs reviewed</p>
                <p className="text-h2 font-semibold text-fg font-mono tabular-nums mt-1">236</p>
              </div>
              <div className="p-4">
                <p className="text-small text-fg-muted font-medium">Exceptions resolved</p>
                <p className="text-h2 font-semibold text-fg font-mono tabular-nums mt-1">18</p>
              </div>
              <div className="p-4">
                <p className="text-small text-fg-muted font-medium">Average resolution</p>
                <p className="text-h2 font-semibold text-fg font-mono tabular-nums mt-1">5h 40m</p>
              </div>
              <div className="p-4">
                <p className="text-small text-fg-muted font-medium">Escalated to HR</p>
                <p className="text-h2 font-semibold text-fg font-mono tabular-nums mt-1">{counts.escalated}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Two-Pane Inbox Layout (Mock 07) */
        <div className="flex-1 min-h-0 px-6 pb-6 overflow-hidden flex flex-col lg:flex-row gap-4">
          {/* ─── Left List Pane (400px) ─── */}
          <div
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="w-full lg:w-[400px] shrink-0 flex flex-col bg-surface border border-border rounded-lg shadow-xs overflow-hidden focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {/* Header: Search + Tabs */}
            <div className="p-3 border-b border-border space-y-2.5 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or department"
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-subtle border border-border rounded-md placeholder:text-fg-muted text-fg focus:outline-none focus:border-border-strong"
                />
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto text-ui scrollbar-none pb-0.5">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFilter(tab.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0 flex items-center gap-1.5',
                      activeFilter === tab.id
                        ? 'bg-accent-soft text-accent-text font-semibold shadow-xs'
                        : 'text-fg-muted hover:text-fg hover:bg-hover',
                    )}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        'text-micro font-mono tabular-nums px-1.5 py-0.2 rounded-full',
                        activeFilter === tab.id
                          ? 'bg-accent text-accent-fg font-medium'
                          : 'bg-subtle text-fg-muted',
                      )}
                    >
                      {isLoading ? '·' : tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* List Body */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <div key={idx} className="p-3.5 flex items-start gap-3">
                    <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-center justify-between">
                        <Skeleton className="w-28 h-3.5 rounded-sm" />
                        <Skeleton className="w-16 h-3 rounded-sm" />
                      </div>
                      <Skeleton className="w-36 h-3 rounded-sm" />
                      <div className="flex items-center justify-between pt-1">
                        <Skeleton className="w-20 h-4 rounded-full" />
                        <Skeleton className="w-16 h-3.5 rounded-sm" />
                      </div>
                    </div>
                  </div>
                ))
              ) : filteredItems.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    variant="compact"
                    title="No results"
                    description="Nothing matches your search or filters."
                    action={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSearchQuery('');
                          setActiveFilter('all');
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedDetailItem?.id === item.id;
                  const missing = item.is_missing_log || item.exception_type === 'missing_log';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedDetailItem(item)}
                      className={cn(
                        'w-full text-left p-3.5 flex items-start gap-3 transition-colors cursor-pointer border-l-2',
                        isSelected
                          ? 'bg-accent-soft border-accent'
                          : 'border-transparent hover:bg-hover',
                      )}
                    >
                      {/* Avatar */}
                      <Avatar
                        name={item.full_name}
                        src={getAvatarUrl(item.user_id, item.full_name)}
                        size={28}
                        className="rounded-full shrink-0"
                      />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              'text-ui font-medium truncate',
                              isSelected ? 'text-accent-text font-semibold' : 'text-fg',
                            )}
                          >
                            {item.full_name}
                          </span>
                          <span className="text-small text-fg-muted shrink-0 font-mono tabular-nums">
                            {formatItemDate(item.date)}
                          </span>
                        </div>

                        {/* Subtitle / tag */}
                        <p className="text-small text-fg-muted truncate mt-0.5">
                          {item.department || 'General'} ·{' '}
                          {missing ? 'Missing log' : 'Hour discrepancy'}
                        </p>

                        {/* Bottom row: Status pill + Gap */}
                        <div className="flex items-center justify-between gap-2 mt-2">
                          {renderStatusPill(item)}

                          <span
                            className={cn(
                              'text-small font-mono tabular-nums shrink-0',
                              missing
                                ? 'text-danger-fg'
                                : (item.signed_gap_hours || 0) < -0.01
                                ? 'text-danger-fg'
                                : (item.signed_gap_hours || 0) > 0.01
                                ? 'text-success-fg'
                                : 'text-fg-muted',
                            )}
                          >
                            {missing
                              ? `No log · at work ${formatHours(item.worked_hours || 0)}`
                              : `Gap ${formatSignedHours(item.signed_gap_hours || 0)}`}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ─── Right Detail Pane (flex-1) ─── */}
          <div className="flex-1 min-h-0 flex flex-col bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
            {isLoading && !selectedDetailItem ? (
              <div className="p-6">
                <DrawerSkeleton />
              </div>
            ) : !selectedDetailItem ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <EmptyState
                  icon={Inbox}
                  variant="compact"
                  title="Select an exception to review"
                  description="Choose an item from the list on the left to inspect attendance comparison and take action."
                />
              </div>
            ) : (
              <>
                {/* Detail Header */}
                <div className="p-5 border-b border-border flex items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Avatar
                      name={selectedDetailItem.full_name}
                      src={getAvatarUrl(selectedDetailItem.user_id, selectedDetailItem.full_name)}
                      size={40}
                      className="rounded-full shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-h2 font-semibold text-fg tracking-tight truncate">
                          {selectedDetailItem.full_name}
                        </h2>
                        {renderStatusPill(selectedDetailItem)}
                      </div>
                      <p className="text-small text-fg-muted truncate mt-0.5">
                        {selectedDetailItem.department || 'General'} ·{' '}
                        {getRoleDisplayName(selectedDetailItem.role)} ·{' '}
                        {selectedDetailItem.is_missing_log ||
                        selectedDetailItem.exception_type === 'missing_log'
                          ? 'Missing log'
                          : 'Hour discrepancy'}{' '}
                        on {formatItemDate(selectedDetailItem.date)}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openLog(selectedDetailItem)}
                    className="gap-1.5 shrink-0 text-accent-text hover:text-accent-text"
                  >
                    <span>Open full daily log</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </Button>
                </div>

                {/* Detail Body (Scrollable) */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                  {/* Time Comparison Cards */}
                  <div className="space-y-3">
                    <h3 className="text-h3 font-semibold text-fg">Time comparison</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* At work */}
                      <div className="p-4 rounded-lg bg-subtle/50 border border-border space-y-1">
                        <p className="text-small text-fg-muted font-medium">At work</p>
                        <p className="text-h1 font-semibold text-fg font-mono tabular-nums">
                          {selectedDetailItem.has_checkout ||
                          (selectedDetailItem.worked_hours || 0) > 0
                            ? formatHours(selectedDetailItem.worked_hours || 0)
                            : selectedDetailItem.has_checkin
                            ? 'Clocked in'
                            : '0h'}
                        </p>
                        <p className="text-small text-fg-muted">
                          {selectedDetailItem.has_checkout
                            ? 'Shift completed'
                            : selectedDetailItem.has_checkin
                            ? 'Currently working'
                            : 'No punch recorded'}
                        </p>
                      </div>

                      {/* Logged */}
                      <div className="p-4 rounded-lg bg-subtle/50 border border-border space-y-1">
                        <p className="text-small text-fg-muted font-medium">Logged</p>
                        <p className="text-h1 font-semibold text-fg font-mono tabular-nums">
                          {formatHours(selectedDetailItem.logged_hours || 0)}
                        </p>
                        <p className="text-small text-fg-muted">
                          {detailTasks.length || selectedDetailItem.task_count || 0} entries
                        </p>
                      </div>

                      {/* Gap */}
                      <div className="p-4 rounded-lg bg-subtle/50 border border-border space-y-1">
                        <p className="text-small text-fg-muted font-medium">Gap</p>
                        <p
                          className={cn(
                            'text-h1 font-semibold font-mono tabular-nums',
                            selectedDetailItem.is_missing_log
                              ? 'text-danger-fg'
                              : (selectedDetailItem.signed_gap_hours || 0) < -0.01
                              ? 'text-danger-fg'
                              : (selectedDetailItem.signed_gap_hours || 0) > 0.01
                              ? 'text-success-fg'
                              : 'text-fg-muted',
                          )}
                        >
                          {selectedDetailItem.is_missing_log
                            ? 'No log'
                            : formatSignedHours(selectedDetailItem.signed_gap_hours || 0)}
                        </p>
                        <p className="text-small text-fg-muted">
                          {selectedDetailItem.is_missing_log
                            ? 'No entries submitted'
                            : selectedDetailItem.worked_hours &&
                              selectedDetailItem.worked_hours > 0
                            ? `${Math.min(
                                100,
                                Math.round(
                                  (Math.abs(selectedDetailItem.signed_gap_hours || 0) /
                                    selectedDetailItem.worked_hours) *
                                    100,
                                ),
                              )}% of time at work`
                            : 'Variance'}
                        </p>
                      </div>
                    </div>

                    {/* Progress Comparison Bars */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-small text-fg-muted w-14 shrink-0">At work</span>
                        <div className="flex-1 h-2 rounded-full bg-subtle overflow-hidden">
                          <div className="h-full bg-border-strong rounded-full w-full" />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-small text-fg-muted w-14 shrink-0">Logged</span>
                        <div className="flex-1 h-2 rounded-full bg-subtle overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                selectedDetailItem.worked_hours &&
                                  selectedDetailItem.worked_hours > 0
                                  ? Math.round(
                                      ((selectedDetailItem.logged_hours || 0) /
                                        selectedDetailItem.worked_hours) *
                                        100,
                                    )
                                  : (selectedDetailItem.logged_hours || 0) > 0
                                  ? 100
                                  : 0,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Employee Explanation */}
                  {selectedDetailItem.member_reason && (
                    <div className="space-y-2">
                      <h3 className="text-h3 font-semibold text-fg">Employee explanation</h3>
                      <div className="p-4 rounded-lg bg-subtle border-l-2 border-border-strong space-y-1">
                        <p className="text-body text-fg italic leading-relaxed">
                          “{selectedDetailItem.member_reason}”
                        </p>
                        <p className="text-small text-fg-muted">Submitted by employee</p>
                      </div>
                    </div>
                  )}

                  {/* Reopened Note */}
                  {selectedDetailItem.reopen_note &&
                    !selectedDetailItem.reopen_note.includes('+0:00') &&
                    !selectedDetailItem.reopen_note.includes('-0:00') &&
                    !selectedDetailItem.reopen_note.includes('+0h') &&
                    !selectedDetailItem.reopen_note.includes('-0h') && (
                      <Callout variant="warning" title="Reopened exception">
                        {selectedDetailItem.reopen_note}
                      </Callout>
                    )}

                  {/* Logged Tasks Table */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-h3 font-semibold text-fg">
                        Logged tasks ({detailTasks.length})
                      </h3>
                    </div>

                    {isLoadingTasks ? (
                      <div className="p-6 text-center text-fg-muted text-small flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-accent" />
                        <span>Loading logged tasks…</span>
                      </div>
                    ) : detailTasks.length === 0 ? (
                      <div className="p-6 rounded-lg bg-subtle border border-border text-center text-fg-muted space-y-1">
                        <p className="text-ui font-medium text-fg">No daily log tasks recorded</p>
                        <p className="text-small">
                          The employee has not logged any tasks in their daily sheet for this date.
                        </p>
                      </div>
                    ) : (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <table className="w-full text-left text-table">
                          <thead className="bg-subtle text-small text-fg-muted border-b border-border">
                            <tr>
                              <th className="px-3.5 py-2.5 font-medium">Client / project</th>
                              <th className="px-3.5 py-2.5 font-medium">Task</th>
                              <th className="px-3.5 py-2.5 font-medium">Hours</th>
                              <th className="px-3.5 py-2.5 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {detailTasks.map((entry) => (
                              <tr key={entry.id} className="hover:bg-hover transition-colors">
                                <td className="px-3.5 py-2.5 text-fg font-medium">
                                  {entry.client_project || entry.department || 'General'}
                                </td>
                                <td className="px-3.5 py-2.5 text-fg-2 truncate max-w-[280px]">
                                  {entry.task_description || '—'}
                                </td>
                                <td className="px-3.5 py-2.5 font-mono tabular-nums text-fg">
                                  {formatHours(Number(entry.hours_utilized) || 0)}
                                </td>
                                <td className="px-3.5 py-2.5">
                                  {(() => {
                                    const st = String(entry.task_status || '').toLowerCase();
                                    const isComp = st === 'completed';
                                    const isBlock = st === 'blocker';
                                    return (
                                      <StatusPill
                                        variant={isComp ? 'success' : isBlock ? 'danger' : 'warning'}
                                        label={isComp ? 'Completed' : isBlock ? 'Blocker' : 'Incomplete'}
                                        dot
                                      />
                                    );
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Detail Sticky Footer Actions */}
                <div className="p-4 border-t border-border bg-surface flex items-center justify-between gap-3 shrink-0">
                  {/* Left Actions */}
                  <div className="flex items-center gap-2">
                    {isLead && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actingId === selectedDetailItem.id}
                        onClick={() => handleAction(selectedDetailItem, 'escalate')}
                        className="gap-1.5"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Escalate to HR</span>
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={actingId === selectedDetailItem.id}
                      onClick={() => handleAction(selectedDetailItem, 'review')}
                      className="gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark as looks fine</span>
                    </Button>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2">
                    {selectedDetailItem.action_status === 'waiting_on_reviewer' ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={actingId === selectedDetailItem.id}
                          onClick={() => handleAction(selectedDetailItem, 'ask_again')}
                          className="gap-1.5"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Ask to fix</span>
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={actingId === selectedDetailItem.id}
                          loadingText="Accepting…"
                          icon={Check}
                          onClick={() => handleAction(selectedDetailItem, 'accept')}
                        >
                          Accept reason
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={
                            actingId === selectedDetailItem.id ||
                            Boolean(selectedDetailItem.employee_notified) ||
                            selectedDetailItem.action_status === 'waiting_on_employee'
                          }
                          onClick={() => handleAction(selectedDetailItem, 'explain')}
                          className="gap-1.5"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>
                            {Boolean(selectedDetailItem.employee_notified) ||
                            selectedDetailItem.action_status === 'waiting_on_employee'
                              ? 'Already requested'
                              : 'Ask to fix'}
                          </span>
                        </Button>

                        <Button
                          variant="primary"
                          size="sm"
                          loading={actingId === selectedDetailItem.id}
                          loadingText="Updating…"
                          icon={Check}
                          onClick={() => handleAction(selectedDetailItem, 'review')}
                        >
                          Mark as looks fine
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
