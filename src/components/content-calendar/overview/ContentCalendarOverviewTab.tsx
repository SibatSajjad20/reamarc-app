import React, { useMemo, useState } from 'react';
import { RefreshCw, ChevronRight, LayoutDashboard, Film, Layers, Play, Sparkles, Image as ImageIcon, FileText } from 'lucide-react';
import type { ContentCalendarItem, ContentCalendarViewMode } from '../../../types/contentCalendar';
import type { ContentExpectations } from '../../../types';
import {
  DIMENSIONS,
  PERIOD_LABELS,
  STAGE_BUCKETS,
  buildOverviewMatrix,
  calculateOverviewKpis,
  clientPlanRows,
  expectedByType,
  needsAttention,
  nextSevenDays,
  periodRange,
  planTotals,
  singleMonthOf,
  workloadByAssignee,
  inRange,
  ymd,
  normalizeDimension,
  type ClientPlanTypeRow,
  type DateRange,
  type OverviewDimension,
  type OverviewDrill,
  type OverviewPeriod,
  type PlanStatus,
  type StageBucket,
} from '../../../utils/contentCalendarOverviewMatrix';
import { itemBelongsToClient } from '../../../utils/contentCalendarExpectations';
import { StatusPill } from '../../ui/StatusPill';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';
import { GenerateReportButton } from '../report/GenerateReportButton';

interface Props {
  items: ContentCalendarItem[];
  activeClients: Array<{ id: string; name: string; content_expectations?: ContentExpectations | null }>;
  isLoading: boolean;
  activeClientFilter: string;
  onSelectClientFilter: (clientName: string) => void;
  onSwitchViewMode: (mode: ContentCalendarViewMode) => void;
  onSelectItem: (item: ContentCalendarItem) => void;
  onRefresh: () => void;
  onAddContent?: () => void;
  /** Open the sheet filtered to one matrix cell. */
  onDrill?: (drill: OverviewDrill) => void;
  /** Open the sheet with the Overdue quick filter. */
  onShowOverdue?: () => void;
  now?: Date;
}

const PERIODS: OverviewPeriod[] = ['all', 'this_month', 'last_month', 'last_30', 'next_30', 'custom'];
const STORAGE_KEY = 'reamarc_cc_overview_period';
const DIMENSION_KEY = 'reamarc_cc_overview_dimension';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shortDate(d?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m ? `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]}` : '';
}

function longMonth(month: string): string {
  const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${full[parseInt(month.slice(5, 7), 10) - 1]} ${month.slice(0, 4)}`;
}

const STATUS_PILL: Record<PlanStatus, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  met: { label: 'Met', variant: 'success' },
  on_track: { label: 'On track', variant: 'warning' },
  at_risk: { label: 'At risk', variant: 'danger' },
};

function PlanPill({ status }: { status: PlanStatus | null }) {
  if (!status) return <span className="text-fg-faint">–</span>;
  return <StatusPill variant={STATUS_PILL[status].variant} label={STATUS_PILL[status].label} />;
}

const TYPE_COLORS: Record<string, string> = {
  video: 'var(--chart-1)', static: 'var(--text-2)', carousel: 'var(--chart-3)', 'animated post': 'var(--chart-4)', reel: 'var(--chart-5)',
};

function TypeBadge({ type }: { type?: string | null }) {
  const key = (type || '').toLowerCase();
  const Icon = key.includes('video') ? Film : key.includes('carousel') ? Layers : key.includes('animat') ? Play : key.includes('reel') ? Sparkles : key.includes('static') ? ImageIcon : FileText;
  const color = Object.entries(TYPE_COLORS).find(([k]) => key.includes(k))?.[1] || 'var(--text-muted)';
  return (
    <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: color }} aria-hidden="true">
      <Icon className="w-4 h-4" />
    </span>
  );
}

function initials(name: string): string {
  if (name === 'Unassigned') return '–';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

const AVATAR_COLORS = ['#6847E0', '#175CD3', '#067647', '#B54708', '#C11574', '#0E9384'];
function avatarColor(name: string): string {
  if (name === 'Unassigned') return '#6B7080';
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="w-6 h-6 rounded-full text-[10px] font-semibold text-white flex items-center justify-center shrink-0" style={{ background: avatarColor(name) }}>
      {initials(name)}
    </span>
  );
}

function Card({ title, hint, right, children, className, testId }: { title: string; hint?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <section data-testid={testId} className={cn('rounded-xl bg-surface border border-border shadow-xs p-3.5 sm:p-4 min-w-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 pb-3 mb-3 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-[15px] font-semibold text-fg m-0">{title}</h2>
          {hint ? <p className="text-xs text-fg-muted m-0 mt-0.5">{hint}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, tone, onClick, testId }: { label: string; value: React.ReactNode; sub: string; tone?: 'warning' | 'danger'; onClick?: () => void; testId?: string }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'text-left rounded-xl border p-3.5 bg-surface min-w-0',
        tone === 'warning' && 'bg-warning-bg/60 border-warning-bd',
        tone === 'danger' && 'bg-danger-bg/60 border-danger-bd',
        !tone && 'border-border',
        onClick && 'cursor-pointer hover:border-border-strong transition-colors',
      )}
    >
      <div className="text-[13px] text-fg-2">{label}</div>
      <div className="text-xl sm:text-2xl font-semibold text-fg tabular-nums mt-1">{value}</div>
      <div className="text-xs text-fg-muted mt-1">{sub}</div>
    </Comp>
  );
}

function Ring({ percent }: { percent: number }) {
  const size = 64, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const len = (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${percent}% of plan posted`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">{percent}%</span>
    </div>
  );
}

