import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Info,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Search,
  HelpCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { Button } from '../../ui/button';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { CustomSelect } from '../../ui/CustomSelect';
import { DateRangeCalendarPicker } from '../../daily-log/DateRangeCalendarPicker';
import { Avatar } from '../../ui/Avatar';
import { Progress } from '../../ui/progress';
import { KpiRowSkeleton } from '../../ui/Skeletons';
import { ErrorState } from '../../ui/ErrorState';
import { PageHeader } from '../../ui/PageHeader';
import { KpiCard } from '../../ui/KpiCard';
import {
  TableCard,
  Table,
  THead,
  TH,
  SortHeader,
  TBody,
  TR,
  TD,
  TableEmpty,
} from '../../ui/DataTable';
import { Badge } from '../../ui/badge';
import { EmployeeComplianceDrawer } from './EmployeeComplianceDrawer';
import { LogVarianceFormulasPopover } from './LogVarianceFormulasPopover';
import { logVarianceService } from '../../../services/logVarianceService';
import type { DepartmentSummary, EmployeeRow, LogVarianceResponse, LogVarianceSummary } from '../../../types/logVariance';
import { BoundedCache } from '../../../utils/cache';
import { CANONICAL_DEPARTMENTS, memberDepartmentLists, sameDept } from '../../../utils/departments';
import {
  formatMinutes,
  formatSignedMinutes,
  formatPercentage,
  getVarianceTone,
  getCoverageTone,
  getToneTextClass,
  pktTodayIso,
  pktWeekBounds,
  pktMonthBounds,
} from '../../../utils/logVarianceFormat';
import { cn } from '../../../lib/utils';
import { getRoleDisplayName } from '../../../lib/roleLabel';

interface ComplianceRemindersSectionProps {
  activities?: Record<string, any>;
  isLoading?: boolean;
  onSendReminder?: (userId: string, channel: 'email' | 'in_app' | 'all', customMessage?: string) => Promise<void>;
  isSendingReminder?: boolean | Record<string, boolean>;
  onNavigateExceptions?: () => void;
}

const formatShortDisplay = (isoStr: string): string => {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
};

const formatRangeLabel = (startIso: string, endIso: string): string => {
  if (!startIso || !endIso) return '';
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const sDt = new Date(Date.UTC(sy, sm - 1, sd));
  const eDt = new Date(Date.UTC(ey, em - 1, ed));

  const sStr = sDt.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const eStr = eDt.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return `${sStr} – ${eStr}`;
};

const varianceRangeCache = new BoundedCache<LogVarianceResponse>(12);

export function clearLogVarianceRangeCache(): void {
  varianceRangeCache.clear();
}

function cacheKey(startDate: string, endDate: string): string {
  return `${startDate}|${endDate}`;
}

function rowDeptParts(row: EmployeeRow): { primary: string; secondaries: string[] } {
  return memberDepartmentLists({ department: row.department });
}

function rowMatchesDept(row: EmployeeRow, dept: string): boolean {
  if (!dept || dept === 'all') return true;
  const { primary, secondaries } = rowDeptParts(row);
  return sameDept(primary, dept) || secondaries.some((s) => sameDept(s, dept));
}

function rollupSummary(rows: EmployeeRow[], base?: LogVarianceSummary | null): LogVarianceSummary {
  const days_present = rows.reduce((s, r) => s + (r.days_present || 0), 0);
  const days_logged = rows.reduce((s, r) => s + (r.days_logged || 0), 0);
  const days_missing = rows.reduce((s, r) => s + (r.days_missing || 0), 0);
  const days_under_target = rows.reduce((s, r) => s + (r.days_under_target || 0), 0);
  const worked = rows.reduce((s, r) => s + (r.worked || 0), 0);
  const logged = rows.reduce((s, r) => s + (r.logged || 0), 0);
  const expected = rows.reduce((s, r) => s + (r.expected || 0), 0);
  const variance = worked - logged;
  const open_exceptions = rows.reduce((s, r) => s + (r.open_exceptions || 0), 0);
  return {
    days_scheduled: rows.reduce((s, r) => s + (r.days_scheduled || 0), 0),
    days_present,
    days_logged,
    days_missing,
    days_under_target,
    days_absent: rows.reduce((s, r) => s + (r.days_absent || 0), 0),
    days_leave: rows.reduce((s, r) => s + (r.days_leave || 0), 0),
    days_off: rows.reduce((s, r) => s + (r.days_off || 0), 0),
    days_missing_checkout: rows.reduce((s, r) => s + (r.days_missing_checkout || 0), 0),
    worked,
    logged,
    expected,
    variance,
    coverage_pct: worked > 0 ? Math.round((logged / worked) * 1000) / 10 : null,
    avg_logged_per_day: days_present > 0 ? Math.round(logged / days_present) : null,
    avg_worked_per_day: days_present > 0 ? Math.round(worked / days_present) : null,
    submission_pct: days_present > 0 ? Math.round((days_logged / days_present) * 1000) / 10 : null,
    logged_outside: rows.reduce((s, r) => s + (r.logged_outside || 0), 0),
    people: rows.length,
    open_exceptions,
    today_live: base?.today_live ?? { worked: 0, logged: 0 },
  };
}

