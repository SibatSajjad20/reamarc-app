import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { financeService } from '../../services/financeService';
import { workspaceService } from '../../services/workspaceService';
import { formatMinorMoney } from '../../utils/money';
import type { MonthlyAnalysisReport, ReportPeriod } from '../../types/finance';
import type { Workspace } from '../../types';
import { FinanceReportFilters, ReportDownloadButton } from './financeUi';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { KpiRowSkeleton, TableSkeletonRows } from '../ui/Skeletons';
import {
  REPORT_PERIODS,
  defaultTrendRange,
  periodMeta,
  readPeriodFromUrl,
  runRatePctClass,
  writePeriodToUrl,
} from './reportPeriods';

function formatSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

function directionCopy(report: MonthlyAnalysisReport, unit = 'month'): { label: string; detail: string; className: string } {
  const selected = report.selected;
  const prior = `prior ${unit}`;
  const toDate = unit === 'month' ? 'Month-to-date' : `${unit[0].toUpperCase()}${unit.slice(1)}-to-date`;
  if (selected.direction === 'improving') {
    return {
      label: 'Improving',
      detail: selected.is_partial
        ? `${toDate} vs ${selected.prior_label || prior} (incomplete ${unit})`
        : `Above ${selected.prior_label || prior} outside the noise band`,
      className: 'text-emerald-700 dark:text-emerald-300',
    };
  }
  if (selected.direction === 'down') {
    return {
      label: 'Down',
      detail: selected.is_partial
        ? `${toDate} vs ${selected.prior_label || prior} (incomplete ${unit})`
        : `Below ${selected.prior_label || prior} outside the noise band`,
      className: 'text-rose-700 dark:text-rose-300',
    };
  }
  if (selected.direction === 'no_prior') {
    return {
      label: `No prior ${unit}`,
      detail: `Widen the date range to compare against the previous ${unit}`,
      className: 'text-fg-muted',
    };
  }
  return {
    label: 'Flat',
    detail: 'Change is inside a 5% or PKR 50,000 noise band',
    className: 'text-fg-muted',
  };
}

function runRateCopy(report: MonthlyAnalysisReport, unit = 'month'): string {
  const status = report.selected.run_rate_status;
  if (!status || report.selected.run_rate_compare_pkr == null) return `Need three prior ${unit}s for a run rate`;
  if (status === 'above') return `above the 3-${unit} run rate`;
  if (status === 'below') return `below the 3-${unit} run rate`;
  return `in line with the 3-${unit} run rate`;
}

