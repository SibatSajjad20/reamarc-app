/**
 * Internal (staff only) content calendar report. A separate, detailed operations view:
 * real pipeline stages, team load, overdue and stuck work, plan vs posted, organic/ad split,
 * revisions and the full item list. Never rendered for the client audience.
 */
import React from 'react';
import type { ContentCalendarReport, ReportInternalRow, ReportInternalSplit } from '../../../types/contentCalendarReport';
import { StatusPill } from '../../ui/StatusPill';
import { cn } from '../../../lib/utils';
import { ROW_STATUS, longDate, monthLabel, shortDate, typeColor } from './reportFormat';

const STAGE_COLORS: Record<string, string> = {
  Content: 'var(--chart-2)',
  'Content Internal Review': 'var(--chart-5)',
  'Content Client Review': 'var(--warning-dot)',
  'Content Revision': 'var(--danger-dot)',
  'Creative Production': 'var(--chart-1)',
  'Creative Internal Review': 'var(--chart-5)',
  'Creative Client Review': 'var(--warning-dot)',
  'Creative Revision': 'var(--danger-dot)',
  'Ready to Post': 'var(--chart-3)',
  Posted: 'var(--success-dot)',
  Rejected: 'var(--text-muted)',
};

function stageColor(stage: string): string {
  return STAGE_COLORS[stage] || 'var(--text-muted)';
}

function Section({
  title,
  hint,
  children,
  testId,
  breakable,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  breakable?: boolean;
}) {
  return (
    <section
      data-testid={testId}
      className={cn('cc-report-section bg-surface border border-border rounded-2xl shadow-xs p-4 sm:p-5 min-w-0', breakable && 'cc-report-breakable')}
    >
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 pb-3 mb-4 border-b border-border">
        <h2 className="text-base font-semibold text-fg tracking-tight m-0">{title}</h2>
        {hint ? <span className="text-xs text-fg-muted">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub: string; tone?: 'danger' | 'warning' }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 bg-surface min-w-0',
        tone === 'danger' && 'bg-danger-bg/60 border-danger-bd',
        tone === 'warning' && 'bg-warning-bg/60 border-warning-bd',
        !tone && 'border-border',
      )}
    >
      <div className="text-xs sm:text-[13px] text-fg-2">{label}</div>
      <div className="text-2xl font-semibold text-fg tabular-nums mt-1">{value}</div>
      <div className="text-xs text-fg-muted mt-0.5">{sub}</div>
    </div>
  );
}

const th = 'font-medium py-2 px-2 whitespace-nowrap';
const td = 'py-1.5 px-2 align-top';
const num = 'text-right tabular-nums';

function Table({ children, testId, small }: { children: React.ReactNode; testId?: string; small?: boolean }) {
  return (
    <div className="cc-report-table-wrap overflow-x-auto -mx-1 px-1">
      <table data-testid={testId} className={cn('w-full border-collapse', small ? 'text-xs' : 'text-sm', 'cc-report-table')}>
        {children}
      </table>
    </div>
  );
}

function StageDot({ stage }: { stage: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stageColor(stage) }} aria-hidden="true" />
      {stage}
    </span>
  );
}