function departmentsFromRows(rows: EmployeeRow[]): DepartmentSummary[] {
  const names = new Set<string>();
  rows.forEach((r) => {
    const { primary, secondaries } = rowDeptParts(r);
    if (primary) names.add(primary);
    secondaries.forEach((s) => names.add(s));
  });
  return Array.from(names)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const dRows = rows.filter((r) => rowMatchesDept(r, name));
      const worked = dRows.reduce((s, r) => s + (r.worked || 0), 0);
      const logged = dRows.reduce((s, r) => s + (r.logged || 0), 0);
      const days_present = dRows.reduce((s, r) => s + (r.days_present || 0), 0);
      return {
        department: name,
        people: dRows.length,
        coverage_pct: worked > 0 ? Math.round((logged / worked) * 1000) / 10 : null,
        avg_logged_per_day: days_present > 0 ? Math.round(logged / days_present) : null,
        days_missing: dRows.reduce((s, r) => s + (r.days_missing || 0), 0),
        days_present,
        worked,
        logged,
      };
    });
}

const FLAG_META: { key: string; label: string; className: string }[] = [
  { key: 'no_log', label: 'No log', className: 'bg-danger-bg text-danger-fg border-danger-bd' },
  { key: 'missing_checkout', label: 'Checkout', className: 'bg-warning-bg text-warning-fg border-warning-bd' },
  { key: 'large_variance', label: 'Unlogged', className: 'bg-warning-bg text-warning-fg border-warning-bd' },
  { key: 'over_logged', label: 'Over-logged', className: 'bg-info-bg text-info-fg border-info-bd' },
  { key: 'logged_without_attendance', label: 'No attendance', className: 'bg-danger-bg text-danger-fg border-danger-bd' },
  { key: 'logged_on_leave_or_off', label: 'Leave', className: 'bg-muted-bg text-fg border-border' },
];

type SortField =
  | 'name'
  | 'days_present'
  | 'worked'
  | 'logged'
  | 'variance'
  | 'coverage_pct'
  | 'avg_logged_per_day'
  | 'avg_worked_per_day'
  | 'days_missing'
  | 'days_under_target';

const SORT_LABELS: Record<SortField, string> = {
  name: 'Employee',
  days_present: 'Present',
  worked: 'Worked',
  logged: 'Logged',
  variance: 'Variance',
  coverage_pct: 'Coverage',
  avg_logged_per_day: 'Avg log',
  avg_worked_per_day: 'Avg work',
  days_missing: 'No log',
  days_under_target: 'Under',
};