export const ContentCalendarOverviewTab: React.FC<Props> = ({
  items,
  activeClients,
  isLoading,
  activeClientFilter,
  onSelectClientFilter,
  onSwitchViewMode,
  onSelectItem,
  onRefresh,
  onAddContent,
  onDrill,
  onShowOverdue,
  now: nowProp,
}) => {
  const now = useMemo(() => nowProp || new Date(), [nowProp]);
  const [period, setPeriod] = useState<OverviewPeriod>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as OverviewPeriod | null;
      if (saved && PERIODS.includes(saved)) return saved;
    } catch {}
    return 'this_month';
  });
  const [custom, setCustom] = useState<DateRange>(() => ({
    start: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: ymd(now),
  }));
  const [dimension, setDimensionState] = useState<OverviewDimension>(() => {
    try {
      return normalizeDimension(localStorage.getItem(DIMENSION_KEY));
    } catch {
      return normalizeDimension(null);
    }
  });
  const setDimension = (d: OverviewDimension) => {
    const next = normalizeDimension(d);
    setDimensionState(next);
    try {
      localStorage.setItem(DIMENSION_KEY, next);
    } catch {}
  };
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleClient = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const changePeriod = (p: OverviewPeriod) => {
    setPeriod(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {}
  };

  const clientNames = useMemo(() => {
    const names = new Set<string>();
    for (const c of activeClients) if (c.name?.trim()) names.add(c.name.trim());
    for (const it of items) if ((it.client_name || '').trim()) names.add((it.client_name || '').trim());
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items, activeClients]);

  const selectedClient = useMemo(
    () =>
      activeClientFilter === 'all'
        ? null
        : activeClients.find((c) => c.name.replace(/\s+/g, ' ').trim().toLowerCase() === activeClientFilter.replace(/\s+/g, ' ').trim().toLowerCase()) || null,
    [activeClients, activeClientFilter],
  );
  const scopeClients = useMemo(() => (activeClientFilter === 'all' ? activeClients : selectedClient ? [selectedClient] : []), [activeClients, activeClientFilter, selectedClient]);

  const clientItems = useMemo(() => {
    if (activeClientFilter === 'all') return items;
    return items.filter((it) =>
      selectedClient ? itemBelongsToClient(it, selectedClient) : (it.client_name || '').trim() === activeClientFilter,
    );
  }, [items, activeClientFilter, selectedClient]);

  const range = useMemo(() => periodRange(period, now, custom), [period, now, custom]);
  const month = singleMonthOf(range);
  const scoped = useMemo(() => clientItems.filter((it) => inRange(it, range)), [clientItems, range]);

  const plan = useMemo(() => (month ? planTotals(items, scopeClients, month) : null), [items, scopeClients, month]);
  const kpis = useMemo(() => calculateOverviewKpis(scoped, plan, now), [scoped, plan, now]);
  const expected = useMemo(() => (month ? expectedByType(items, scopeClients, month) : null), [items, scopeClients, month]);
  const matrix = useMemo(() => buildOverviewMatrix(scoped, dimension, expected), [scoped, dimension, expected]);
  const upcoming = useMemo(() => nextSevenDays(clientItems, now), [clientItems, now]);
  const planMonth = month || ymd(now).slice(0, 7);
  const clientRows = useMemo(() => clientPlanRows(items, scopeClients, planMonth, now), [items, scopeClients, planMonth, now]);
  const attention = useMemo(() => needsAttention(clientItems, now), [clientItems, now]);
  const workload = useMemo(() => workloadByAssignee(scoped, now), [scoped, now]);

  const dimLabel = (DIMENSIONS.find((d) => d.key === dimension) || DIMENSIONS[0]).label;
  const allCollapsed = clientRows.some((r) => r.types.length) && clientRows.every((r) => !r.types.length || collapsed.has(r.id));
  const periodText = period === 'custom' && range ? `${shortDate(range.start)} – ${shortDate(range.end)}` : PERIOD_LABELS[period];
  const clientCount = activeClientFilter === 'all' ? clientNames.length : 1;

  const drill = (value: string, bucket: StageBucket | null) => {
    if (!onDrill) return;
    const bucketLabel = bucket ? STAGE_BUCKETS.find((b) => b.key === bucket)!.label : null;
    onDrill({
      dimension,
      value,
      bucket,
      range,
      label: [`${dimLabel}: ${value}`, bucketLabel, range ? periodText : null].filter(Boolean).join(' · '),
    });
  };

  const upcomingTotal = upcoming.reduce((s, d) => s + d.count, 0);
  const maxActive = Math.max(1, ...workload.map((w) => w.active));
  const nativeSelect =
    'h-11 sm:h-8 rounded-md border border-border-strong bg-surface text-base sm:text-sm text-fg px-2.5 focus:border-accent focus:outline-hidden';

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto bg-canvas p-3 sm:p-4 space-y-3" data-testid="cc-overview">
      {/* Header */}
      <div className="rounded-xl bg-surface border border-border p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg m-0">Overview</h2>
            <p className="text-xs text-fg-muted m-0 mt-0.5">
              Content calendar · {clientCount} {clientCount === 1 ? 'client' : 'clients'} · {periodText}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GenerateReportButton mode="staff" variant="primary" size="md" defaultWorkspaceId={selectedClient?.id || null} />
            <Button variant="secondary" size="md" className="min-h-[44px] sm:min-h-0" onClick={onRefresh} disabled={isLoading} title="Refresh">
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Client"
            className={cn(nativeSelect, 'w-full sm:w-56')}
            value={activeClientFilter}
            onChange={(e) => onSelectClientFilter(e.target.value)}
          >
            <option value="all">All clients (portfolio)</option>
            {clientNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center bg-subtle border border-border rounded-lg p-0.5" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => changePeriod(p)}
                className={cn(
                  'px-2.5 min-h-[40px] sm:min-h-0 sm:py-1 rounded-md text-sm sm:text-xs font-medium cursor-pointer transition',
                  period === p ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg',
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input type="date" aria-label="From" className={cn(nativeSelect, 'flex-1')} value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} />
              <span className="text-xs text-fg-muted">to</span>
              <input type="date" aria-label="To" className={cn(nativeSelect, 'flex-1')} value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} />
            </div>
          )}
        </div>
      </div>

      {items.length === 0 && !isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-xl bg-surface border border-dashed border-border text-center min-h-[320px]">
          <div className="w-12 h-12 rounded-xl bg-accent-soft text-accent flex items-center justify-center mb-3">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-fg mb-1">No campaigns yet</h3>
          <p className="text-xs text-fg-muted max-w-sm mb-4">Create or import campaigns to see where work sits, plan progress and workload.</p>
          {onAddContent && (
            <Button variant="primary" size="md" onClick={onAddContent}>
              Add content
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr] gap-2.5" data-testid="cc-overview-kpis">
            <div className="col-span-2 lg:col-span-1 rounded-xl border border-border bg-surface p-3.5 flex items-center gap-3.5">
              {kpis.planned != null && kpis.percent != null ? (
                <>
                  <Ring percent={kpis.percent} />
                  <div>
                    <div className="text-[13px] text-fg-2">Posted vs plan</div>
                    <div className="tabular-nums mt-0.5">
                      <span className="text-2xl font-semibold">{kpis.delivered}</span>
                      <span className="text-base text-fg-muted"> of {kpis.planned}</span>
                    </div>
                    <div className="text-xs text-fg-muted mt-0.5">
                      {kpis.left ? `${kpis.left} left ${period === 'this_month' ? 'this month' : 'in ' + longMonth(month!)}` : 'Plan delivered'}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="text-[13px] text-fg-2">Posted</div>
                  <div className="tabular-nums mt-0.5">
                    <span className="text-2xl font-semibold">{kpis.posted}</span>
                    <span className="text-base text-fg-muted"> of {kpis.total}</span>
                  </div>
                  <div className="text-xs text-fg-muted mt-0.5">{month ? 'No monthly plan set' : 'Plan shows for a single month'}</div>
                </div>
              )}
            </div>
            <Kpi
              testId="kpi-awaiting"
              label="Awaiting client"
              value={kpis.awaitingClient}
              sub={kpis.oldestWaitDays != null ? `Oldest waiting ${kpis.oldestWaitDays} ${kpis.oldestWaitDays === 1 ? 'day' : 'days'}` : 'Nothing waiting'}
              tone={kpis.awaitingClient ? 'warning' : undefined}
            />
            <Kpi label="In revision" value={kpis.inRevision} sub="Changes requested" />
            <Kpi
              testId="kpi-overdue"
              label="Overdue"
              value={kpis.overdue}
              sub="Past publish or design date"
              tone={kpis.overdue ? 'danger' : undefined}
              onClick={kpis.overdue && onShowOverdue ? onShowOverdue : undefined}
            />
            <Kpi label="Ready to post" value={kpis.ready} sub="Approved and queued" />
            <Kpi label="In production" value={kpis.inProduction} sub="Content + creative work" />
          </div>

          {/* Matrix */}
          <Card
            testId="cc-overview-matrix"
            title="Where work sits, by category"
            hint={`Counts by ${dimLabel.toLowerCase()} and stage · click a cell to filter the sheet`}
            right={
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Group by">
                {DIMENSIONS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={dimension === d.key}
                    onClick={() => setDimension(d.key)}
                    className={cn(
                      'px-2.5 min-h-[36px] sm:min-h-0 sm:py-1 rounded-full border text-sm sm:text-xs font-medium cursor-pointer transition',
                      dimension === d.key ? 'bg-accent-soft-2 border-accent-200 text-accent-text' : 'bg-subtle border-border text-fg-2 hover:text-fg',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            }
          >
            {matrix.totals.total === 0 && matrix.rows.length === 0 ? (
              <p className="text-sm text-fg-muted m-0">Nothing in this period.</p>
            ) : (
              <>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-subtle" role="img" aria-label="Items by stage">
                  {matrix.columns.map((k) => {
                    const b = STAGE_BUCKETS.find((x) => x.key === k)!;
                    return <span key={k} style={{ flexGrow: matrix.totals.counts[k], flexBasis: 0, background: b.color }} title={`${b.label} ${matrix.totals.counts[k]}`} />;
                  })}
                </div>
                <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2 mb-3 text-xs text-fg-2">
                  {matrix.columns.map((k) => {
                    const b = STAGE_BUCKETS.find((x) => x.key === k)!;
                    return (
                      <span key={k} className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm" style={{ background: b.color }} />
                        {b.label} <span className="tabular-nums">{matrix.totals.counts[k]}</span>
                      </span>
                    );
                  })}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm border-collapse" data-testid="cc-overview-matrix-table">
                    <thead>
                      <tr className="text-xs text-fg-muted">
                        <th className="text-left font-medium py-2 px-2">{dimLabel}</th>
                        {matrix.columns.map((k) => (
                          <th key={k} className="text-right font-medium py-2 px-2">{STAGE_BUCKETS.find((b) => b.key === k)!.label}</th>
                        ))}
                        <th className="text-right font-medium py-2 px-2">Total</th>
                        {matrix.hasExpected && <th className="text-right font-medium py-2 px-2">Expected</th>}
                        <th className="text-right font-medium py-2 px-2">% posted</th>
                        {matrix.hasExpected && <th className="text-right font-medium py-2 px-2">Status</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.rows.map((r) => (
                        <tr key={r.value} className="border-t border-border">
                          <td className="py-2 px-2 font-medium text-fg">
                            <button type="button" className="cursor-pointer hover:underline text-left" onClick={() => drill(r.value, null)} title={`Show all ${r.value} in the sheet`}>
                              {r.value}
                            </button>
                          </td>
                          {matrix.columns.map((k) => {
                            const n = r.counts[k];
                            return (
                              <td key={k} className="py-1 px-1 text-right">
                                {n > 0 ? (
                                  <button
                                    type="button"
                                    data-testid={`cell-${r.value}-${k}`}
                                    onClick={() => drill(r.value, k)}
                                    className="w-full text-right tabular-nums rounded-md px-1.5 py-1 cursor-pointer hover:bg-accent-soft hover:text-accent-text"
                                    title={`${r.value} · ${STAGE_BUCKETS.find((b) => b.key === k)!.label}: open in sheet`}
                                  >
                                    {n}
                                  </button>
                                ) : (
                                  <span className="text-fg-faint px-1.5">·</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2 px-2 text-right tabular-nums">{r.total}</td>
                          {matrix.hasExpected && <td className="py-2 px-2 text-right tabular-nums">{r.expected ?? '–'}</td>}
                          <td className="py-2 px-2 text-right tabular-nums">{r.total || r.expected ? `${r.pct}%` : '–'}</td>
                          {matrix.hasExpected && (
                            <td className="py-2 px-2 text-right">
                              <PlanPill status={r.status} />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border-strong bg-subtle font-semibold">
                        <td className="py-2 px-2">Total</td>
                        {matrix.columns.map((k) => (
                          <td key={k} className="py-2 px-2 text-right tabular-nums">{matrix.totals.counts[k]}</td>
                        ))}
                        <td className="py-2 px-2 text-right tabular-nums">{matrix.totals.total}</td>
                        {matrix.hasExpected && <td className="py-2 px-2 text-right tabular-nums">{matrix.totals.expected ?? '–'}</td>}
                        <td className="py-2 px-2 text-right tabular-nums">{matrix.totals.pct}%</td>
                        {matrix.hasExpected && (
                          <td className="py-2 px-2 text-right font-normal">
                            <PlanPill status={matrix.totals.status} />
                          </td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <ul className="md:hidden m-0 p-0 list-none space-y-2" data-testid="cc-overview-matrix-cards">
                  {matrix.rows.map((r) => {
                    const bits = matrix.columns.filter((k) => k !== 'posted' && r.counts[k] > 0);
                    return (
                      <li key={r.value} className="rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <button type="button" className="text-[15px] font-semibold text-fg text-left cursor-pointer min-h-[44px]" onClick={() => drill(r.value, null)}>
                            {r.value}
                          </button>
                          <PlanPill status={r.status} />
                        </div>
                        <div className="text-sm text-fg-2 tabular-nums">
                          {r.expected != null ? `Posted ${r.posted} of ${r.expected} expected · ${r.pct}%` : `Posted ${r.posted} of ${r.total} · ${r.pct}%`}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {bits.length === 0 ? (
                            <span className="text-xs text-fg-muted">None in progress</span>
                          ) : (
                            bits.map((k) => (
                              <button
                                key={k}
                                type="button"
                                onClick={() => drill(r.value, k)}
                                className="min-h-[36px] px-2.5 rounded-full bg-subtle border border-border text-xs text-fg-2 cursor-pointer"
                              >
                                {STAGE_BUCKETS.find((b) => b.key === k)!.label} {r.counts[k]}
                              </button>
                            ))
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-fg-muted mt-3 mb-0">
                  {matrix.hasExpected
                    ? 'Expected is the monthly plan by creative type. Other categories show posted share of the total.'
                    : dimension === 'creative_type'
                      ? 'Expected shows when the period is a single month and the client has a plan.'
                      : 'Shows posted share of the total.'}{' '}
                  {dimension === 'channel' ? 'An item posted to several channels counts once per channel; the total counts it once. ' : ''}
                  Empty stage columns are hidden.
                </p>
              </>
            )}
          </Card>

          {/* Next 7 days */}
          <Card
            testId="cc-overview-upcoming"
            title="Publishing in the next 7 days"
            hint={`Not-yet-posted items with a publish date · ${shortDate(upcoming[0].date)}–${shortDate(upcoming[6].date)}`}
            right={<span className="text-xs text-fg-muted">{upcomingTotal} items scheduled</span>}
          >
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {upcoming.map((d) => {
                const [y, m, day] = d.date.split('-').map((v) => parseInt(v, 10));
                const dow = WEEKDAYS[new Date(y, m - 1, day).getDay()];
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => onSwitchViewMode('calendar')}
                    className={cn(
                      'rounded-lg border p-2 text-center cursor-pointer min-h-[56px]',
                      d.isToday ? 'border-accent bg-accent-soft' : 'border-border bg-subtle hover:border-border-strong',
                    )}
                  >
                    <div className="text-xs text-fg-2">
                      {dow} {day}
                      {d.isToday ? <span className="hidden sm:inline"> · today</span> : null}
                    </div>
                    <div className="text-lg font-semibold tabular-nums">{d.count}</div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Plan progress by client */}
          <Card
            testId="cc-overview-clients"
            title="Plan progress by client"
            hint={`Monthly expectations vs posted · ${longMonth(planMonth)} · broken down by creative type where a plan is set`}
            right={
              clientRows.some((r) => r.types.length > 0) ? (
                <button
                  type="button"
                  data-testid="cc-plan-toggle-all"
                  className="text-xs font-medium text-accent-text hover:underline cursor-pointer min-h-[36px] sm:min-h-0"
                  onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(clientRows.filter((r) => r.types.length).map((r) => r.id)))}
                >
                  {allCollapsed ? 'Show creative types' : 'Hide creative types'}
                </button>
              ) : null
            }
          >
            {clientRows.length === 0 ? (
              <p className="text-sm text-fg-muted m-0">No client plans or items for {longMonth(planMonth)}.</p>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm border-collapse" data-testid="cc-plan-table">
                    <thead>
                      <tr className="text-xs text-fg-muted">
                        <th className="text-left font-medium py-2 px-2">Client / creative type</th>
                        <th className="text-right font-medium py-2 px-2">Expected</th>
                        <th className="text-right font-medium py-2 px-2">Posted</th>
                        <th className="text-right font-medium py-2 px-2">In progress</th>
                        <th className="text-right font-medium py-2 px-2">Gap</th>
                        <th className="text-right font-medium py-2 px-2">% posted</th>
                        <th className="text-left font-medium py-2 px-2 pl-4">Status</th>
                        <th className="text-left font-medium py-2 px-2">Needs attention</th>
                      </tr>
                    </thead>
                    {clientRows.map((r) => {
                      const open = r.types.length > 0 && !collapsed.has(r.id);
                      return (
                        <tbody key={r.id} data-testid={`cc-plan-client-${r.id}`} className="border-t border-border">
                          <tr>
                            <td className="py-2 px-2">
                              <span className="inline-flex items-center gap-1">
                                {r.types.length > 0 ? (
                                  <button
                                    type="button"
                                    aria-expanded={open}
                                    aria-label={`${open ? 'Hide' : 'Show'} creative types for ${r.name}`}
                                    className="w-6 h-6 rounded-md flex items-center justify-center text-fg-muted hover:bg-hover cursor-pointer"
                                    onClick={() => toggleClient(r.id)}
                                  >
                                    <ChevronRight className={cn('w-4 h-4 transition-transform', open && 'rotate-90')} />
                                  </button>
                                ) : (
                                  <span className="w-6" aria-hidden="true" />
                                )}
                                <button type="button" className="inline-flex items-center gap-2 font-medium cursor-pointer hover:underline" onClick={() => onSelectClientFilter(r.name)}>
                                  <Avatar name={r.name} />
                                  {r.name}
                                </button>
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right tabular-nums font-medium">{r.expected ?? '–'}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-medium">{r.posted}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{r.inProgress}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{r.gap ?? '–'}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{r.pct != null ? `${r.pct}%` : '–'}</td>
                            <td className="py-2 px-2 pl-4">{r.expected != null ? <PlanPill status={r.status} /> : <span className="text-xs text-fg-muted">No plan</span>}</td>
                            <td className="py-2 px-2 text-fg-muted text-xs">{attentionNote(r)}</td>
                          </tr>
                          {open &&
                            r.types.map((t) => (
                              <tr key={t.key} className="text-[13px] text-fg-2 bg-subtle/60" data-testid={`cc-plan-type-${r.id}-${t.key}`}>
                                <td className="py-1.5 px-2 pl-[62px]">
                                  <span className="inline-flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: typeDot(t.key) }} aria-hidden="true" />
                                    {t.type}
                                    {t.layout ? <span className="text-xs text-fg-muted">{t.layout}</span> : null}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-right tabular-nums">{typeExpected(t)}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums">{t.posted}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums">{t.inProgress}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums">{t.gap ?? '–'}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums">{t.pct != null ? `${t.pct}%` : '–'}</td>
                                <td className="py-1.5 px-2 pl-4"><TypeStatus t={t} /></td>
                                <td className="py-1.5 px-2 text-xs text-fg-muted">{typeNote(t)}</td>
                              </tr>
                            ))}
                        </tbody>
                      );
                    })}
                  </table>
                </div>
                <ul className="md:hidden m-0 p-0 list-none space-y-2" data-testid="cc-plan-cards">
                  {clientRows.map((r) => {
                    const open = r.types.length > 0 && !collapsed.has(r.id);
                    return (
                      <li key={r.id} className="rounded-xl border border-border p-3">
                        <button type="button" className="w-full text-left cursor-pointer" onClick={() => onSelectClientFilter(r.name)}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2 font-semibold min-w-0"><Avatar name={r.name} /><span className="truncate">{r.name}</span></span>
                            {r.expected != null ? <PlanPill status={r.status} /> : <span className="text-xs text-fg-muted shrink-0">No plan</span>}
                          </div>
                          <div className="text-sm text-fg-2 tabular-nums mt-1.5">
                            {r.expected != null
                              ? `Posted ${r.posted} of ${r.expected} · ${r.inProgress} in progress · gap ${r.gap} · ${r.pct}%`
                              : `Posted ${r.posted} · ${r.inProgress} in progress`}
                          </div>
                          <div className="text-xs text-fg-muted mt-1">{attentionNote(r)}</div>
                        </button>
                        {r.types.length > 0 && (
                          <>
                            <button
                              type="button"
                              aria-expanded={open}
                              onClick={() => toggleClient(r.id)}
                              className="mt-2 min-h-[36px] inline-flex items-center gap-1 text-xs font-medium text-accent-text cursor-pointer"
                            >
                              <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-90')} />
                              {open ? 'Hide' : 'Show'} {r.types.length} creative {r.types.length === 1 ? 'type' : 'types'}
                            </button>
                            {open && (
                              <ul className="m-0 mt-1 p-0 list-none divide-y divide-border rounded-lg bg-subtle border border-border" data-testid={`cc-plan-types-${r.id}`}>
                                {r.types.map((t) => {
                                  const bar = t.expected ? Math.min(100, Math.round((t.posted / t.expected) * 100)) : 0;
                                  return (
                                    <li key={t.key} className="px-2.5 py-2">
                                      <div className="flex items-center justify-between gap-2 text-[13px]">
                                        <span className="inline-flex items-center gap-1.5 font-medium text-fg min-w-0">
                                          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: typeDot(t.key) }} aria-hidden="true" />
                                          <span className="truncate">{t.type}</span>
                                        </span>
                                        <span className="tabular-nums text-fg-2 shrink-0">
                                          {t.expected != null ? `${t.posted} / ${typeExpected(t)}` : t.posted}
                                          {t.pct != null ? ` · ${t.pct}%` : ''}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2 mt-1">
                                        <span className="text-xs text-fg-muted tabular-nums">
                                          {t.inProgress} in progress{t.gap != null ? ` · gap ${t.gap}` : ''}
                                        </span>
                                        <TypeStatus t={t} />
                                      </div>
                                      {t.expected ? (
                                        <div className="h-1 rounded-full bg-surface mt-1.5 overflow-hidden">
                                          <span className="block h-full rounded-full" style={{ width: `${bar}%`, background: typeDot(t.key) }} />
                                        </div>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-fg-muted mt-3 mb-0">
                  Creative types come from each client's monthly plan. Paused types don't count this month; types outside the plan are listed as not in plan and don't count toward it.
                </p>
              </>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            {/* Needs attention */}
            <Card testId="cc-overview-attention" title="Needs attention" hint={`As of ${shortDate(ymd(now))} · waiting time counts from the item's last update`}>
              {attention.length === 0 ? (
                <p className="text-sm text-fg-muted m-0">Nothing overdue or waiting.</p>
              ) : (
                <ul className="m-0 p-0 list-none divide-y divide-border">
                  {attention.map((a) => {
                    const it = a.item;
                    const dateBit =
                      a.kind === 'overdue' && it.stage !== 'Ready to Post' && it.design_due
                        ? `design due ${shortDate(it.design_due)}`
                        : it.publish_date
                          ? `publishes ${shortDate(it.publish_date)}`
                          : '';
                    const pill =
                      a.kind === 'overdue'
                        ? { v: 'danger' as const, t: `Overdue ${a.days} ${a.days === 1 ? 'day' : 'days'}` }
                        : a.kind === 'awaiting'
                          ? { v: 'warning' as const, t: `Waiting ${a.days} ${a.days === 1 ? 'day' : 'days'}` }
                          : { v: 'danger' as const, t: `In revision · ${a.days === 0 ? 'today' : `in ${a.days} ${a.days === 1 ? 'day' : 'days'}`}` };
                    return (
                      <li key={it.id}>
                        <button type="button" onClick={() => onSelectItem(it)} className="w-full text-left flex items-start gap-3 py-2.5 cursor-pointer hover:bg-hover rounded-md px-1">
                          <TypeBadge type={it.creative_type} />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-fg truncate">{it.content_concept || it.serial}</span>
                            <span className="block text-xs text-fg-muted truncate">
                              {[it.client_name, it.creative_type, it.stage, dateBit].filter(Boolean).join(' · ')}
                            </span>
                            <StatusPill className="mt-1" variant={pill.v} label={pill.t} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Workload */}
            <Card testId="cc-overview-workload" title="Workload by assignee" hint={`Active items ${periodText.toLowerCase()}, not yet posted`}>
              {workload.length === 0 ? (
                <p className="text-sm text-fg-muted m-0">No active work.</p>
              ) : (
                <ul className="m-0 p-0 list-none space-y-2">
                  {workload.map((w) => (
                    <li key={w.name} className="rounded-lg bg-subtle border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-sm font-medium"><Avatar name={w.name} />{w.name}</span>
                        <span className="text-sm font-semibold tabular-nums">{w.active} active</span>
                      </div>
                      <div className="text-xs text-fg-muted mt-1">
                        {w.inRevision} in revision · {w.overdue} overdue · {w.posted} posted
                      </div>
                      <div className="h-1.5 rounded-full bg-surface mt-2 overflow-hidden">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((w.active / maxActive) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

function typeDot(key: string): string {
  return TYPE_COLORS[key] || (key === 'cover image' ? 'var(--chart-2)' : 'var(--text-muted)');
}

function typeExpected(t: ClientPlanTypeRow): string {
  if (t.paused) return 'Paused';
  if (t.expected == null) return '–';
  return t.expectedMax != null && t.expectedMax > t.expected ? `${t.expected}–${t.expectedMax}` : String(t.expected);
}

function TypeStatus({ t }: { t: ClientPlanTypeRow }) {
  if (t.paused) return <span className="text-xs text-fg-muted">Paused this month</span>;
  if (t.unplanned) return <span className="text-xs text-fg-muted">Not in plan</span>;
  if (t.expected == null) return <span className="text-xs text-fg-muted">Included</span>;
  return <PlanPill status={t.status} />;
}

function typeNote(t: ClientPlanTypeRow): string {
  if (t.expected == null || t.paused) return '';
  const short = t.expected - t.posted - t.inProgress;
  if (short > 0) return `${short} more to create`;
  if (t.expectedMax != null && t.posted > t.expectedMax) return `${t.posted - t.expectedMax} over max`;
  return '';
}

function attentionNote(r: { awaiting: number; overdue: number; typesShort: number }): string {
  const bits = [
    r.awaiting ? `${r.awaiting} awaiting review` : null,
    r.overdue ? `${r.overdue} overdue` : null,
    r.typesShort ? `${r.typesShort} ${r.typesShort === 1 ? 'type' : 'types'} short of plan` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'Nothing pending';
}