function d(v?: string | null): string {
  return v ? shortDate(v) : '–';
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function ItemCell({ r }: { r: ReportInternalRow }) {
  return (
    <span className="block min-w-[10rem]">
      <span className="block font-medium text-fg">{r.title}</span>
      <span className="block text-xs text-fg-muted">
        {[r.serial, r.creative_type, r.category === 'Ad creative' ? 'Ad' : null].filter(Boolean).join(' · ')}
      </span>
    </span>
  );
}

function SplitTable({ rows, testId }: { rows: ReportInternalSplit[]; testId: string }) {
  return (
    <Table testId={testId}>
      <thead>
        <tr className="text-xs text-fg-muted">
          <th className={cn(th, 'text-left')}>Type</th>
          <th className={cn(th, num)}>Items</th>
          <th className={cn(th, num)}>Posted</th>
          <th className={cn(th, num)}>Open</th>
          <th className={cn(th, num)}>Overdue</th>
          <th className={cn(th, num)}>Rejected</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-border">
            <td className={cn(td, 'font-medium')}>{r.label}</td>
            <td className={cn(td, num)}>{r.total}</td>
            <td className={cn(td, num)}>{r.posted}</td>
            <td className={cn(td, num)}>{r.open}</td>
            <td className={cn(td, num, r.overdue && 'text-danger-fg font-medium')}>{r.overdue}</td>
            <td className={cn(td, num)}>{r.rejected}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export interface ContentCalendarInternalReportViewProps {
  report: ContentCalendarReport;
  headerActions?: React.ReactNode;
}

export const ContentCalendarInternalReportView: React.FC<ContentCalendarInternalReportViewProps> = ({ report, headerActions }) => {
  const month = monthLabel(report.period.month);
  const lastDay = parseInt(report.period.end.slice(8, 10), 10);
  const shortMonth = shortDate(report.period.start).split(' ')[1];
  const inr = report.internal;
  const s = report.summary;

  const header = (
    <>
      <div className="cc-report-section flex items-center justify-center gap-2 rounded-lg border border-warning-bd bg-warning-bg text-warning-fg text-xs font-semibold px-3 py-2">
        Internal report for the team: real stages, assignees and delays. Do not send to the client.
      </div>
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
            <p className="m-0 mt-0.5 text-[13px] text-fg-muted">Internal operations report</p>
            <p className="m-0 text-[13px] text-fg-muted">
              {month} · 1–{lastDay} {shortMonth} · As of {longDate(report.period.today)}
            </p>
          </div>
        </div>
        <div className="sm:text-right shrink-0">
          <div className="font-semibold tracking-tight">
            <span className="text-accent">One</span>Worklane
          </div>
          <div className="text-xs text-fg-muted mt-0.5">Internal report</div>
          {headerActions ? <div className="cc-report-noprint mt-2.5 flex sm:justify-end gap-2">{headerActions}</div> : null}
        </div>
      </header>
    </>
  );

  if (!inr || !inr.totals || !inr.stages) {
    return (
      <div className="cc-report-body max-w-[1180px] mx-auto px-3 sm:px-6 pt-4 pb-12 space-y-4 text-fg" data-testid="cc-report">
        {header}
        <p className="text-sm text-fg-muted text-center">The internal detail isn't available for this report. Refresh to load it again.</p>
      </div>
    );
  }

  const t = inr.totals;
  const stuckDays = inr.stuck_days ?? 5;
  const stages = inr.stages;
  const stageTotal = stages.reduce((a, x) => a + x.count, 0);
  const assignees = inr.assignees || [];
  const overdue = inr.overdue || [];
  const stuck = inr.stuck || [];
  const byType = inr.by_type || [];
  const rev = inr.revisions;
  const items = inr.items || [];

  return (
    <div className="cc-report-body max-w-[1180px] mx-auto px-3 sm:px-6 pt-4 pb-12 space-y-4 sm:space-y-5 text-fg" data-testid="cc-report">
      {header}

      {/* KPIs */}
      <div className="cc-report-section grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5" data-testid="cc-internal-kpis">
        <Kpi label="Items this month" value={t.total} sub={`${t.open} open · ${t.posted} posted`} />
        <Kpi label="Plan delivered" value={s.planned > 0 ? `${s.delivered}/${s.planned}` : '–'} sub={s.planned > 0 ? `${s.percent ?? 0}% · ${s.left} left` : 'No monthly plan'} />
        <Kpi label="Overdue" value={t.overdue} sub="Past design due or publish date" tone={t.overdue ? 'danger' : undefined} />
        <Kpi label={`Stuck ${stuckDays}+ days`} value={t.stuck} sub="No update since (open items)" tone={t.stuck ? 'warning' : undefined} />
        <Kpi label="Internal review" value={t.internal_review} sub="Content + creative" />
        <Kpi label="Client review" value={t.client_review} sub="Waiting on the client" tone={t.client_review ? 'warning' : undefined} />
        <Kpi label="Unassigned" value={t.unassigned_open} sub="Open items with no assignee" tone={t.unassigned_open ? 'warning' : undefined} />
        <Kpi label="Rejected" value={t.rejected} sub={`${t.next_month} already planned next month`} />
      </div>

      {/* Pipeline by stage */}
      <Section
        testId="cc-internal-stages"
        title="Pipeline by stage"
        hint={`Days in stage = days since the item was last updated (no stage history is kept; any edit resets it). Stuck = ${stuckDays}+ days.`}
      >
        {stageTotal > 0 && (
          <>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-subtle mb-2" role="img" aria-label="Items by stage">
              {stages.filter((x) => x.count > 0).map((x) => (
                <span key={x.stage} style={{ flexGrow: x.count, flexBasis: 0, background: stageColor(x.stage) }} title={`${x.stage} ${x.count}`} />
              ))}
            </div>
          </>
        )}
        <Table testId="cc-internal-stage-table">
          <thead>
            <tr className="text-xs text-fg-muted">
              <th className={cn(th, 'text-left')}>Stage</th>
              <th className={cn(th, 'text-left')}>Team</th>
              <th className={cn(th, num)}>Items</th>
              <th className={cn(th, num)}>Oldest (days)</th>
              <th className={cn(th, num)}>Avg (days)</th>
              <th className={cn(th, num)}>Stuck</th>
              <th className={cn(th, num)}>Overdue</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((x) => (
              <tr key={x.stage} className={cn('border-t border-border', x.count === 0 && 'text-fg-faint')}>
                <td className={td}><StageDot stage={x.stage} /></td>
                <td className={cn(td, 'text-fg-2')}>{x.department}</td>
                <td className={cn(td, num, 'font-medium')}>{x.count}</td>
                <td className={cn(td, num)}>{x.oldest_days ?? '–'}</td>
                <td className={cn(td, num)}>{x.avg_days ?? '–'}</td>
                <td className={cn(td, num, x.stuck > 0 && 'text-warning-fg font-medium')}>{x.stuck || (x.oldest_days == null ? '–' : 0)}</td>
                <td className={cn(td, num, x.overdue > 0 && 'text-danger-fg font-medium')}>{x.overdue}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong bg-subtle font-semibold">
              <td className={td}>Total</td>
              <td className={td} />
              <td className={cn(td, num)}>{stageTotal}</td>
              <td className={td} />
              <td className={td} />
              <td className={cn(td, num)}>{t.stuck}</td>
              <td className={cn(td, num)}>{t.overdue}</td>
            </tr>
          </tfoot>
        </Table>
      </Section>

      {/* Team */}
      <Section testId="cc-internal-team" title="Team workload" hint="Items this month by assignee">
        {assignees.length === 0 ? (
          <p className="text-sm text-fg-muted m-0">No items this month.</p>
        ) : (
          <Table testId="cc-internal-team-table">
            <thead>
              <tr className="text-xs text-fg-muted">
                <th className={cn(th, 'text-left')}>Assignee</th>
                <th className={cn(th, num)}>Assigned</th>
                <th className={cn(th, num)}>Open</th>
                <th className={cn(th, num)}>Done</th>
                <th className={cn(th, num)}>Overdue</th>
                <th className={cn(th, num)}>In revision</th>
                <th className={cn(th, num)}>With client</th>
                <th className={cn(th, num)}>Rejected</th>
              </tr>
            </thead>
            <tbody>
              {assignees.map((a) => (
                <tr key={a.name} className="border-t border-border">
                  <td className={cn(td, 'font-medium', a.name === 'Unassigned' && 'text-fg-muted italic')}>{a.name}</td>
                  <td className={cn(td, num)}>{a.assigned}</td>
                  <td className={cn(td, num)}>{a.open}</td>
                  <td className={cn(td, num)}>{a.done}</td>
                  <td className={cn(td, num, a.overdue > 0 && 'text-danger-fg font-medium')}>{a.overdue}</td>
                  <td className={cn(td, num)}>{a.in_revision}</td>
                  <td className={cn(td, num)}>{a.client_review}</td>
                  <td className={cn(td, num)}>{a.rejected}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {inr.workload_by_owner.length > 0 && (
          <p className="text-xs text-fg-muted mt-3 mb-0">
            Open work by department: {inr.workload_by_owner.map((o) => `${o.label} ${o.count}`).join(' · ')}
          </p>
        )}
      </Section>

      {/* Overdue */}
      <Section
        testId="cc-internal-overdue"
        title="Overdue"
        hint={`Not posted and past the target date: design due before Ready to Post, publish date after · ${month} and next month`}
        breakable
      >
        {overdue.length === 0 ? (
          <p className="text-sm text-fg-muted m-0">Nothing overdue.</p>
        ) : (
          <Table testId="cc-internal-overdue-table">
            <thead>
              <tr className="text-xs text-fg-muted">
                <th className={cn(th, 'text-left')}>Item</th>
                <th className={cn(th, 'text-left')}>Stage</th>
                <th className={cn(th, 'text-left')}>Assignee</th>
                <th className={cn(th, 'text-left')}>Target</th>
                <th className={cn(th, num)}>Days overdue</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((r) => (
                <tr key={r.id} className="border-t border-border cc-report-avoid">
                  <td className={td}><ItemCell r={r} /></td>
                  <td className={td}><StageDot stage={r.stage} /></td>
                  <td className={cn(td, 'whitespace-nowrap')}>{r.assignee}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>{r.target_label} {d(r.target_date)}</td>
                  <td className={cn(td, num, 'text-danger-fg font-semibold')}>{r.days_overdue}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* Stuck */}
      <Section
        testId="cc-internal-stuck"
        title={`Stuck in stage (${stuckDays}+ days without an update)`}
        hint="Proxy: days since updated_at, not true time in stage"
        breakable
      >
        {stuck.length === 0 ? (
          <p className="text-sm text-fg-muted m-0">No open item has gone {stuckDays}+ days without an update.</p>
        ) : (
          <Table testId="cc-internal-stuck-table">
            <thead>
              <tr className="text-xs text-fg-muted">
                <th className={cn(th, 'text-left')}>Item</th>
                <th className={cn(th, 'text-left')}>Stage</th>
                <th className={cn(th, 'text-left')}>Assignee</th>
                <th className={cn(th, 'text-left')}>Last update</th>
                <th className={cn(th, num)}>Days</th>
              </tr>
            </thead>
            <tbody>
              {stuck.map((r) => (
                <tr key={r.id} className="border-t border-border cc-report-avoid">
                  <td className={td}><ItemCell r={r} /></td>
                  <td className={td}><StageDot stage={r.stage} /></td>
                  <td className={cn(td, 'whitespace-nowrap')}>{r.assignee}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>{d(r.updated)}</td>
                  <td className={cn(td, num, 'font-semibold text-warning-fg')}>{r.days_since_update ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* Plan vs posted */}
      <Section testId="cc-internal-plan" title="Plan vs posted by creative type" hint="Monthly plan from the client's expectations · stories never count · rejected left out · set in Content calendar → Settings">
        {byType.length === 0 ? (
          <p className="text-sm text-fg-muted m-0">No plan and no items this month.</p>
        ) : (
          <Table testId="cc-internal-plan-table">
            <thead>
              <tr className="text-xs text-fg-muted">
                <th className={cn(th, 'text-left')}>Creative type</th>
                <th className={cn(th, num)}>Expected</th>
                <th className={cn(th, num)}>Posted</th>
                <th className={cn(th, num)}>In progress</th>
                <th className={cn(th, num)}>Gap</th>
                <th className={cn(th, num)}>Organic</th>
                <th className={cn(th, num)}>Ad</th>
                <th className={cn(th, 'text-left pl-4')}>Status</th>
              </tr>
            </thead>
            <tbody>
              {byType.map((r) => (
                <tr key={r.creative_type} className="border-t border-border">
                  <td className={td}>
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span className="w-2 h-2 rounded-sm" style={{ background: typeColor(r.creative_type) }} aria-hidden="true" />
                      {r.creative_type}
                    </span>
                  </td>
                  <td className={cn(td, num)}>{r.expected ?? '–'}</td>
                  <td className={cn(td, num)}>{r.posted}</td>
                  <td className={cn(td, num)}>{r.in_progress}</td>
                  <td className={cn(td, num)}>{r.expected != null ? r.gap : '–'}</td>
                  <td className={cn(td, num)}>{r.organic}</td>
                  <td className={cn(td, num)}>{r.ad}</td>
                  <td className={cn(td, 'pl-4')}>
                    <StatusPill variant={ROW_STATUS[r.status].variant} label={ROW_STATUS[r.status].label} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* Splits + revisions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-start">
        <Section testId="cc-internal-category" title="Organic vs ad">
          <SplitTable rows={inr.category_split || []} testId="cc-internal-category-table" />
        </Section>
        <Section testId="cc-internal-content-type" title="Scheduled vs runtime">
          <SplitTable rows={inr.content_type_split || []} testId="cc-internal-content-type-table" />
        </Section>
      </div>

      <Section testId="cc-internal-revisions" title="Revisions and rejections" hint="Current state only; no revision history is kept">
        {rev ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {(
              [
                ['In content revision now', rev.content_revision],
                ['In creative revision now', rev.creative_revision],
                ['Marked "Changes requested"', rev.changes_requested],
                ['Revision requested at some point (note on file)', rev.with_revision_note],
                ['Rejected', rev.rejected],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-xl bg-subtle border border-border p-3">
                <div className="text-xs text-fg-2">{label}</div>
                <div className="text-xl font-semibold tabular-nums mt-1">{n}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted m-0">No data.</p>
        )}
      </Section>

      {/* All items */}
      <Section
        testId="cc-internal-items"
        title="All items this month"
        hint={
          inr.items_total != null && inr.items_total > items.length
            ? `Showing ${items.length} of ${inr.items_total}, by target date`
            : `${plural(items.length, 'item')}, by target date`
        }
        breakable
      >
        {items.length === 0 ? (
          <p className="text-sm text-fg-muted m-0">No items this month.</p>
        ) : (
          <Table testId="cc-internal-items-table" small>
            <thead>
              <tr className="text-fg-muted">
                <th className={cn(th, 'text-left')}>Item</th>
                <th className={cn(th, 'text-left')}>Stage</th>
                <th className={cn(th, 'text-left')}>Owner</th>
                <th className={cn(th, 'text-left')}>Assignee</th>
                <th className={cn(th, 'text-left')}>Channels</th>
                <th className={cn(th, 'text-left')}>Design due</th>
                <th className={cn(th, 'text-left')}>Publish</th>
                <th className={cn(th, 'text-left')}>Updated</th>
                <th className={cn(th, num)}>Late</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-border cc-report-avoid">
                  <td className={td}><ItemCell r={r} /></td>
                  <td className={td}><StageDot stage={r.stage} /></td>
                  <td className={cn(td, 'whitespace-nowrap text-fg-2')}>{r.department}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>{r.assignee}</td>
                  <td className={cn(td, 'text-fg-2')}>{r.channels.join(', ') || '–'}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>{d(r.design_due)}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>{d(r.publish_date)}</td>
                  <td className={cn(td, 'whitespace-nowrap text-fg-2')}>{d(r.updated)}</td>
                  <td className={cn(td, num, r.days_overdue > 0 && 'text-danger-fg font-semibold')}>{r.days_overdue > 0 ? `${r.days_overdue}d` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <footer className="text-center text-xs text-fg-muted pt-4 border-t border-border">
        Internal · generated from the content calendar, no manual edits
      </footer>
    </div>
  );
};

export default ContentCalendarInternalReportView;
