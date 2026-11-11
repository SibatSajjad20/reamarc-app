import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Calendar as CalendarIcon,
  Search,
  Mail,
  Check,
  HelpCircle,
  Download,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { BoundedCache } from '../../utils/cache';
import { logVarianceService } from '../../services/logVarianceService';
import { logExceptionService } from '../../services/logExceptionService';
import type { ExceptionsResponse, ExceptionGroup, ExceptionItem } from '../../types/logVariance';
import { Button } from '../ui/button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { CustomSelect } from '../ui/CustomSelect';
import { DateRangeCalendarPicker } from '../daily-log/DateRangeCalendarPicker';
import { Avatar } from '../ui/Avatar';
import { CardListSkeleton } from '../ui/Skeletons';
import { ErrorState } from '../ui/ErrorState';
import { EmptyState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { LogVarianceFormulasPopover } from '../admin/sections/LogVarianceFormulasPopover';
import { getRoleDisplayName } from '../../lib/roleLabel';
import { cn } from '../../lib/utils';
import { CANONICAL_DEPARTMENTS } from '../../utils/departments';
import {
  pktTodayIso,
  pktWeekBounds,
  pktMonthBounds,
  shiftDateRange,
} from '../../utils/logVarianceFormat';

interface ExceptionInboxViewProps {
  onOpenDailyLog?: (date: string) => void;
}

type RangeMode = 'today' | 'week' | 'month' | 'custom';

const EXCEPTION_TYPES = [
  { key: 'all', label: 'All types' },
  { key: 'no_log', label: 'No log on worked day' },
  { key: 'over_logged', label: 'Logged > worked' },
  { key: 'missing_checkout', label: 'Missing checkout' },
  { key: 'large_variance', label: 'Large variance' },
  { key: 'logged_on_leave_or_off', label: 'Logged on leave / off day' },
  { key: 'logged_without_attendance', label: 'Logged without attendance' },
] as const;

const TYPE_TONE: Record<string, { chip: string; count: string; selected: string }> = {
  all: {
    chip: 'bg-surface text-fg-muted border-border hover:bg-hover hover:text-fg',
    count: 'bg-subtle text-fg',
    selected: 'bg-muted-bg text-fg border-border shadow-xs',
  },
  no_log: {
    chip: 'bg-surface text-fg-muted border-border hover:bg-hover hover:text-fg',
    count: 'bg-danger-bg text-danger-fg',
    selected: 'bg-danger-bg text-danger-fg border-danger-bd shadow-xs',
  },
  over_logged: {
    chip: 'bg-surface text-fg-muted border-border hover:bg-hover hover:text-fg',
    count: 'bg-info-bg text-info-fg',
    selected: 'bg-info-bg text-info-fg border-info-bd shadow-xs',
  },
  missing_checkout: {
    chip: 'bg-surface text-fg-muted border-border hover:bg-hover hover:text-fg',
    count: 'bg-warning-bg text-warning-fg',
    selected: 'bg-warning-bg text-warning-fg border-warning-bd shadow-xs',
  },
  large_variance: {
    chip: 'bg-surface text-fg-muted border-border hover:bg-hover hover:text-fg',
    count: 'bg-warning-bg text-warning-fg',
    selected: 'bg-warning-bg text-warning-fg border-warning-bd shadow-xs',
  },
  logged_on_leave_or_off: {
    chip: 'bg-surface text-fg-muted border-border hover:bg-hover hover:text-fg',
    count: 'bg-subtle text-fg-muted',
    selected: 'bg-muted-bg text-fg border-border shadow-xs',
  },
  logged_without_attendance: {
    chip: 'bg-surface text-fg-muted border-border hover:bg-hover hover:text-fg',
    count: 'bg-danger-bg text-danger-fg',
    selected: 'bg-danger-bg text-danger-fg border-danger-bd shadow-xs',
  },
};

const FLAG_PILL: Record<string, string> = {
  'No log on worked day': 'bg-danger-bg text-danger-fg border-danger-bd',
  'Logged > worked': 'bg-info-bg text-info-fg border-info-bd',
  'Missing checkout': 'bg-warning-bg text-warning-fg border-warning-bd',
  'Large variance': 'bg-warning-bg text-warning-fg border-warning-bd',
  'Logged on leave/off day': 'bg-muted-bg text-fg border-border',
  'Logged on leave / off day': 'bg-muted-bg text-fg border-border',
  'Logged without attendance': 'bg-danger-bg text-danger-fg border-danger-bd',
};

const exceptionsRangeCache = new BoundedCache<ExceptionsResponse>(16);

export function clearExceptionsRangeCache(): void {
  exceptionsRangeCache.clear();
}

function cacheKey(parts: {
  startDate: string;
  endDate: string;
  department: string;
  groupBy: string;
  showReviewed: boolean;
}): string {
  return [parts.startDate, parts.endDate, parts.department, parts.groupBy, parts.showReviewed ? '1' : '0'].join('|');
}

function stripLoggedLate(res: ExceptionsResponse): ExceptionsResponse {
  const groups = (res.groups || [])
    .map((g) => {
      const items = (g.items || []).filter((it) => it.type !== 'logged_late');
      const flags = (g.flags || []).filter((f) => !/logged late/i.test(f));
      return { ...g, items, flags, count: items.length };
    })
    .filter((g) => g.items.length > 0);
  const totals = { ...(res.totals_by_type || {}) };
  const late = Number(totals.logged_late || 0);
  return {
    ...res,
    groups,
    totals_by_type: {
      ...totals,
      all: Math.max(0, Number(totals.all || 0) - late),
      logged_late: 0,
    },
  };
}

const formatDisplayDate = (isoStr: string): string => {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
};

const formatShortDisplay = (isoStr: string): string => {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
};

function applyTypeFilter(groups: ExceptionGroup[], type: string): ExceptionGroup[] {
  if (type === 'all') return groups;
  return groups
    .map((g) => {
      const items = g.items.filter((it) => it.type === type);
      if (items.length === 0) return null;
      const counts: Record<string, number> = {};
      items.forEach((it) => {
        counts[it.type_label] = (counts[it.type_label] || 0) + 1;
      });
      const flags = Object.entries(counts).map(([lbl, cnt]) => (cnt > 1 ? `${lbl} ×${cnt}` : lbl));
      return { ...g, items, count: items.length, flags };
    })
    .filter(Boolean) as ExceptionGroup[];
}

export const ExceptionInboxView: React.FC<ExceptionInboxViewProps> = () => {
  const { addToast } = useToast();

  const [rangeMode, setRangeMode] = useState<RangeMode>('month');
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthOffset, setMonthOffset] = useState<number>(0);
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>(() => pktMonthBounds(new Date()));

  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'employee' | 'day'>('employee');
  const [searchQuery, setSearchQuery] = useState('');
  const [showReviewed, setShowReviewed] = useState(false);

  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [isFormulasOpen, setIsFormulasOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const { startDate, endDate, rangeSubtitle } = useMemo(() => {
    const now = new Date();
    if (rangeMode === 'today') {
      const t = pktTodayIso(now);
      const [y, m, d] = t.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      const formatted = dt.toLocaleDateString('en-GB', {
        timeZone: 'UTC',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return { startDate: t, endDate: t, rangeSubtitle: formatted };
    }
    if (rangeMode === 'week') {
      const ref = new Date(now.getTime() + weekOffset * 7 * 86400000);
      const bounds = pktWeekBounds(ref);
      return {
        startDate: bounds.start,
        endDate: bounds.end,
        rangeSubtitle: `${formatShortDisplay(bounds.start)} – ${formatShortDisplay(bounds.end)}`,
      };
    }
    if (rangeMode === 'month') {
      const pktToday = pktTodayIso(now);
      const [y, m] = pktToday.split('-').map(Number);
      const refMonth = new Date(Date.UTC(y, m - 1 + monthOffset, 1));
      const bounds = pktMonthBounds(refMonth);
      const monthTitle = refMonth.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });
      return {
        startDate: bounds.start,
        endDate: bounds.end,
        rangeSubtitle: `1 ${refMonth.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short' })} – ${bounds.end.slice(8)} ${monthTitle}`,
      };
    }
    return {
      startDate: customRange.start,
      endDate: customRange.end,
      rangeSubtitle: `${formatShortDisplay(customRange.start)} – ${formatShortDisplay(customRange.end)}`,
    };
  }, [rangeMode, weekOffset, monthOffset, customRange]);

  const requestKey = cacheKey({
    startDate,
    endDate,
    department: selectedDept,
    groupBy,
    showReviewed,
  });

  const [data, setData] = useState<ExceptionsResponse | null>(null);
  const [loadedKey, setLoadedKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const loadedKeyRef = useRef('');
  const addToastRef = useRef(addToast);
  addToastRef.current = addToast;
  const queryRef = useRef({ startDate, endDate, selectedDept, groupBy, showReviewed, requestKey });
  queryRef.current = { startDate, endDate, selectedDept, groupBy, showReviewed, requestKey };

  const applyLoaded = useCallback((key: string, res: ExceptionsResponse) => {
    const cleaned = stripLoggedLate(res);
    loadedKeyRef.current = key;
    setData(cleaned);
    setLoadedKey(key);
    const initialExpanded: Record<string, boolean> = {};
    (cleaned.groups || []).forEach((g) => {
      initialExpanded[g.key] = true;
    });
    setExpandedGroups(initialExpanded);
    setIsLoading(false);
    setFetchError(null);
  }, []);

  const fetchData = useCallback(
    async (opts?: { force?: boolean }) => {
      const { startDate: s, endDate: e, selectedDept: dept, groupBy: group, showReviewed: reviewed, requestKey: key } =
        queryRef.current;
      if (!opts?.force) {
        const cached = exceptionsRangeCache.get(key);
        if (cached) {
          if (loadedKeyRef.current !== key) applyLoaded(key, cached.data);
          return;
        }
      }

      const seq = ++requestSeq.current;
      setIsLoading(true);
      setFetchError(null);
      try {
        const res = await logVarianceService.getExceptions({
          startDate: s,
          endDate: e,
          department: dept !== 'all' ? dept : undefined,
          group,
          includeReviewed: reviewed,
        });
        exceptionsRangeCache.set(key, res);
        if (seq !== requestSeq.current) return;
        applyLoaded(key, res);
      } catch (err: any) {
        if (seq !== requestSeq.current) return;
        setFetchError(err.message || 'Failed to load exceptions');
        addToastRef.current('Error', err.message || 'Failed to load exceptions', 'error');
        setIsLoading(false);
      }
    },
    [applyLoaded]
  );

  useEffect(() => {
    const cached = exceptionsRangeCache.get(requestKey);
    if (cached) {
      if (loadedKeyRef.current !== requestKey) applyLoaded(requestKey, cached.data);
      return;
    }
    loadedKeyRef.current = '';
    setData(null);
    setLoadedKey('');
    void fetchData();
  }, [requestKey, fetchData, applyLoaded]);

  useCacheInvalidation(['exceptions', 'daily-log'], () => {
    exceptionsRangeCache.clear();
    loadedKeyRef.current = '';
    void fetchData({ force: true });
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAction = async (
    item: ExceptionItem,
    action: 'explain' | 'correct' | 'review' | 'escalate' | 'accept' | 'ask_again'
  ) => {
    setActingId(item.id);
    try {
      await logExceptionService.act(item.id, action);
      addToast('Success', 'Action recorded', 'success');
      exceptionsRangeCache.clear();
      void fetchData({ force: true });
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to act on exception', 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await logVarianceService.exportExcel(
        startDate,
        endDate,
        selectedDept !== 'all' ? selectedDept : undefined
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Log variance ${startDate}_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      addToast('Export failed', err.message || 'Could not export file', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const showContent = loadedKey === requestKey && data && !isLoading;
  const totals = data?.totals_by_type;

  const typedGroups = useMemo(
    () => applyTypeFilter(data?.groups || [], selectedType),
    [data?.groups, selectedType]
  );

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return typedGroups;
    const q = searchQuery.trim().toLowerCase();
    return typedGroups
      .map((g) => {
        const matchesLabel = g.label.toLowerCase().includes(q);
        const matchingItems = g.items.filter(
          (it) =>
            it.user_name.toLowerCase().includes(q) ||
            it.date.toLowerCase().includes(q) ||
            it.detail.toLowerCase().includes(q) ||
            it.type_label.toLowerCase().includes(q)
        );
        if (matchesLabel) return g;
        if (matchingItems.length > 0) {
          return { ...g, items: matchingItems, count: matchingItems.length };
        }
        return null;
      })
      .filter(Boolean) as ExceptionGroup[];
  }, [typedGroups, searchQuery]);

  const openCount = useMemo(
    () => typedGroups.reduce((sum, g) => sum + g.count, 0),
    [typedGroups]
  );

  const departmentOptions = useMemo(
    () => [
      { value: 'all', label: 'All departments' },
      ...CANONICAL_DEPARTMENTS.map((d) => ({ value: d, label: d })),
    ],
    []
  );

  return (
    <div className="flex flex-1 flex-col h-full w-full min-h-0 min-w-0 bg-canvas text-fg overflow-hidden">
      <div
        data-testid="exceptions-scroll"
        className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden custom-scrollbar p-6 space-y-4"
      >
        <PageHeader
          className="mb-1"
          title="Exceptions"
          description="Days that need a look. Same date range and rules as Log variance."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={HelpCircle} onClick={() => setIsFormulasOpen(true)}>
                How it's calculated
              </Button>
              <Button variant="primary" size="sm" icon={Download} loading={isExporting} onClick={handleExport}>
                Export
              </Button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="sm"
            value={rangeMode}
            onValueChange={(val) => {
              const next = val as RangeMode;
              setRangeMode(next);
              setWeekOffset(0);
              setMonthOffset(0);
              if (next === 'custom') setIsRangePickerOpen(true);
              else setIsRangePickerOpen(false);
            }}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'This week' },
              { value: 'month', label: 'This month' },
              { value: 'custom', label: 'Custom' },
            ]}
          />

          {rangeMode === 'week' && (
            <div className="inline-flex items-center h-8 gap-0.5 bg-surface border border-border rounded-md px-1 text-xs font-medium text-fg shadow-xs">
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev - 1)}
                className="p-1 rounded hover:bg-hover text-fg-muted hover:text-fg cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-1.5 whitespace-nowrap">{rangeSubtitle}</span>
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev + 1)}
                className="p-1 rounded hover:bg-hover text-fg-muted hover:text-fg cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {rangeMode === 'month' && (
            <div className="inline-flex items-center h-8 gap-0.5 bg-surface border border-border rounded-md px-1 text-xs font-medium text-fg shadow-xs">
              <button
                type="button"
                onClick={() => setMonthOffset((prev) => prev - 1)}
                className="p-1 rounded hover:bg-hover text-fg-muted hover:text-fg cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-1.5 whitespace-nowrap">{rangeSubtitle}</span>
              <button
                type="button"
                onClick={() => setMonthOffset((prev) => prev + 1)}
                className="p-1 rounded hover:bg-hover text-fg-muted hover:text-fg cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {rangeMode === 'custom' && (
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                icon={CalendarIcon}
                onClick={() => setIsRangePickerOpen((o) => !o)}
              >
                {rangeSubtitle}
              </Button>
              {isRangePickerOpen && (
                <div className="absolute left-0 top-full mt-2 z-50">
                  <DateRangeCalendarPicker
                    initialStartDate={customRange.start}
                    initialEndDate={customRange.end}
                    onApply={({ startDate: s, endDate: e }) => {
                      setCustomRange({ start: s, end: e });
                      setRangeMode('custom');
                      setIsRangePickerOpen(false);
                    }}
                    onCancel={() => setIsRangePickerOpen(false)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="w-[220px] ml-auto">
            <CustomSelect
              value={selectedDept}
              onChange={(val) => setSelectedDept(val)}
              options={departmentOptions}
              size="sm"
              searchable
              searchPlaceholder="Search departments…"
              aria-label="All departments"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              placeholder="Search employee or date…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs bg-surface border border-border rounded-md text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            {showContent && (
              <span className="text-xs text-fg-muted font-medium font-numeric tabular-nums whitespace-nowrap">
                {filteredGroups.length} {groupBy === 'employee' ? 'people' : 'days'} · {openCount} open
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowReviewed((prev) => !prev)}>
              {showReviewed ? 'Hide reviewed' : `Show reviewed${data?.reviewed_count != null ? ` (${data.reviewed_count})` : ''}`}
            </Button>
            <div className="w-[148px]">
              <CustomSelect
                value={groupBy}
                onChange={(val) => setGroupBy(val as 'employee' | 'day')}
                options={[
                  { value: 'employee', label: 'By employee' },
                  { value: 'day', label: 'By day' },
                ]}
                size="sm"
                aria-label="Group exceptions"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {showContent && totals ? (
            EXCEPTION_TYPES.map((t) => {
              const count = t.key === 'all' ? totals.all : Number((totals as Record<string, number>)[t.key] || 0);
              const tone = TYPE_TONE[t.key];
              const selected = selectedType === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedType(t.key)}
                  className={cn(
                    'inline-flex items-center gap-2 h-8 pl-3 pr-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors border',
                    selected ? tone.selected : tone.chip
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      'min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums inline-flex items-center justify-center',
                      selected ? 'bg-surface/70' : tone.count
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })
          ) : (
            Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="h-8 w-36 rounded-full bg-subtle animate-pulse border border-border" />
            ))
          )}
        </div>

        {(!showContent || isLoading) && !fetchError && <CardListSkeleton rows={6} />}

        {fetchError && !showContent && (
          <ErrorState title="Could not load exceptions" message={fetchError} onRetry={() => fetchData({ force: true })} />
        )}

        {showContent && (
          <div className="border border-border rounded-xl overflow-hidden bg-surface shadow-xs divide-y divide-border">
            {filteredGroups.length === 0 ? (
              <div className="py-12 text-center">
                <EmptyState
                  icon={Check}
                  title="No open exceptions"
                  description="All logs in this range are either completed or properly accounted for."
                />
              </div>
            ) : (
              filteredGroups.map((group) => {
                const isExpanded = Boolean(expandedGroups[group.key]);
                return (
                  <div key={group.key} className="bg-surface">
                    <div
                      onClick={() => toggleGroup(group.key)}
                      className="px-3.5 py-3 bg-canvas/40 hover:bg-hover flex items-center justify-between gap-3 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-fg-muted shrink-0">
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        {groupBy === 'employee' && (
                          <Avatar name={group.label} src={group.avatar || undefined} size={28} />
                        )}
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="text-xs font-semibold text-fg truncate">{group.label}</span>
                          {groupBy === 'employee' && group.department && (
                            <span className="text-[11px] text-fg-muted truncate">
                              {getRoleDisplayName(group.role || 'team_member')} · {group.department}
                            </span>
                          )}
                          <span className="w-5 h-5 rounded-full bg-danger-bg text-danger-fg text-[11px] font-bold inline-flex items-center justify-center border border-danger-bd shrink-0">
                            {group.count}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0 max-w-[55%]">
                        {group.flags.map((fl, fIdx) => {
                          const base = fl.replace(/\s*×\d+\s*$/, '');
                          return (
                            <span
                              key={fIdx}
                              className={cn(
                                'px-2 py-0.5 rounded-md text-[10px] font-semibold border',
                                FLAG_PILL[base] || 'bg-muted-bg text-fg-muted border-border'
                              )}
                            >
                              {fl}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-canvas border-b border-border text-fg-muted font-medium">
                            <tr>
                              {groupBy === 'day' && <th className="py-2 px-3">Employee</th>}
                              <th className="py-2 px-3">Date</th>
                              <th className="py-2 px-3">Type</th>
                              <th className="py-2 px-3">Details</th>
                              <th className="py-2 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {group.items.map((item) => (
                              <tr key={item.id} className="hover:bg-hover transition-colors">
                                {groupBy === 'day' && (
                                  <td className="py-2.5 px-3 font-medium text-fg whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <Avatar name={item.user_name} src={item.avatar || undefined} size={20} />
                                      <span>{item.user_name}</span>
                                    </div>
                                  </td>
                                )}
                                <td className="py-2.5 px-3 font-medium text-fg whitespace-nowrap">
                                  {formatDisplayDate(item.date)}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {renderExceptionTypePill(item.type, item.type_label)}
                                </td>
                                <td className="py-2.5 px-3 text-fg-muted">
                                  <span className="font-medium text-fg">{item.detail}</span>
                                  {item.member_reason && (
                                    <div className="mt-1 text-[11px] text-info-fg bg-info-bg/30 px-2 py-1 rounded border border-info-bd">
                                      Employee: "{item.member_reason}"
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1.5">
                                    {item.review_state === 'reviewed' ? (
                                      <span className="text-[11px] font-medium text-success-fg">Reviewed</span>
                                    ) : item.review_state === 'waiting_on_reviewer' ? (
                                      <>
                                        <Button
                                          variant="primary"
                                          size="sm"
                                          icon={Check}
                                          loading={actingId === item.id}
                                          onClick={() => handleAction(item, 'accept')}
                                        >
                                          Accept
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          loading={actingId === item.id}
                                          onClick={() => handleAction(item, 'ask_again')}
                                        >
                                          Ask again
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          icon={Mail}
                                          loading={actingId === item.id}
                                          onClick={() => handleAction(item, 'explain')}
                                        >
                                          Remind
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          icon={Check}
                                          loading={actingId === item.id}
                                          onClick={() => handleAction(item, 'review')}
                                        >
                                          Resolve
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <LogVarianceFormulasPopover open={isFormulasOpen} onOpenChange={setIsFormulasOpen} />
    </div>
  );
};

function renderExceptionTypePill(type: string, label: string) {
  const base = FLAG_PILL[label] || TYPE_TONE[type]?.selected || 'bg-muted-bg text-fg-muted border-border';
  return (
    <span className={cn('px-2 py-0.5 rounded-md text-[11px] font-semibold border', base)}>
      {label}
    </span>
  );
}
