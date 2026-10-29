import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import mockReports from './reportsMock.json';

const getMonthlyAnalysis = vi.fn();
vi.mock('../../../services/financeService', () => ({
  financeService: {
    getMonthlyAnalysis: (...args: unknown[]) => getMonthlyAnalysis(...args),
    getCachedMonthlyAnalysis: () => undefined,
    downloadReport: vi.fn(),
  },
}));
vi.mock('../../../services/workspaceService', () => ({
  workspaceService: { getWorkspaces: () => Promise.resolve([]) },
}));

import { MonthlyAnalysisView } from '../MonthlyAnalysisView';
import { defaultTrendRange, parsePeriod } from '../reportPeriods';
import { normalizeFinanceTab } from '../financeTabs';

const reports = mockReports as Record<string, any>;

beforeEach(() => {
  getMonthlyAnalysis.mockReset();
  getMonthlyAnalysis.mockImplementation((_f, _t, _c, _m, _o, period) =>
    Promise.resolve(reports[period || 'monthly']),
  );
  window.history.replaceState(null, '', '/finance/reports');
});

describe('Accounts > Reports', () => {
  it('is titled Reports, not Trends, and the legacy trends tab redirects', async () => {
    render(<MonthlyAnalysisView />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeTruthy();
    expect(screen.queryByText('Trends')).toBeNull();
    expect(normalizeFinanceTab('trends')).toBe('reports');
    expect(normalizeFinanceTab('reports')).toBe('reports');
  });

  it('removes the "How to read this" card', async () => {
    render(<MonthlyAnalysisView />);
    await screen.findByTestId('run-rate-pct-line');
    expect(screen.queryByText(/How to read this/i)).toBeNull();
  });

  it('does not show sample/demo data toggles or banners', async () => {
    render(<MonthlyAnalysisView />);
    await screen.findByRole('heading', { level: 1, name: 'Reports' });
    expect(screen.queryByText(/Sample data/i)).toBeNull();
    expect(screen.queryByText(/sample collections/i)).toBeNull();
    expect(screen.queryByText(/4 lac/i)).toBeNull();
    // Live API call — no sample flag
    expect(getMonthlyAnalysis.mock.calls[0].length).toBe(6);
    expect(getMonthlyAnalysis.mock.calls[0][4]).toEqual({ signal: expect.any(AbortSignal) });
  });

  it('defaults to Monthly and offers quarterly, semi-annual and yearly', async () => {
    render(<MonthlyAnalysisView />);
    const select = (await screen.findByTestId('report-period')) as HTMLSelectElement;
    expect(select.value).toBe('monthly');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['monthly', 'quarterly', 'semiannual', 'yearly']);
    expect(getMonthlyAnalysis.mock.calls[0][5]).toBe('monthly');
  });

  it('changing the period refetches, presets the range and persists ?period= in the URL', async () => {
    render(<MonthlyAnalysisView />);
    const select = await screen.findByTestId('report-period');
    fireEvent.change(select, { target: { value: 'quarterly' } });
    await waitFor(() => expect(getMonthlyAnalysis.mock.calls.at(-1)?.[5]).toBe('quarterly'));
    expect(window.location.search).toBe('?period=quarterly');
    expect(getMonthlyAnalysis.mock.calls.at(-1)?.[0]).toBe(defaultTrendRange('quarterly').from);
    expect(await screen.findByText('vs prior quarter')).toBeTruthy();
    fireEvent.change(select, { target: { value: 'monthly' } });
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('reads the period from the URL', async () => {
    window.history.replaceState(null, '', '/finance/reports?period=yearly');
    render(<MonthlyAnalysisView />);
    const select = (await screen.findByTestId('report-period')) as HTMLSelectElement;
    expect(select.value).toBe('yearly');
    expect(parsePeriod('bogus')).toBe('monthly');
  });

  it('run rate shows a coloured percentage, and hides it when there is no run rate', async () => {
    const { unmount } = render(<MonthlyAnalysisView />);
    const pct = await screen.findByTestId('run-rate-pct');
    const expected = reports.monthly.selected.run_rate_pct as number;
    expect(pct.textContent).toContain(`${expected > 0 ? '+' : ''}${expected.toFixed(1)}%`);
    expect(pct.className).toMatch(expected > 0 ? /emerald/ : /rose/);
    unmount();

    const down = structuredClone(reports.monthly);
    down.selected.run_rate_pct = -12.5;
    down.selected.run_rate_status = 'below';
    getMonthlyAnalysis.mockResolvedValue(down);
    const r2 = render(<MonthlyAnalysisView />);
    const pct2 = await screen.findByTestId('run-rate-pct');
    expect(pct2.textContent).toContain('-12.5%');
    expect(pct2.className).toMatch(/rose/);
    r2.unmount();

    const none = structuredClone(reports.monthly);
    none.selected.run_rate_pct = null;
    none.selected.run_rate_compare_pkr = null;
    getMonthlyAnalysis.mockResolvedValue(none);
    render(<MonthlyAnalysisView />);
    expect(await screen.findByText(/Need three prior months/)).toBeTruthy();
    expect(screen.queryByTestId('run-rate-pct')).toBeNull();
  });
});

describe('defaultTrendRange', () => {
  const now = new Date(Date.UTC(2026, 9, 27));
  it('snaps to whole periods', () => {
    expect(defaultTrendRange('monthly', now).from).toBe('2025-11-01');
    expect(defaultTrendRange('quarterly', now).from).toBe('2025-01-01');
    expect(defaultTrendRange('semiannual', now).from).toBe('2024-01-01');
    expect(defaultTrendRange('yearly', now).from).toBe('2022-01-01');
  });
});
