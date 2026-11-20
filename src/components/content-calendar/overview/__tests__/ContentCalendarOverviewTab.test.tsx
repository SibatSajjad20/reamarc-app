import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ContentCalendarItem } from '../../../../types/contentCalendar';
import { ContentCalendarOverviewTab } from '../ContentCalendarOverviewTab';
import { itemMatchesDrill, type OverviewDrill } from '../../../../utils/contentCalendarOverviewMatrix';

const NOW = new Date(2026, 10, 20, 12);
let n = 0;
const mk = (stage: string, extra: Partial<ContentCalendarItem> = {}) =>
  ({
    id: `x${++n}`, serial: `S-${n}`, client_name: 'Example Co', workspace_id: 'ws1', campaign_type: 'Launch',
    creative_type: 'Video', content_type: 'Scheduled', creative_category: 'Organic Creative', content_pillar: 'Product',
    content_concept: `Concept ${n}`, offer: '', cta: '', approval_status: '', setup_status: '',
    stage, publish_date: '2026-11-25', channels: ['instagram'], created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-18T00:00:00Z', ...extra,
  }) as ContentCalendarItem;

const items = [
  mk('Posted', { publish_date: '2026-11-02' }),
  mk('Posted', { publish_date: '2026-11-04', creative_type: 'Static', channels: ['facebook'] }),
  mk('Creative Client Review', { publish_date: '2026-11-23' }),
  mk('Content', { publish_date: '2026-11-28', design_due: '2026-11-17', assignee_name: 'Aisha' }),
  mk('Posted', { publish_date: '2026-10-12' }),
];
const clients = [{ id: 'ws1', name: 'Example Co', content_expectations: { period: 'month', lines: [{ creative_type: 'Video', expected: 4 }] } }];

function setup(extra: Partial<React.ComponentProps<typeof ContentCalendarOverviewTab>> = {}) {
  const onDrill = vi.fn<(d: OverviewDrill) => void>();
  const onShowOverdue = vi.fn();
  const props = {
    items, activeClients: clients as never, isLoading: false, activeClientFilter: 'all',
    onSelectClientFilter: vi.fn(), onSwitchViewMode: vi.fn(), onSelectItem: vi.fn(), onRefresh: vi.fn(),
    now: NOW, ...extra,
  };
  render(<ContentCalendarOverviewTab {...props} onDrill={onDrill} onShowOverdue={onShowOverdue} />);
  return { ...props, onDrill, onShowOverdue };
}

describe('ContentCalendarOverviewTab', () => {
  beforeEach(() => localStorage.clear());

  it('shows KPIs for this month and the plan ring', () => {
    setup();
    const kpis = screen.getByTestId('cc-overview-kpis');
    expect(within(kpis).getByText('Posted vs plan')).toBeTruthy();
    expect(within(kpis).getByText('of 4')).toBeTruthy();
    expect(within(screen.getByTestId('kpi-awaiting')).getByText('1')).toBeTruthy();
    expect(within(screen.getByTestId('kpi-overdue')).getByText('1')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Generate report/ })).toBeTruthy();
  });

  it('clicking a matrix cell drills into the sheet with value + bucket + period', () => {
    const props = setup();
    const table = screen.getByTestId('cc-overview-matrix-table');
    fireEvent.click(within(table).getByTestId('cell-Video-posted'));
    expect(props.onDrill).toHaveBeenCalledTimes(1);
    const drill = props.onDrill.mock.calls[0][0] as OverviewDrill;
    expect(drill).toMatchObject({ dimension: 'creative_type', value: 'Video', bucket: 'posted', range: { start: '2026-11-01', end: '2026-11-30' } });
    expect(drill.label).toBe('Creative type: Video · Posted · This month');
    // The sheet filter keeps exactly the item counted in that cell (the October one is out of period).
    expect(items.filter((i) => itemMatchesDrill(i, drill)).map((i) => i.id)).toEqual([items[0].id]);
  });

  it('switches dimension and drills on a channel row', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Channel' }));
    const table = screen.getByTestId('cc-overview-matrix-table');
    expect(within(table).getByText('Facebook')).toBeTruthy();
    expect(within(table).queryByText('Expected')).toBeNull(); // plan column only for creative type
    fireEvent.click(within(table).getByTestId('cell-Facebook-posted'));
    expect((props.onDrill.mock.calls[0][0] as OverviewDrill)).toMatchObject({ dimension: 'channel', value: 'Facebook', bucket: 'posted' });
  });

  it('All time removes the period from the drill and hides the plan', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(screen.getByText('Plan shows for a single month')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('cc-overview-matrix-table')).getByTestId('cell-Video-posted'));
    const drill = props.onDrill.mock.calls[0][0] as OverviewDrill;
    expect(drill.range).toBeNull();
    expect(items.filter((i) => itemMatchesDrill(i, drill)).length).toBe(2);
    expect(localStorage.getItem('reamarc_cc_overview_period')).toBe('all');
  });

  it('overdue KPI opens the overdue sheet', () => {
    const props = setup();
    expect(screen.getByTestId('kpi-overdue').tagName).toBe('BUTTON');
    fireEvent.click(screen.getByTestId('kpi-overdue'));
    expect(props.onShowOverdue).toHaveBeenCalled();
  });
});
