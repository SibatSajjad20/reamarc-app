import React from 'react';
import { Image as ImageIcon, Play, Layers, Film, Sparkles, FileText } from 'lucide-react';
import type { ContentCalendarReport, ReportCount, ReportItemCard } from '../../../types/contentCalendarReport';
import { StatusPill } from '../../ui/StatusPill';
import { cn } from '../../../lib/utils';
import {
  ROW_STATUS,
  longDate,
  monthLabel,
  reportThumbSrc,
  shortDate,
  typeColor,
} from './reportFormat';
import { ContentCalendarInternalReportView } from './ContentCalendarInternalReportView';

const BUCKET_COLORS: Record<string, string> = {
  posted: 'var(--success-dot)',
  approved_scheduled: 'var(--accent)',
  awaiting_review: 'var(--warning-dot)',
  in_revision: '#9E77ED',
  in_production: 'var(--text-muted)',
  rejected: 'var(--danger-dot)',
};

function Section({
  title,
  hint,
  children,
  className,
  testId,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cn('cc-report-section bg-surface border border-border rounded-2xl shadow-xs p-4 sm:p-5', className)}
    >
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 pb-3 mb-4 border-b border-border">
        <h2 className="text-base font-semibold text-fg tracking-tight m-0">{title}</h2>
        {hint ? <span className="text-xs text-fg-muted">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Donut({
  segments,
  size = 88,
  stroke = 12,
  center,
  label,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  stroke?: number;
  center: React.ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth={stroke} />
        {total > 0 &&
          segments.map((seg, i) => {
            const len = (seg.value / total) * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
    </div>
  );
}

function Bars({ rows, color, max }: { rows: ReportCount[]; color?: (label: string) => string; max?: number }) {
  if (!rows.length) return <p className="text-sm text-fg-muted m-0">Nothing this month.</p>;
  const top = max ?? Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="m-0 p-0 list-none space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] sm:grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-3 text-sm">
          <span className="truncate text-fg-2" title={r.label}>{r.label}</span>
          <span className="h-2 rounded-full bg-subtle overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(4, (r.count / top) * 100)}%`, background: color ? color(r.label) : 'var(--accent)' }}
            />
          </span>
          <span className="text-right tabular-nums text-fg">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

const CHANNEL_COLORS: Record<string, string> = {
  instagram: 'var(--accent)',
  facebook: 'var(--chart-3)',
  linkedin: '#1D4ED8',
  tiktok: '#111827',
};

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const key = type.toLowerCase();
  const Icon = key === 'video' ? Film : key.includes('carousel') ? Layers : key.includes('animated') ? Play : key.includes('reel') ? Sparkles : key === 'static' ? ImageIcon : FileText;
  return <Icon className={className} aria-hidden="true" />;
}

function Thumb({ item, size = 48 }: { item: ReportItemCard; size?: number }) {
  const [failed, setFailed] = React.useState(false);
  const src = failed ? '' : reportThumbSrc(item.thumb);
  return (
    <div
      className="shrink-0 rounded-lg overflow-hidden flex items-center justify-center text-white"
      style={{ width: size, height: size, background: typeColor(item.creative_type) }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="eager"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <TypeIcon type={item.creative_type} className="w-5 h-5" />
      )}
    </div>
  );
}

function itemMeta(item: ReportItemCard, extra?: string): string {
  return [item.creative_type, item.channels.join(', ') || null, extra].filter(Boolean).join(' · ');
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function PublishingCalendar({ report }: { report: ContentCalendarReport }) {
  const [y, m] = report.period.month.split('-').map((v) => parseInt(v, 10));
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const byDay = new Map<number, ContentCalendarReport['calendar']>();
  for (const e of report.calendar) {
    const d = parseInt(e.date.slice(8, 10), 10);
    byDay.set(d, [...(byDay.get(d) || []), e]);
  }
  const todayInMonth = report.period.today.startsWith(report.period.month)
    ? parseInt(report.period.today.slice(8, 10), 10)
    : null;
  const types = Array.from(new Set(report.calendar.map((e) => e.creative_type)));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={`Publishing calendar ${monthLabel(report.period.month)}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] font-semibold uppercase tracking-wide text-fg-muted py-1">
            <span className="sm:hidden">{w[0]}</span>
            <span className="hidden sm:inline">{w}</span>
          </div>
        ))}
        {cells.map((d, i) => {
          const entries = d ? byDay.get(d) || [] : [];
          const isToday = d != null && d === todayInMonth;
          return (
            <div
              key={i}
              className={cn(
                'min-h-[44px] sm:min-h-[56px] rounded-md sm:rounded-lg border p-1 sm:p-1.5',
                d ? 'bg-surface border-border' : 'bg-subtle border-transparent',
                isToday && 'border-accent ring-1 ring-accent',
              )}
            >
              {d ? (
                <>
                  <span
                    className={cn(
                      'text-[11px] sm:text-xs font-medium tabular-nums',
                      isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-fg' : 'text-fg',
                    )}
                  >
                    {d}
                  </span>
                  <div className="flex flex-wrap gap-0.5 sm:gap-1 mt-0.5">
                    {entries.map((e, j) => (
                      <span
                        key={j}
                        title={`${e.creative_type} · ${e.status === 'posted' ? 'Posted' : 'Approved & scheduled'}`}
                        className="w-2 h-2 rounded-full"
                        style={
                          e.status === 'posted'
                            ? { background: typeColor(e.creative_type) }
                            : { border: `1.5px solid ${typeColor(e.creative_type)}` }
                        }
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-fg-2">
        {types.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: typeColor(t) }} />
            {t}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-fg-2" />
          Posted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full border-[1.5px] border-fg-2" />
          Approved &amp; scheduled
        </span>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone?: 'warning' | 'accent';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 sm:p-4 bg-surface',
        tone === 'warning' && 'bg-warning-bg/60 border-warning-bd',
        tone === 'accent' && 'bg-accent-soft border-accent-200',
        !tone && 'border-border',
      )}
    >
      <div className="text-xs sm:text-[13px] text-fg-2">{label}</div>
      <div className="text-2xl font-semibold text-fg tabular-nums mt-1.5">{value}</div>
      <div className="text-xs text-fg-muted mt-1">{sub}</div>
    </div>
  );
}

export interface ContentCalendarReportViewProps {
  report: ContentCalendarReport;
  /** Toolbar actions shown in the header (hidden when printing). */
  headerActions?: React.ReactNode;
  /** Client portal: always render the client version, whatever the payload says. */
  clientOnly?: boolean;
}

/** Internal audience gets its own detailed staff report; everything below is the client version only. */
export const ContentCalendarReportView: React.FC<ContentCalendarReportViewProps> = (props) =>
  props.report.audience === 'internal' && !props.clientOnly ? (
    <ContentCalendarInternalReportView report={props.report} headerActions={props.headerActions} />
  ) : (
    <ClientReportView {...props} />
  );

const ClientReportView: React.FC<ContentCalendarReportViewProps> = ({ report, headerActions }) => {
  const s = report.summary;
  const month = monthLabel(report.period.month);
  const lastDay = parseInt(report.period.end.slice(8, 10), 10);
  const shortMonth = shortDate(report.period.start).split(' ')[1];
  const pipelineTotal = report.pipeline.reduce((acc, p) => acc + p.count, 0);
  const totals = report.by_type.reduce(
    (acc, r) => ({
      expected: acc.expected + (r.expected ?? 0),
      posted: acc.posted + r.posted,
      in_progress: acc.in_progress + r.in_progress,
      gap: acc.gap + r.gap,
    }),
    { expected: 0, posted: 0, in_progress: 0, gap: 0 },
  );
  const categoryColor = (l: string) => (/ad/i.test(l) ? 'var(--chart-2)' : 'var(--accent)');
  const contentTypeColor = (l: string) => (/runtime/i.test(l) ? 'var(--chart-5)' : '#1D4ED8');

  return (
    <div className="cc-report-body max-w-[1080px] mx-auto px-3 sm:px-6 pt-4 pb-12 space-y-4 sm:space-y-5 text-fg" data-testid="cc-report">
      {/* 1. Header */}
      <header className="cc-report-section bg-surface border border-border rounded-2xl shadow-xs p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {report.workspace.logo_url ? (
            <img src={report.workspace.logo_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0 border border-border" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-accent text-accent-fg flex items-center justify-center font-semibold shrink-0">
              {report.workspace.initials || report.workspace.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="m-0 text-xl sm:text-[22px] font-semibold tracking-tight truncate">{report.workspace.name}</h1>
            <p className="m-0 mt-0.5 text-[13px] text-fg-muted">Content calendar report</p>
            <p className="m-0 text-[13px] text-fg-muted">
              {month} · 1–{lastDay} {shortMonth} · Generated {longDate(report.period.today)}
            </p>
          </div>
        </div>
        <div className="sm:text-right shrink-0">
          <div className="font-semibold tracking-tight">
            <span className="text-accent">One</span>Worklane
          </div>
          <div className="text-xs text-fg-muted mt-0.5">Client report</div>
          {headerActions ? <div className="cc-report-noprint mt-2.5 flex sm:justify-end gap-2">{headerActions}</div> : null}
        </div>
      </header>

      {/* 2. Summary */}
      <div className="cc-report-section grid grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-2.5 sm:gap-3" data-testid="cc-report-summary">
        <div className="col-span-2 lg:col-span-1 rounded-xl border border-border bg-surface p-4 flex items-center gap-4">
          {s.planned > 0 ? (
            <>
              <Donut
                label={`${s.percent ?? 0}% of plan delivered`}
                segments={[
                  { value: s.delivered, color: 'var(--accent)' },
                  { value: Math.max(0, s.planned - s.delivered), color: 'var(--bg-subtle)' },
                ]}
                center={<span className="text-sm font-semibold tabular-nums">{s.percent ?? 0}%</span>}
              />
              <div>
                <div className="text-[13px] text-fg-2">Delivered vs planned</div>
                <div className="mt-1 tabular-nums">
                  <span className="text-2xl font-semibold">{s.delivered}</span>
                  <span className="text-lg text-fg-muted"> of {s.planned}</span>
                </div>
                <div className="text-xs text-fg-muted mt-1">
                  {s.left > 0 ? `${s.left} left this month` : 'Monthly plan delivered'}
                </div>
              </div>
            </>
          ) : (
            <div>
              <div className="text-[13px] text-fg-2">Posted this month</div>
              <div className="text-2xl font-semibold tabular-nums mt-1">{s.posted}</div>
              <div className="text-xs text-fg-muted mt-1">No monthly plan set for this client</div>
            </div>
          )}
        </div>
        <SummaryCard label="Approved & scheduled" value={s.approved_scheduled} sub="Ready to post" />
        <SummaryCard label="Awaiting your review" value={s.awaiting_review} sub="Action needed" tone={s.awaiting_review ? 'warning' : undefined} />
        <SummaryCard label="In revision" value={s.in_revision} sub="Changes in progress" tone={s.in_revision ? 'accent' : undefined} />
        <SummaryCard label="In production" value={s.in_production} sub="Being prepared" />
      </div>

      {/* 3. Delivered vs expected */}
      <Section
        testId="cc-report-by-type"
        title="Delivered vs expected by creative type"
        hint="Posted counts toward the monthly plan. In progress is everything not yet posted."
      >
        {report.by_type.length === 0 ? (
          <p className="text-sm text-fg-muted m-0">No content on the calendar for {month}.</p>
        ) : (
          <>
            <table className="hidden sm:table w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-fg-muted text-left">
                  <th className="font-medium py-2 px-2">Creative type</th>
                  <th className="font-medium py-2 px-2 text-right">Expected</th>
                  <th className="font-medium py-2 px-2 text-right">Posted</th>
                  <th className="font-medium py-2 px-2 text-right">In progress</th>
                  <th className="font-medium py-2 px-2 text-right">Gap</th>
                  <th className="font-medium py-2 px-2 pl-6">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.by_type.map((r) => (
                  <tr key={r.creative_type} className="border-t border-border">
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: typeColor(r.creative_type) }} />
                        {r.creative_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{r.expected ?? '–'}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{r.posted}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{r.in_progress}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{r.expected == null ? '–' : r.gap}</td>
                    <td className="py-2.5 px-2 pl-6">
                      <StatusPill variant={ROW_STATUS[r.status].variant} label={ROW_STATUS[r.status].label} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border-strong bg-subtle font-semibold">
                  <td className="py-2.5 px-2">Total</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{totals.expected}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{totals.posted}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{totals.in_progress}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{totals.gap}</td>
                  <td className="py-2.5 px-2 pl-6 font-normal text-fg-2">
                    {s.percent != null ? `${s.percent}% of plan posted` : 'No monthly plan'}
                  </td>
                </tr>
              </tbody>
            </table>
            <ul className="sm:hidden m-0 p-0 list-none space-y-2.5">
              {report.by_type.map((r) => (
                <li key={r.creative_type} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border">
                    <span className="inline-flex items-center gap-2 text-[15px] font-medium">
                      <span className="w-2 h-2 rounded-full" style={{ background: typeColor(r.creative_type) }} />
                      {r.creative_type}
                    </span>
                    <StatusPill variant={ROW_STATUS[r.status].variant} label={ROW_STATUS[r.status].label} />
                  </div>
                  <dl className="m-0 grid grid-cols-4 gap-2 text-center">
                    {[
                      ['Expected', r.expected ?? '–'],
                      ['Posted', r.posted],
                      ['In progress', r.in_progress],
                      ['Gap', r.expected == null ? '–' : r.gap],
                    ].map(([k, v]) => (
                      <div key={k as string}>
                        <dt className="text-[11px] text-fg-muted">{k}</dt>
                        <dd className="m-0 text-base font-semibold tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            {!report.has_plan && (
              <p className="text-xs text-fg-muted mt-2 mb-0">No monthly plan is set for this client yet.</p>
            )}
          </>
        )}
      </Section>

      {/* 4. Pipeline */}
      <Section testId="cc-report-pipeline" title="Pipeline snapshot" hint={`${pipelineTotal} items in the ${month.split(' ')[0]} calendar`}>
        {pipelineTotal === 0 ? (
          <p className="text-sm text-fg-muted m-0">Nothing scheduled this month yet.</p>
        ) : (
          <>
            <div className="flex h-7 rounded-lg overflow-hidden w-full" role="img" aria-label="Pipeline by stage">
              {report.pipeline
                .filter((p) => p.count > 0)
                .map((p) => (
                  <div
                    key={p.key}
                    className="flex items-center justify-center text-[11px] font-semibold text-white min-w-[22px]"
                    style={{ flexGrow: p.count, flexBasis: 0, background: BUCKET_COLORS[p.key] }}
                    title={`${p.label}: ${p.count}`}
                  >
                    {p.count}
                  </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-fg-2">
              {report.pipeline.map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ background: BUCKET_COLORS[p.key] }} />
                  {p.label} {p.count}
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* 5. Breakdown */}
      <Section testId="cc-report-breakdown" title="Breakdown" hint={`All ${report.breakdown.total} ${month.split(' ')[0]} items`}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-5 min-w-0">
            <div>
              <h3 className="text-sm font-semibold m-0 mb-2.5">By channel</h3>
              <Bars rows={report.breakdown.channels} color={(l) => CHANNEL_COLORS[l.toLowerCase()] || 'var(--accent)'} />
            </div>
            <div>
              <h3 className="text-sm font-semibold m-0 mb-2.5">By content pillar</h3>
              <Bars rows={report.breakdown.content_pillars} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5">
            {[
              { title: 'Organic vs ad creative', rows: report.breakdown.creative_categories, color: categoryColor },
              { title: 'Scheduled vs runtime', rows: report.breakdown.content_types, color: contentTypeColor },
            ].map((g) => (
              <div key={g.title}>
                <h3 className="text-sm font-semibold m-0 mb-2.5">{g.title}</h3>
                <div className="flex items-center gap-4">
                  <Donut
                    label={g.title}
                    segments={g.rows.map((r) => ({ value: r.count, color: g.color(r.label) }))}
                    center={
                      <>
                        <span className="text-lg font-semibold tabular-nums leading-none">{report.breakdown.total}</span>
                        <span className="text-[10px] text-fg-muted">items</span>
                      </>
                    }
                  />
                  <ul className="m-0 p-0 list-none space-y-1.5 text-sm">
                    {g.rows.map((r) => (
                      <li key={r.label} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-sm" style={{ background: g.color(r.label) }} />
                        <span className="text-fg-2">{r.label}</span>
                        <span className="font-semibold tabular-nums ml-2">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* 6. Calendar */}
      <Section
        testId="cc-report-calendar"
        title="Publishing calendar"
        hint={`Posted and approved items in ${month}${report.period.today.startsWith(report.period.month) ? ` · today is ${shortDate(report.period.today)}` : ''}`}
      >
        <PublishingCalendar report={report} />
      </Section>

      {/* 7. Posted items */}
      <Section
        testId="cc-report-posted"
        title="Posted this month"
        hint={`${report.posted_items.length} ${report.posted_items.length === 1 ? 'item' : 'items'} · ${month}`}
      >
        {report.posted_items.length === 0 ? (
          <p className="text-sm text-fg-muted m-0">Nothing posted yet this month.</p>
        ) : (
          <ul className="m-0 p-0 list-none grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {report.posted_items.map((it) => (
              <li key={it.id} className="cc-report-avoid flex items-center gap-3 rounded-xl border border-border p-2.5 min-w-0">
                <Thumb item={it} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" title={it.title}>{it.title}</div>
                  <div className="text-xs text-fg-muted truncate">{itemMeta(it, shortDate(it.date))}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 8. Action needed */}
      <Section testId="cc-report-action" title="Action needed" hint={`As of ${longDate(report.period.today)}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <h3 className="text-sm font-semibold m-0 mb-2.5">Awaiting your review</h3>
            {report.action_needed.awaiting_review.length === 0 ? (
              <p className="text-sm text-fg-muted m-0">Nothing waiting on review.</p>
            ) : (
              <ul className="m-0 p-0 list-none divide-y divide-border">
                {report.action_needed.awaiting_review.map((it) => (
                  <li key={it.id} className="cc-report-avoid flex items-start gap-3 py-2.5">
                    <Thumb item={it} size={40} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{it.title}</div>
                      <div className="text-xs text-fg-muted truncate">{itemMeta(it, it.review_kind)}</div>
                      {it.days_waiting != null && (
                        <StatusPill
                          className="mt-1"
                          variant="warning"
                          label={it.days_waiting === 0 ? 'Sent today' : `Waiting ${it.days_waiting} ${it.days_waiting === 1 ? 'day' : 'days'}`}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold m-0 mb-2.5">Upcoming publish dates at risk</h3>
            {report.action_needed.at_risk.length === 0 ? (
              <p className="text-sm text-fg-muted m-0">No publish dates at risk in the next {report.action_needed.at_risk_days} days.</p>
            ) : (
              <ul className="m-0 p-0 list-none divide-y divide-border">
                {report.action_needed.at_risk.map((it) => (
                  <li key={it.id} className="cc-report-avoid flex items-start gap-3 py-2.5">
                    <Thumb item={it} size={40} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{it.title}</div>
                      <div className="text-xs text-fg-muted truncate">
                        Publishes {shortDate(it.date)} · {it.status_label.toLowerCase()}
                      </div>
                      <StatusPill
                        className="mt-1"
                        variant={it.days_until <= 2 ? 'danger' : 'warning'}
                        label={
                          it.days_until < 0
                            ? `${-it.days_until} ${it.days_until === -1 ? 'day' : 'days'} overdue`
                            : it.days_until === 0
                              ? 'Today'
                              : `In ${it.days_until} ${it.days_until === 1 ? 'day' : 'days'}`
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* 9. Next month */}
      <Section
        testId="cc-report-next"
        title={`Already planned for ${monthLabel(report.next_month.month)}`}
        hint="Items already on the calendar, not a full monthly plan"
      >
        {report.next_month.total === 0 ? (
          <p className="text-sm text-fg-muted m-0">Nothing planned yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {report.next_month.by_type.map((t) => (
                <div key={t.creative_type} className="rounded-xl bg-subtle border border-border p-3">
                  <div className="text-xs text-fg-2">{t.creative_type}</div>
                  <div className="text-xl font-semibold tabular-nums mt-1">{t.count}</div>
                </div>
              ))}
            </div>
            <p className="text-sm text-fg-2 mt-3 mb-0">
              <strong className="tabular-nums">{report.next_month.total}</strong> items already planned for next month.
            </p>
          </>
        )}
      </Section>

      <footer className="text-center text-xs text-fg-muted pt-4 border-t border-border">
        Generated from your content calendar, no manual edits
      </footer>
    </div>
  );
};

export default ContentCalendarReportView;