export const ComplianceRemindersSection: React.FC<ComplianceRemindersSectionProps> = ({
  onSendReminder,
  isSendingReminder = false,
  onNavigateExceptions,
}) => {
  const { addToast } = useToast();

  // Read URL query params on mount
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialFrom = searchParams.get('from');
  const initialTo = searchParams.get('to');
  const initialDept = searchParams.get('dept') || 'all';

  const [rangeMode, setRangeMode] = useState<'today' | 'week' | 'month' | 'custom'>(() => {
    if (initialFrom && initialTo) {
      const today = pktTodayIso(new Date());
      if (initialFrom === today && initialTo === today) return 'today';
      return 'custom';
    }
    return 'week';
  });

  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthOffset, setMonthOffset] = useState<number>(0);
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>(() => {
    const wb = pktWeekBounds(new Date());
    return {
      start: initialFrom || wb.start,
      end: initialTo || wb.end,
    };
  });

  const [selectedDept, setSelectedDept] = useState<string>(initialDept);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'under_target' | 'missing' | 'over_logged' | 'inactive'>('all');

  const [sortField, setSortField] = useState<SortField>('variance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [isFormulasOpen, setIsFormulasOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [drawerMember, setDrawerMember] = useState<EmployeeRow | null>(null);

  // Resolved active date range
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
      return {
        startDate: t,
        endDate: t,
        rangeSubtitle: `Today · ${formatted}`,
      };
    }
    if (rangeMode === 'week') {
      const ref = new Date(now.getTime() + weekOffset * 7 * 86400000);
      const bounds = pktWeekBounds(ref);
      return {
        startDate: bounds.start,
        endDate: bounds.end,
        rangeSubtitle: formatRangeLabel(bounds.start, bounds.end),
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
      rangeSubtitle: formatRangeLabel(customRange.start, customRange.end),
    };
  }, [rangeMode, weekOffset, monthOffset, customRange]);

  // Sync to URL query
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('from', startDate);
    params.set('to', endDate);
    if (selectedDept && selectedDept !== 'all') {
      params.set('dept', selectedDept);
    } else {
      params.delete('dept');
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [startDate, endDate, selectedDept]);

  const requestKey = cacheKey(startDate, endDate);
  const [data, setData] = useState<LogVarianceResponse | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const loadedKeyRef = useRef('');
  const addToastRef = useRef(addToast);
  addToastRef.current = addToast;
  const queryRef = useRef({ startDate, endDate, requestKey });
  queryRef.current = { startDate, endDate, requestKey };

  const applyLoaded = useCallback((key: string, res: LogVarianceResponse) => {
    loadedKeyRef.current = key;
    setData(res);
    setLoadedKey(key);
    setIsLoading(false);
    setFetchError(null);
  }, []);

  const fetchData = useCallback(
    async (opts?: { force?: boolean }) => {
      const { startDate: s, endDate: e, requestKey: key } = queryRef.current;
      if (!opts?.force) {
        const cached = varianceRangeCache.get(key);
        if (cached) {
          if (loadedKeyRef.current !== key) applyLoaded(key, cached.data);
          return;
        }
      }
      const seq = ++requestSeq.current;
      setIsLoading(true);
      setFetchError(null);
      try {
        const res = await logVarianceService.getOverview({ startDate: s, endDate: e });
        varianceRangeCache.set(key, res);
        if (seq !== requestSeq.current) return;
        applyLoaded(key, res);
      } catch (err: any) {
        if (seq !== requestSeq.current) return;
        setFetchError(err.message || 'Failed to load log variance data');
        addToastRef.current('Error', err.message || 'Failed to load data', 'error');
        setIsLoading(false);
      }
    },
    [applyLoaded]
  );

  useEffect(() => {
    const cached = varianceRangeCache.get(requestKey);
    if (cached) {
      if (loadedKeyRef.current !== requestKey) applyLoaded(requestKey, cached.data);
      return;
    }
    loadedKeyRef.current = '';
    setData(null);
    setLoadedKey('');
    void fetchData();
  }, [requestKey, fetchData, applyLoaded]);

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

  const showContent = loadedKey === requestKey && Boolean(data) && !isLoading;
  const allRows = useMemo(() => data?.rows ?? [], [data]);
  const scopedRows = useMemo(
    () => allRows.filter((r) => rowMatchesDept(r, selectedDept)),
    [allRows, selectedDept]
  );
  const filteredRows = useMemo(() => {
    let result = scopedRows;
    if (quickFilter === 'under_target') {
      result = result.filter((r) => r.days_under_target > 0);
    } else if (quickFilter === 'missing') {
      result = result.filter((r) => r.days_missing > 0);
    } else if (quickFilter === 'over_logged') {
      result = result.filter((r) => r.variance < -30);
    } else if (quickFilter === 'inactive') {
      result = result.filter((r) => r.inactive);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.department && r.department.toLowerCase().includes(q))
      );
    }
    return result;
  }, [scopedRows, quickFilter, searchQuery]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB);
        if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
      } else {
        const numA = (valA as number) ?? 0;
        const numB = (valB as number) ?? 0;
        if (numA !== numB) {
          return sortDir === 'asc' ? numA - numB : numB - numA;
        }
      }
      return a.name.localeCompare(b.name);
    });
  }, [filteredRows, sortField, sortDir]);

  // Counts for quick filter pills
  const underTargetCount = useMemo(() => scopedRows.filter((r) => r.days_under_target > 0).length, [scopedRows]);
  const missingCount = useMemo(() => scopedRows.filter((r) => r.days_missing > 0).length, [scopedRows]);
  const overLoggedCount = useMemo(() => scopedRows.filter((r) => r.variance < -30).length, [scopedRows]);
  const inactiveCount = useMemo(() => scopedRows.filter((r) => r.inactive).length, [scopedRows]);

  const departmentOptions = useMemo(
    () => [
      { value: 'all', label: 'All departments' },
      ...CANONICAL_DEPARTMENTS.map((d) => ({ value: d, label: d })),
    ],
    []
  );

  const departmentCards = useMemo(() => departmentsFromRows(allRows), [allRows]);
  const summary = useMemo(
    () => (selectedDept === 'all' && data?.summary ? data.summary : rollupSummary(scopedRows, data?.summary)),
    [selectedDept, data, scopedRows]
  );

  return (
    <div className="flex flex-1 flex-col h-full w-full min-h-0 min-w-0 bg-canvas text-fg overflow-hidden">
      <div
        data-testid="log-variance-scroll"
        className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden custom-scrollbar p-6 space-y-4"
      >
      <PageHeader
        className="mb-1"
        title="Log variance"
        description="Worked vs logged hours for every employee, totalled over the selected range."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={HelpCircle}
              onClick={() => setIsFormulasOpen(true)}
            >
              How it's calculated
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Download}
              loading={isExporting}
              onClick={handleExport}
            >
              Export
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          size="sm"
          value={rangeMode}
          onValueChange={(val) => {
            setRangeMode(val as any);
            setWeekOffset(0);
            setMonthOffset(0);
            if (val === 'custom') setIsRangePickerOpen(true);
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
              className="p-1 rounded hover:bg-hover text-fg-muted hover:text-fg cursor-pointer transition-colors"
              title="Previous week"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-1.5 whitespace-nowrap">{rangeSubtitle}</span>
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              className="p-1 rounded hover:bg-hover text-fg-muted hover:text-fg cursor-pointer transition-colors"
              title="Next week"
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
              className="p-1 rounded hover:bg-hover text-fg-muted hover:text-fg cursor-pointer transition-colors"
              title="Previous month"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-1.5 whitespace-nowrap">{rangeSubtitle}</span>
            <button
              type="button"
              onClick={() => setMonthOffset((prev) => prev + 1)}
              className="p-1 rounded hover:bg-hover text-fg-muted hover:text-fg cursor-pointer transition-colors"
              title="Next month"
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
              {`${formatShortDisplay(customRange.start)} – ${formatShortDisplay(customRange.end)}`}
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

      {(!showContent || isLoading) && !fetchError && <KpiRowSkeleton count={4} />}

      {fetchError && !showContent && (
        <ErrorState
          title="Could not load log variance"
          message={fetchError}
          onRetry={() => fetchData({ force: true })}
        />
      )}

      {showContent && summary && (
        <>
          {/* 3. KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              label="Worked"
              value={formatMinutes(summary.worked)}
              deltaContext={`${summary.days_present} present days`}
              icon={Clock}
            />
            <KpiCard
              label="Logged"
              value={formatMinutes(summary.logged)}
              deltaContext={`on the same ${summary.days_present} days`}
              icon={Clock}
            />
            <KpiCard
              label="Unlogged"
              value={
                <span className={getToneTextClass(getVarianceTone(summary.variance, summary.days_present))}>
                  {formatSignedMinutes(summary.variance)}
                </span>
              }
              deltaContext="worked − logged"
              icon={Clock}
            />
            <KpiCard
              label="Coverage"
              value={
                <span className={getToneTextClass(getCoverageTone(summary.coverage_pct))}>
                  {formatPercentage(summary.coverage_pct, 0)}
                </span>
              }
              deltaContext="logged ÷ worked · target 95%"
              icon={Clock}
            />
            <KpiCard
              label="Avg logged / day"
              value={formatMinutes(summary.avg_logged_per_day)}
              deltaContext={
                summary.days_present > 0
                  ? `${formatMinutes(summary.logged)} ÷ ${summary.days_present} days present`
                  : '—'
              }
              icon={Clock}
            />
            <KpiCard
              label="Avg worked / day"
              value={formatMinutes(summary.avg_worked_per_day)}
              deltaContext={
                summary.days_present > 0
                  ? `${formatMinutes(summary.worked)} ÷ ${summary.days_present} days present`
                  : '—'
              }
              icon={Clock}
            />
            <KpiCard
              label="Submission"
              value={formatPercentage(summary.submission_pct, 0)}
              deltaContext={`${summary.days_logged} of ${summary.days_present} present days logged`}
              icon={CheckCircle2}
            />
            <KpiCard
              label="Open exceptions"
              value={
                <span className={summary.open_exceptions > 0 ? 'text-warning-fg' : 'text-fg'}>
                  {summary.open_exceptions}
                </span>
              }
              deltaContext="in this range"
              icon={Info}
              onClick={onNavigateExceptions}
            />
          </div>

          {departmentCards.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {departmentCards.map((dept) => {
                const isSelected = selectedDept.toLowerCase() === dept.department.toLowerCase();
                return (
                  <div
                    key={dept.department}
                    onClick={() => setSelectedDept(isSelected ? 'all' : dept.department)}
                    className={cn(
                      'p-3.5 bg-surface border rounded-xl shadow-xs cursor-pointer transition-all flex flex-col justify-between',
                      isSelected
                        ? 'border-accent ring-1 ring-accent bg-accent-bg/10'
                        : 'border-border hover:border-border-strong hover:bg-hover'
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-fg truncate">
                          {dept.department}
                        </span>
                      </div>
                      <span className="text-[11px] text-fg-muted">
                        {dept.people} people · {dept.days_present} present days
                      </span>
                    </div>

                    <div className="my-2.5">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-xl font-bold text-fg">
                          {formatPercentage(dept.coverage_pct, 0)}
                        </span>
                        <span className="text-[11px] text-fg-muted">
                          {formatMinutes(dept.avg_logged_per_day)} logged/day
                        </span>
                      </div>
                      <Progress value={dept.coverage_pct ?? 0} className="h-1.5" />
                    </div>

                    <div className="text-[10px] text-fg-muted truncate">
                      {formatMinutes(dept.logged)} of {formatMinutes(dept.worked)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 6. Employee Table — one row per person for the range */}
          <div>
            <h2 className="text-sm font-semibold text-fg mb-2">People</h2>
            <p className="text-xs text-fg-muted mb-3">
              One row per employee. Click a row for that person's day-by-day breakdown.
            </p>
          </div>
          <TableCard>
            {/* Table Toolbar */}
            <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-64">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-fg-muted" />
                  <input
                    type="text"
                    placeholder="Search employee..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-canvas border border-border rounded-md text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQuickFilter('all')}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors',
                      quickFilter === 'all'
                        ? 'bg-muted-bg text-fg font-semibold border border-border'
                        : 'text-fg-muted hover:text-fg hover:bg-hover'
                    )}
                  >
                    All {allRows.length}
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickFilter('under_target')}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors',
                      quickFilter === 'under_target'
                        ? 'bg-warning-bg text-warning-fg font-semibold border border-warning-bd'
                        : 'text-fg-muted hover:text-fg hover:bg-hover'
                    )}
                  >
                    Under target {underTargetCount}
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickFilter('missing')}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors',
                      quickFilter === 'missing'
                        ? 'bg-danger-bg text-danger-fg font-semibold border border-danger-bd'
                        : 'text-fg-muted hover:text-fg hover:bg-hover'
                    )}
                  >
                    Missing logs {missingCount}
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickFilter('over_logged')}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors',
                      quickFilter === 'over_logged'
                        ? 'bg-info-bg text-info-fg font-semibold border border-info-bd'
                        : 'text-fg-muted hover:text-fg hover:bg-hover'
                    )}
                  >
                    Over-logged {overLoggedCount}
                  </button>

                  {inactiveCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuickFilter('inactive')}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors',
                        quickFilter === 'inactive'
                          ? 'bg-muted-bg text-fg font-semibold border border-border'
                          : 'text-fg-muted hover:text-fg hover:bg-hover'
                      )}
                    >
                      Inactive {inactiveCount}
                    </button>
                  )}
                </div>
              </div>

              <span className="text-xs text-fg-muted">
                Sorted by {SORT_LABELS[sortField]} ({sortDir === 'desc' ? 'high to low' : 'low to high'})
              </span>
            </div>

            <Table containerClassName="overflow-x-hidden" className="w-full table-fixed">
              <THead>
                <tr>
                  <TH className="w-[22%]">
                    <SortHeader
                      label="Employee"
                      direction={sortField === 'name' ? sortDir : null}
                      onSort={() => handleSort('name')}
                    />
                  </TH>
                  <TH align="right">
                    <SortHeader
                      label="Present"
                      align="right"
                      direction={sortField === 'days_present' ? sortDir : null}
                      onSort={() => handleSort('days_present')}
                    />
                  </TH>
                  <TH align="right">
                    <SortHeader
                      label="Worked"
                      align="right"
                      direction={sortField === 'worked' ? sortDir : null}
                      onSort={() => handleSort('worked')}
                    />
                  </TH>
                  <TH align="right">
                    <SortHeader
                      label="Logged"
                      align="right"
                      direction={sortField === 'logged' ? sortDir : null}
                      onSort={() => handleSort('logged')}
                    />
                  </TH>
                  <TH align="right">
                    <SortHeader
                      label="Variance"
                      align="right"
                      direction={sortField === 'variance' ? sortDir : null}
                      onSort={() => handleSort('variance')}
                    />
                  </TH>
                  <TH align="right">
                    <SortHeader
                      label="Coverage"
                      align="right"
                      direction={sortField === 'coverage_pct' ? sortDir : null}
                      onSort={() => handleSort('coverage_pct')}
                    />
                  </TH>
                  <TH align="right">
                    <SortHeader
                      label="Avg log"
                      align="right"
                      direction={sortField === 'avg_logged_per_day' ? sortDir : null}
                      onSort={() => handleSort('avg_logged_per_day')}
                    />
                  </TH>
                  <TH align="right">
                    <SortHeader
                      label="Avg work"
                      align="right"
                      direction={sortField === 'avg_worked_per_day' ? sortDir : null}
                      onSort={() => handleSort('avg_worked_per_day')}
                    />
                  </TH>
                  <TH align="right">
                    <SortHeader
                      label="No log"
                      align="right"
                      direction={sortField === 'days_missing' ? sortDir : null}
                      onSort={() => handleSort('days_missing')}
                    />
                  </TH>
                  <TH align="right">
                    <SortHeader
                      label="Under"
                      align="right"
                      direction={sortField === 'days_under_target' ? sortDir : null}
                      onSort={() => handleSort('days_under_target')}
                    />
                  </TH>
                  <TH className="w-[14%]">Flags</TH>
                </tr>
              </THead>
              <TBody>
                {sortedRows.length === 0 ? (
                  <TableEmpty
                    colSpan={11}
                    title="No employees found"
                    description="No employees found matching filter criteria."
                  />
                ) : (
                  sortedRows.map((row) => {
                    const rowTone = getVarianceTone(row.variance, row.days_present);
                    const { primary, secondaries } = rowDeptParts(row);
                    const deptLabel = [primary, ...secondaries].filter(Boolean).join(' · ') || 'General';
                    return (
                      <TR
                        key={row.user_id}
                        clickable
                        className="h-auto"
                        onClick={() => setDrawerMember(row)}
                      >
                        <TD className="align-middle py-2 min-w-0">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar name={row.name} src={row.avatar || undefined} size={24} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 font-medium text-fg">
                                <span className="truncate">{row.name}</span>
                                {row.inactive && (
                                  <Badge variant="outline">Inactive</Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-fg-muted truncate block">
                                {getRoleDisplayName(row.role)} · {deptLabel}
                              </span>
                            </div>
                          </div>
                        </TD>
                        <TD numeric className="align-middle py-2">{row.days_present}</TD>
                        <TD numeric className="align-middle py-2">{formatMinutes(row.worked)}</TD>
                        <TD numeric className="align-middle py-2">{formatMinutes(row.logged)}</TD>
                        <TD numeric className="align-middle py-2">
                          <span className={getToneTextClass(rowTone)}>
                            {formatSignedMinutes(row.variance)}
                          </span>
                        </TD>
                        <TD numeric className="align-middle py-2">
                          <span className={getToneTextClass(getCoverageTone(row.coverage_pct))}>
                            {formatPercentage(row.coverage_pct, 0)}
                          </span>
                        </TD>
                        <TD numeric className="align-middle py-2 text-fg-muted">
                          {formatMinutes(row.avg_logged_per_day)}
                        </TD>
                        <TD numeric className="align-middle py-2 text-fg-muted">
                          {formatMinutes(row.avg_worked_per_day)}
                        </TD>
                        <TD numeric className="align-middle py-2">
                          <span className={cn(row.days_missing > 0 ? 'text-danger-fg font-semibold' : 'text-fg-muted')}>
                            {row.days_missing}
                          </span>
                        </TD>
                        <TD numeric className="align-middle py-2">
                          <span className={cn(row.days_under_target > 0 ? 'text-warning-fg font-semibold' : 'text-fg-muted')}>
                            {row.days_under_target}
                          </span>
                        </TD>
                        <TD className="align-middle py-2 min-w-0">
                          {renderRowFlags(row)}
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>

              <tfoot className="bg-canvas border-t-2 border-border font-semibold text-fg">
                <tr className="h-12">
                  <TD className="align-middle font-semibold min-w-0">
                    Team total · {scopedRows.length} people
                    {summary.open_exceptions > 0 ? (
                      <span className="ml-2 text-xs font-medium text-fg-muted">
                        · {summary.open_exceptions} open
                      </span>
                    ) : null}
                  </TD>
                  <TD numeric className="align-middle py-2">{summary.days_present}</TD>
                  <TD numeric className="align-middle py-2">{formatMinutes(summary.worked)}</TD>
                  <TD numeric className="align-middle py-2">{formatMinutes(summary.logged)}</TD>
                  <TD numeric className="align-middle py-2">
                    <span className={getToneTextClass(getVarianceTone(summary.variance, summary.days_present))}>
                      {formatSignedMinutes(summary.variance)}
                    </span>
                  </TD>
                  <TD numeric className="align-middle py-2">
                    <span className={getToneTextClass(getCoverageTone(summary.coverage_pct))}>
                      {formatPercentage(summary.coverage_pct, 0)}
                    </span>
                  </TD>
                  <TD numeric className="align-middle py-2">{formatMinutes(summary.avg_logged_per_day)}</TD>
                  <TD numeric className="align-middle py-2">{formatMinutes(summary.avg_worked_per_day)}</TD>
                  <TD numeric className="align-middle py-2">{summary.days_missing}</TD>
                  <TD numeric className="align-middle py-2">{summary.days_under_target}</TD>
                  <TD className="align-middle py-2 text-fg-muted font-medium">—</TD>
                </tr>
              </tfoot>
            </Table>
          </TableCard>
        </>
      )}

      {/* Drill-down Drawer */}
      <EmployeeComplianceDrawer
        isOpen={Boolean(drawerMember)}
        onClose={() => setDrawerMember(null)}
        member={drawerMember}
        startDate={startDate}
        endDate={endDate}
        rangeLabel={rangeSubtitle}
        onSendReminder={onSendReminder}
        isSendingReminder={
          typeof isSendingReminder === 'boolean'
            ? isSendingReminder
            : Boolean(drawerMember && isSendingReminder?.[drawerMember.user_id])
        }
        canRemind={Boolean(onSendReminder)}
      />

      </div>

      {/* Formulas Explanatory Sheet */}
      <LogVarianceFormulasPopover
        open={isFormulasOpen}
        onOpenChange={setIsFormulasOpen}
        thresholds={data?.thresholds}
      />

    </div>
  );
};

function renderRowFlags(row: EmployeeRow) {
  const flagSet = new Set((row.flags || []).filter((f) => FLAG_META.some((m) => m.key === f)));
  const pills = FLAG_META.filter((m) => flagSet.has(m.key));
  if (pills.length === 0) {
    return <span className="text-fg-muted">—</span>;
  }
  const label = pills.map((m) => m.label).join(' · ');
  return (
    <span
      title={label}
      className={cn(
        'inline-flex max-w-full items-center px-1.5 py-0.5 rounded text-[10px] font-medium border truncate',
        pills[0].className
      )}
    >
      {label}
    </span>
  );
}
