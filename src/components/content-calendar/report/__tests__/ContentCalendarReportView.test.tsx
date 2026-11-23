import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ContentCalendarReportView } from '../ContentCalendarReportView';
import { reportThumbSrc, shiftMonth, monthLabel } from '../reportFormat';
import { makeInternal, makeReport } from './reportFixture';

const INTERNAL_WORDS = [
  /Content Client Review/,
  /Creative Client Review/,
  /Internal Review/,
  /Creative Production/,
  /Ready to Post/,
  /Team view/,
  /assignee/i,
  /share_token/,
  /Internal version/,
];

describe('ContentCalendarReportView', () => {
  it('renders the client report from real data', () => {
    render(<ContentCalendarReportView report={makeReport()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'SP Builders' })).toBeTruthy();
    expect(screen.getByText('Client report')).toBeTruthy();
    const summary = screen.getByTestId('cc-report-summary');
    expect(within(summary).getByText('60%')).toBeTruthy();
    expect(within(summary).getByText('2 left this month')).toBeTruthy();
    expect(within(summary).getByText('Awaiting your review')).toBeTruthy();
    const table = screen.getByTestId('cc-report-by-type');
    expect(within(table).getAllByText('At risk').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('Not in plan').length).toBeGreaterThan(0);
    expect(within(table).getByText('60% of plan posted')).toBeTruthy();
    expect(screen.getByText('Behind the Factory Floor')).toBeTruthy();
    expect(screen.getByText('Waiting 4 days')).toBeTruthy();
    expect(screen.getByText('In 2 days')).toBeTruthy();
    expect(screen.getByText('Already planned for December 2026')).toBeTruthy();
  });

  it('client mode shows no internal stage names, assignees or team sections', () => {
    const { container } = render(<ContentCalendarReportView report={makeReport()} />);
    const text = container.textContent || '';
    for (const re of INTERNAL_WORDS) expect(text).not.toMatch(re);
    expect(screen.queryByTestId('cc-report-internal')).toBeNull();
  });

  it('client mode ignores internal fields even if present in the payload', () => {
    const report = makeReport({
      internal: {
        stage_counts: [{ stage: 'Creative Internal Review', count: 2 }],
        internal_review: 2,
        workload_by_owner: [{ label: 'Creative', count: 2 }],
        workload_by_assignee: [{ label: 'Ali', count: 2 }],
      },
    });
    const { container } = render(<ContentCalendarReportView report={report} />);
    expect(container.textContent).not.toMatch(/Creative Internal Review|Ali/);
  });

  it('internal version is its own detailed staff report, not the client report', () => {
    render(<ContentCalendarReportView report={makeReport({ audience: 'internal', internal: makeInternal() })} />);
    expect(screen.getByText(/Do not send to the client/)).toBeTruthy();
    expect(screen.getAllByText('Internal report').length).toBeGreaterThan(0);
    // None of the client sections.
    expect(screen.queryByTestId('cc-report-summary')).toBeNull();
    expect(screen.queryByTestId('cc-report-by-type')).toBeNull();
    expect(screen.queryByText('Awaiting your review')).toBeNull();
    expect(screen.queryByText('Behind the Factory Floor')).toBeNull();
    // Real stage names with team, age and stuck counts.
    const stages = screen.getByTestId('cc-internal-stage-table');
    const prod = within(stages).getByText('Creative Production').closest('tr')!;
    expect(within(prod).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Creative Production', 'Creative', '1', '19', '19', '1', '1']);
    expect(screen.getByTestId('cc-internal-stages').textContent).toMatch(/days since the item was last updated/);
    // Assignees with assigned / done / overdue.
    const sara = within(screen.getByTestId('cc-internal-team-table')).getByText('Sara Design').closest('tr')!;
    expect(within(sara).getAllByRole('cell').slice(0, 5).map((c) => c.textContent)).toEqual(['Sara Design', '1', '1', '0', '1']);
    // Overdue list with assignee and days overdue.
    const od = within(screen.getByTestId('cc-internal-overdue-table')).getByText('Diwali Offer Banner').closest('tr')!;
    expect(od.textContent).toMatch(/Sara Design/);
    expect(od.textContent).toMatch(/Due 14 Nov/);
    expect(within(od).getAllByRole('cell').pop()!.textContent).toBe('6');
    expect(within(screen.getByTestId('cc-internal-stuck-table')).getByText('19')).toBeTruthy();
    // Plan vs posted with organic / ad split, revisions, full list.
    const st = within(screen.getByTestId('cc-internal-plan-table')).getByText('Static').closest('tr')!;
    expect(within(st).getAllByRole('cell').slice(1, 7).map((c) => c.textContent)).toEqual(['3', '2', '1', '1', '2', '1']);
    expect(within(screen.getByTestId('cc-internal-category-table')).getByText('Ad creative')).toBeTruthy();
    expect(screen.getByTestId('cc-internal-revisions').textContent).toMatch(/In creative revision now1/);
    const all = screen.getByTestId('cc-internal-items-table');
    expect(within(all).getByText('Black Friday Teaser Reel')).toBeTruthy();
    expect(within(all).getAllByText('Creative Revision').length).toBe(1);
  });

  it('internal payload is never shown in the client portal', () => {
    const { container } = render(
      <ContentCalendarReportView clientOnly report={makeReport({ audience: 'internal', internal: makeInternal() })} />,
    );
    const text = container.textContent || '';
    for (const re of INTERNAL_WORDS) expect(text).not.toMatch(re);
    expect(text).not.toMatch(/Sara Design|Ali Khan|Diwali Offer Banner/);
    expect(screen.getByText('Client report')).toBeTruthy();
  });

  it('internal view without the detail block shows a notice instead of client sections', () => {
    render(<ContentCalendarReportView report={makeReport({ audience: 'internal' })} />);
    expect(screen.getByText(/internal detail isn't available/)).toBeTruthy();
    expect(screen.queryByTestId('cc-report-summary')).toBeNull();
  });

  it('shows the no-plan state and note only when has_plan is false', () => {
    const { rerender } = render(
      <ContentCalendarReportView
        report={makeReport({ has_plan: false, summary: { ...makeReport().summary, planned: 0, delivered: 0, left: 0, percent: null } })}
      />,
    );
    expect(screen.getByText('No monthly plan set for this client')).toBeTruthy();
    expect(screen.getByText('No monthly plan is set for this client yet.')).toBeTruthy();

    rerender(<ContentCalendarReportView report={makeReport({ has_plan: true })} />);
    expect(screen.queryByText('No monthly plan is set for this client yet.')).toBeNull();
  });

  it('uses the small authorized thumb URL for uploads', () => {
    const src = reportThumbSrc({ kind: 'image', url: '/uploads/content_calendar/p1/a.jpg', thumbnail_url: null });
    expect(src).toMatch(/\/thumbs\/content_calendar\/p1\/a\.jpg\?w=200$/);
    expect(reportThumbSrc({ kind: 'link', url: 'javascript:alert(1)' })).toBe('');
  });

  it('month helpers wrap years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthLabel('2026-11')).toBe('November 2026');
  });
});

const getReport = vi.fn();
vi.mock('../../../../services/contentCalendarService', () => ({
  contentCalendarService: { getReport: (...a: unknown[]) => getReport(...a) },
}));
vi.mock('../../../../hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [{ id: 'ws_sp', name: 'SP Builders', status: 'active' }] }),
}));

describe('ContentCalendarReportDialog', () => {
  beforeEach(() => getReport.mockReset());

  it('client mode always asks for the client version and has no version switch', async () => {
    getReport.mockResolvedValue(makeReport());
    const { ContentCalendarReportDialog } = await import('../ContentCalendarReportDialog');
    render(<ContentCalendarReportDialog open mode="client" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cc-report')).toBeTruthy());
    expect(getReport).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws_sp', audience: 'client' }));
    expect(screen.queryByRole('group', { name: 'Report version' })).toBeNull();
  });

  it('staff can switch to the internal version; Download PDF prints', async () => {
    getReport.mockResolvedValue(makeReport());
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { ContentCalendarReportDialog } = await import('../ContentCalendarReportDialog');
    render(<ContentCalendarReportDialog open mode="staff" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cc-report')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Internal' }));
    await waitFor(() =>
      expect(getReport).toHaveBeenLastCalledWith(expect.objectContaining({ audience: 'internal' })),
    );
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