export const MonthlyAnalysisView: React.FC = () => {
  const [period, setPeriod] = useState<ReportPeriod>(() => readPeriodFromUrl());
  const initialRange = useMemo(() => defaultTrendRange(period), []); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = periodMeta(period).unit;
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [clientName, setClientName] = useState('');
  const [focusMonth, setFocusMonth] = useState<string | undefined>(undefined);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const cachedReport = financeService.getCachedMonthlyAnalysis(
    dateFrom,
    dateTo,
    clientName || undefined,
    focusMonth,
    period,
  );
  const [data, setData] = useState<MonthlyAnalysisReport | null>(() => cachedReport?.data || null);
  const [loading, setLoading] = useState(!cachedReport);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadReqIdRef = useRef(0);
  useModuleLoadGate(loading);

  useEffect(() => {
    workspaceService.getWorkspaces().then((ws) => setWorkspaces(ws || [])).catch(() => {});
  }, []);

  const loadReport = useCallback(async (opts?: { silent?: boolean }) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const reqId = ++loadReqIdRef.current;
    const cached = financeService.getCachedMonthlyAnalysis(
      dateFrom,
      dateTo,
      clientName || undefined,
      focusMonth,
        period,
    );
    if (cached && !opts?.silent) {
      setData(cached.data);
      setLoading(false);
    } else if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await financeService.getMonthlyAnalysis(
        dateFrom,
        dateTo,
        clientName || undefined,
        focusMonth,
            { signal: controller.signal },
        period,
      );
      if (reqId !== loadReqIdRef.current) return;
      setData(res);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== loadReqIdRef.current) return;
      setError(err?.message || 'Error loading report');
    } finally {
      if (reqId === loadReqIdRef.current) setLoading(false);
    }
  }, [dateFrom, dateTo, clientName, focusMonth, period]);

  useEffect(() => {
    void loadReport();
    return () => loadAbortRef.current?.abort();
  }, [loadReport]);

  useCacheInvalidation(['finance'], () => {
    void loadReport({ silent: true });
  });

  const chartMax = useMemo(() => {
    const months = data?.months || [];
    const peak = Math.max(
      1,
      ...months.map((row) => Math.max(row.collected_pkr, row.billed_pkr, row.avg_3m_pkr)),
    );
    return peak;
  }, [data]);

  const avgPoints = useMemo(() => {
    const months = data?.months || [];
    if (months.length === 0) return '';
    return months
      .map((row, idx) => {
        const x = months.length === 1 ? 50 : (idx / (months.length - 1)) * 100;
        const y = 100 - (row.avg_3m_pkr / chartMax) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, chartMax]);

  const changePeriod = (next: ReportPeriod) => {
    if (next === period) return;
    const range = defaultTrendRange(next);
    setFocusMonth(undefined);
    setPeriod(next);
    setDateFrom(range.from);
    setDateTo(range.to);
    writePeriodToUrl(next);
  };

  // Data from an earlier period can show briefly while the new one loads; label by what is on screen.
  const shownUnit = data?.period ? periodMeta(data.period).unit : unit;
  const verdict = data ? directionCopy(data, shownUnit) : null;
  const runRatePct = data?.selected.run_rate_pct ?? null;
  const selected = data?.selected;

  return (
    <div className="p-6 w-full space-y-6">
      <div>
        <h1 className="text-h1 font-semibold tracking-tight text-fg">Reports</h1>
        <p className="text-xs text-fg-muted mt-1">
          Posted cash collected by {unit}, compared with the prior {unit}. Pending cheques are not money in.
        </p>
      </div>


      <FinanceReportFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={(value) => {
          setFocusMonth(undefined);
          setDateFrom(value);
        }}
        onDateTo={(value) => {
          setFocusMonth(undefined);
          setDateTo(value);
        }}
        clientName={clientName}
        onClientName={setClientName}
        clientOptions={workspaces.map((ws) => ({ value: ws.name, label: ws.name }))}
        actions={
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-fg-muted">
              Period
              <select
                aria-label="Period"
                data-testid="report-period"
                className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-fg"
                value={period}
                onChange={(e) => changePeriod(e.target.value as ReportPeriod)}
              >
                {REPORT_PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <ReportDownloadButton
              downloading={downloading}
              onClick={async () => {
                setDownloading(true);
                try {
                  await financeService.downloadReport('monthly-analysis', {
                    date_from: dateFrom,
                    date_to: dateTo,
                    client_name: clientName || undefined,
                    focus_month: focusMonth || data?.selected.month,
                    period: period === 'monthly' ? undefined : period,
                  });
                } finally {
                  setDownloading(false);
                }
              }}
            />
          </div>
        }
      />

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {loading && !data ? (
        <KpiRowSkeleton count={4} />
      ) : selected ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-surface p-5 rounded-lg border border-border sm:col-span-2 xl:col-span-1">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
              Cash collected {selected.is_partial ? (shownUnit === 'month' ? '(MTD)' : '(to date)') : ''}
            </p>
            <p className="text-xl font-bold text-fg mt-1 font-numeric">
              {formatMinorMoney(selected.collected_pkr, 'PKR')}
            </p>
            <p className="text-xs text-fg-muted mt-1">{selected.label}</p>
          </div>
          <div className="bg-surface p-5 rounded-lg border border-border">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">vs prior {shownUnit}</p>
            <p className="text-xl font-bold text-fg mt-1 font-numeric">
              {selected.delta_pkr == null ? '—' : formatMinorMoney(selected.delta_pkr, 'PKR')}
            </p>
            <p className="text-xs text-fg-muted mt-1">
              {formatSignedPct(selected.pct_change)}
              {selected.prior_label ? ` vs ${selected.prior_label}` : ''}
            </p>
          </div>
          <div className="bg-surface p-5 rounded-lg border border-border">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Direction</p>
            <p className={`text-xl font-bold mt-1 ${verdict?.className || 'text-fg'}`}>{verdict?.label}</p>
            <p className="text-xs text-fg-muted mt-1">{verdict?.detail}</p>
          </div>
          <div className="bg-surface p-5 rounded-lg border border-border">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Run rate</p>
            <p className="text-xl font-bold text-fg mt-1 font-numeric">
              {selected.run_rate_compare_pkr == null
                ? '—'
                : formatMinorMoney(selected.run_rate_compare_pkr, 'PKR')}
            </p>
            <p className="text-xs text-fg-muted mt-1" data-testid="run-rate-pct-line">
              {runRatePct !== null && (
                <span className={`font-semibold font-numeric ${runRatePctClass(runRatePct)}`} data-testid="run-rate-pct">
                  {runRatePct > 0 ? '▲ ' : runRatePct < 0 ? '▼ ' : ''}
                  {formatSignedPct(runRatePct)}{' '}
                </span>
              )}
              {runRatePct !== null ? runRateCopy(data, shownUnit) : (() => { const t = runRateCopy(data, shownUnit); return t[0].toUpperCase() + t.slice(1); })()}
            </p>
          </div>
        </div>
      ) : null}

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-ui font-semibold text-fg">Cash collected by {shownUnit}</h2>
            <p className="text-xs text-fg-muted mt-0.5">
              Bars are posted receipts in PKR. Line is the 3-{shownUnit} average. Click a {shownUnit} to inspect it.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-accent shrink-0" />
              Collected
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-accent/25 border border-accent/40 shrink-0" />
              Billed (PKR invoices)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-6 h-px bg-fg-muted shrink-0" />
              3-{shownUnit} avg
            </span>
          </div>
        </div>
        <div className="p-4">
          {loading && !data ? (
            <KpiRowSkeleton count={1} />
          ) : !data?.months.length ? (
            <p className="h-44 flex items-center justify-center text-xs text-fg-muted">
              No {shownUnit}s in this range.
            </p>
          ) : (
            <div className="h-56 flex flex-col">
              <div className="relative flex-1 min-h-0">
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none z-10"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    vectorEffect="non-scaling-stroke"
                    className="text-fg-muted"
                    points={avgPoints}
                  />
                </svg>
                <div className="absolute inset-0 flex items-end gap-1.5">
                  {data.months.map((row) => {
                    const collectedPct = Math.max(0, (row.collected_pkr / chartMax) * 100);
                    const billedPct = Math.max(0, (row.billed_pkr / chartMax) * 100);
                    const isSelected = row.month === data.selected.month;
                    return (
                      <button
                        key={row.month}
                        type="button"
                        onClick={() => setFocusMonth(row.month)}
                        className={`flex-1 min-w-0 h-full flex items-end justify-center rounded-md ${
                          isSelected ? 'bg-accent/10' : 'hover:bg-hover'
                        }`}
                        aria-label={`${row.label}: billed ${formatMinorMoney(row.billed_pkr, 'PKR')}, collected ${formatMinorMoney(row.collected_pkr, 'PKR')}`}
                      >
                        <div className="w-full h-full flex items-end justify-center gap-0.5 px-0.5">
                          <div
                            className="w-[42%] max-w-6 rounded-t-sm bg-accent/25 border border-accent/40"
                            style={{ height: `${billedPct}%` }}
                            title={`${row.label}: billed ${formatMinorMoney(row.billed_pkr, 'PKR')}`}
                          />
                          <div
                            className="w-[42%] max-w-6 rounded-t-sm bg-accent"
                            style={{ height: `${Math.max(collectedPct, row.collected_pkr > 0 ? 2 : 0)}%` }}
                            title={`${row.label}: collected ${formatMinorMoney(row.collected_pkr, 'PKR')}`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-1.5 pt-1">
                {data.months.map((row) => (
                  <span key={`${row.month}-label`} className="flex-1 min-w-0 text-[10px] text-fg-muted truncate text-center">
                    {row.label.replace(/ 20/, ' ')}
                    {row.is_partial ? '*' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
            <h3 className="text-ui font-semibold text-fg">Quality of cash</h3>
            <p className="text-xs text-fg-muted">
              {selected.top_client_share_pct.toFixed(1)}% of this {shownUnit} came from the largest client.
            </p>
            <dl className="text-xs space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">From this {shownUnit}’s invoices</dt>
                <dd className="font-numeric">{formatMinorMoney(selected.collected_new_invoices_pkr, 'PKR')}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">From older invoices</dt>
                <dd className="font-numeric">{formatMinorMoney(selected.collected_prior_invoices_pkr, 'PKR')}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Unallocated / leftover</dt>
                <dd className="font-numeric">{formatMinorMoney(selected.collected_unallocated_pkr, 'PKR')}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Pending cheques</dt>
                <dd className="font-numeric">{formatMinorMoney(selected.pending_pkr, 'PKR')}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">WHT withheld</dt>
                <dd className="font-numeric">{formatMinorMoney(selected.wht_pkr, 'PKR')}</dd>
              </div>
            </dl>
          </div>
          <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
            <h3 className="text-ui font-semibold text-fg">Where it landed</h3>
            <dl className="text-xs space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Cash</dt>
                <dd className="font-numeric">{formatMinorMoney(selected.channels.cash, 'PKR')}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">ABL</dt>
                <dd className="font-numeric">{formatMinorMoney(selected.channels.abl, 'PKR')}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Meezan</dt>
                <dd className="font-numeric">{formatMinorMoney(selected.channels.meezan, 'PKR')}</dd>
              </div>
              {selected.channels.other > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Other</dt>
                  <dd className="font-numeric">{formatMinorMoney(selected.channels.other, 'PKR')}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Billed (PKR invoices)</dt>
                <dd className="font-numeric">{formatMinorMoney(selected.billed_pkr, 'PKR')}</dd>
              </div>
            </dl>
            <p className="text-xs text-fg-muted">{data?.headline_rule}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-ui font-semibold text-fg">Clients who paid more</h3>
          </div>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas text-fg-2 border-b border-border">
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4 text-right">This {shownUnit}</th>
                <th className="py-3 px-4 text-right">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && !data ? (
                <TableSkeletonRows rows={4} columns={3} />
              ) : !data?.movers_up.length ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-fg-muted">No increases vs prior {shownUnit}.</td>
                </tr>
              ) : (
                data.movers_up.map((row) => (
                  <tr key={`up-${row.client_name}`}>
                    <td className="py-3 px-4">{row.client_name}</td>
                    <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(row.this_month_pkr, 'PKR')}</td>
                    <td className="py-3 px-4 text-right font-numeric text-emerald-700 dark:text-emerald-300">
                      {formatMinorMoney(row.delta_pkr, 'PKR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-ui font-semibold text-fg">Clients who paid less</h3>
          </div>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas text-fg-2 border-b border-border">
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4 text-right">This {shownUnit}</th>
                <th className="py-3 px-4 text-right">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && !data ? (
                <TableSkeletonRows rows={4} columns={3} />
              ) : !data?.movers_down.length ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-fg-muted">No decreases vs prior {shownUnit}.</td>
                </tr>
              ) : (
                data.movers_down.map((row) => (
                  <tr key={`down-${row.client_name}`}>
                    <td className="py-3 px-4">{row.client_name}</td>
                    <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(row.this_month_pkr, 'PKR')}</td>
                    <td className="py-3 px-4 text-right font-numeric text-rose-700 dark:text-rose-300">
                      {formatMinorMoney(row.delta_pkr, 'PKR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-ui font-semibold text-fg">{shownUnit === 'month' ? 'Month by month' : `${shownUnit[0].toUpperCase()}${shownUnit.slice(1)} by ${shownUnit}`}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas text-fg-2 border-b border-border">
                <th className="py-3 px-4">{shownUnit[0].toUpperCase() + shownUnit.slice(1)}</th>
                <th className="py-3 px-4 text-right">Collected</th>
                <th className="py-3 px-4 text-right">Billed (PKR)</th>
                <th className="py-3 px-4 text-right">Pending</th>
                <th className="py-3 px-4 text-right">WHT</th>
                <th className="py-3 px-4 text-right">3-{shownUnit} avg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && !data ? (
                <TableSkeletonRows rows={6} columns={6} />
              ) : !data?.months.length ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-fg-muted">No data in this range.</td>
                </tr>
              ) : (
                data.months.map((row) => (
                  <tr
                    key={row.month}
                    className={row.month === data.selected.month ? 'bg-accent/5' : undefined}
                  >
                    <td className="py-3 px-4">
                      {row.label}
                      {row.is_partial ? (shownUnit === 'month' ? ' (MTD)' : ' (to date)') : ''}
                    </td>
                    <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(row.collected_pkr, 'PKR')}</td>
                    <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(row.billed_pkr, 'PKR')}</td>
                    <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(row.pending_pkr, 'PKR')}</td>
                    <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(row.wht_pkr, 'PKR')}</td>
                    <td className="py-3 px-4 text-right font-numeric">{formatMinorMoney(row.avg_3m_pkr, 'PKR')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
