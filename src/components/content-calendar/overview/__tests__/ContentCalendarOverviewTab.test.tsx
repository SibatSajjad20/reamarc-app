import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ContentCalendarItem } from '../../../../types/contentCalendar';
import { ContentCalendarOverviewTab } from '../ContentCalendarOverviewTab';
import { itemMatchesDrill, type OverviewDrill } from '../../../../utils/contentCalendarOverviewMatrix';

let mockUser: { id: string; role: string; department?: string; departments?: string[] } = {
  id: 'u1',
  role: 'admin',
};

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

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

  it('shows only the five group-by chips', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Group by' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Creative type', 'Channel', 'Organic vs ad', 'Scheduled vs runtime', 'Assignee',
    ]);
    for (const gone of ['Pillar', 'Campaign', 'Offer']) expect(within(group).queryByRole('button', { name: gone })).toBeNull();
  });

  it('a stale saved dimension falls back to creative type and still drills', () => {
    localStorage.setItem('reamarc_cc_overview_dimension', 'pillar');
    const props = setup();
    expect(screen.getByRole('button', { name: 'Creative type' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(screen.getByTestId('cc-overview-matrix-table')).getByTestId('cell-Video-posted'));
    expect((props.onDrill.mock.calls[0][0] as OverviewDrill).dimension).toBe('creative_type');
    fireEvent.click(screen.getByRole('button', { name: 'Assignee' }));
    expect(localStorage.getItem('reamarc_cc_overview_dimension')).toBe('assignee');
  });

  it('plan table breaks a client plan down by creative type and can collapse it', () => {
    const planned = [
      { id: 'ws1', name: 'Example Co', content_expectations: { period: 'month', lines: [
        { creative_type: 'Video', expected: 4 },
        { creative_type: 'Static', expected: 2, expected_max: 3 },
      ] } },
      { id: 'ws2', name: 'No Plan Co', content_expectations: null },
    ];
    setup({
      activeClients: planned as never,
      items: [...items, mk('Posted', { publish_date: '2026-11-09', workspace_id: 'ws2', client_name: 'No Plan Co' })],
    });
    const table = screen.getByTestId('cc-plan-table');
    const video = within(table).getByTestId('cc-plan-type-ws1-video');
    expect(within(video).getAllByRole('cell').map((c) => c.textContent)).toEqual(
      ['Video', '4', '1', '2', '3', '25%', 'At risk', '1 more to create'],
    );
    const stat = within(table).getByTestId('cc-plan-type-ws1-static');
    expect(within(stat).getAllByRole('cell').slice(1, 6).map((c) => c.textContent)).toEqual(['2–3', '1', '0', '1', '50%']);
    // No plan: just the total row, no type rows and no expand control.
    const noPlan = within(table).getByTestId('cc-plan-client-ws2');
    expect(within(noPlan).getAllByRole('row')).toHaveLength(1);
    expect(within(noPlan).queryByRole('button', { name: /creative types/ })).toBeNull();
    fireEvent.click(within(table).getByRole('button', { name: 'Hide creative types for Example Co' }));
    expect(within(table).queryByTestId('cc-plan-type-ws1-video')).toBeNull();
    fireEvent.click(screen.getByTestId('cc-plan-toggle-all'));
    expect(within(table).getByTestId('cc-plan-type-ws1-video')).toBeTruthy();
    // Mobile cards carry the same breakdown.
    expect(within(screen.getByTestId('cc-plan-types-ws1')).getByText('Static')).toBeTruthy();
  });

  it('editor sees cc-plan-edit and cc-plan-set-<id> and they call onOpenSettings with id', () => {
    mockUser = { id: 'admin1', role: 'admin' };
    const onOpenSettings = vi.fn();
    const planned = [
      { id: 'ws1', name: 'Example Co', content_expectations: { period: 'month', lines: [{ creative_type: 'Video', expected: 4 }] } },
      { id: 'ws2', name: 'No Plan Co', content_expectations: null },
    ];
    setup({
      activeClients: planned as never,
      items: [...items, mk('Posted', { publish_date: '2026-11-09', workspace_id: 'ws2', client_name: 'No Plan Co' })],
      onOpenSettings,
    });

    const editBtn = screen.getByTestId('cc-plan-edit');
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn);
    expect(onOpenSettings).toHaveBeenCalledWith();

    const setPlanBtns = screen.getAllByTestId('cc-plan-set-ws2');
    expect(setPlanBtns.length).toBeGreaterThan(0);
    fireEvent.click(setPlanBtns[0]);
    expect(onOpenSettings).toHaveBeenCalledWith('ws2');
  });

  it('non-editor sees neither cc-plan-edit nor cc-plan-set-<id>', () => {
    mockUser = { id: 'member1', role: 'team_member' };
    const onOpenSettings = vi.fn();
    const planned = [
      { id: 'ws1', name: 'Example Co', content_expectations: { period: 'month', lines: [{ creative_type: 'Video', expected: 4 }] } },
      { id: 'ws2', name: 'No Plan Co', content_expectations: null },
    ];
    setup({
      activeClients: planned as never,
      items: [...items, mk('Posted', { publish_date: '2026-11-09', workspace_id: 'ws2', client_name: 'No Plan Co' })],
      onOpenSettings,
    });

    expect(screen.queryByTestId('cc-plan-edit')).toBeNull();
    expect(screen.queryByTestId('cc-plan-set-ws2')).toBeNull();
  });

  it('non-editor tapping the mobile card body calls onSelectClientFilter', () => {
    mockUser = { id: 'member1', role: 'team_member' };
    const onSelectClientFilter = vi.fn();
    const planned = [
      { id: 'ws1', name: 'Example Co', content_expectations: { period: 'month', lines: [{ creative_type: 'Video', expected: 4 }] } },
      { id: 'ws2', name: 'No Plan Co', content_expectations: null },
    ];
    setup({
      activeClients: planned as never,
      items: [...items, mk('Posted', { publish_date: '2026-11-09', workspace_id: 'ws2', client_name: 'No Plan Co' })],
      onSelectClientFilter,
    });

    const cards = screen.getByTestId('cc-plan-cards');
    const noPlanBtn = within(cards).getByRole('button', { name: /No Plan Co/i });
    fireEvent.click(noPlanBtn);
    expect(onSelectClientFilter).toHaveBeenCalledWith('No Plan Co');

    const exampleBtn = within(cards).getByRole('button', { name: /Example Co/i });
    fireEvent.click(exampleBtn);
    expect(onSelectClientFilter).toHaveBeenCalledWith('Example Co');
  });
});
