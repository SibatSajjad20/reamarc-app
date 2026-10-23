import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Resp = { items: { id: string; serial: string; stage: string }[]; total: number; stages_count: Record<string, number> };
const { pending, getItems, invalidationHandlers } = vi.hoisted(() => {
  const pending: { search: string; resolve: (r: any) => void }[] = [];
  const getItems = vi.fn((filter: { search?: string }) => new Promise<any>((resolve) => pending.push({ search: filter?.search || '', resolve })));
  const invalidationHandlers: (() => void)[] = [];
  return { pending, getItems, invalidationHandlers };
});

vi.mock('../../../services/contentCalendarService', () => ({
  contentCalendarService: {
    getItems: (f: { search?: string }) => getItems(f),
    getCachedItems: () => undefined,
    setCachedItems: () => undefined,
    hasInitialCache: () => false,
    getCachedConstants: () => undefined,
    setCachedConstants: () => undefined,
    getConstants: async () => ({ pipeline_stages: [], creative_types: [], platforms: [] }),
  },
}));
vi.mock('../../../context/ModuleLoadGate', () => ({ useModuleLoadGate: () => undefined }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ addToast: () => undefined }) }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u', role: 'admin', permissions: {} } }) }));
vi.mock('../../../hooks/useWorkspaces', () => ({ useWorkspaces: () => ({ workspaces: [] }) }));
vi.mock('../../../utils/cacheBus', async (orig) => ({
  ...(await orig<object>()),
  useCacheInvalidation: (_k: string[], fn: () => void) => { invalidationHandlers.push(fn); },
}));
vi.mock('../../content-calendar/ContentCalendarTableView', async () => {
  const R = await import('react');
  return {
    ContentCalendarTableView: ({ items }: { items: { id: string; serial: string }[] }) =>
      R.createElement('ul', { 'data-testid': 'rows' }, items.map((i) => R.createElement('li', { key: i.id }, i.serial))),
  };
});
vi.mock('../../content-calendar/ContentCalendarPipelineView', async () => {
  const R = await import('react');
  return {
    ContentCalendarPipelineView: ({ items }: { items: { id: string; serial: string }[] }) =>
      R.createElement('ul', { 'data-testid': 'rows' }, items.map((i) => R.createElement('li', { key: i.id }, i.serial))),
  };
});
vi.mock('../../content-calendar/ContentCalendarMonthWeekView', () => ({ ContentCalendarMonthWeekView: () => null }));
vi.mock('../../content-calendar/overview/ContentCalendarOverviewTab', () => ({ ContentCalendarOverviewTab: () => null }));
vi.mock('../../content-calendar/ContentCalendarDrawer', () => ({ ContentCalendarDrawer: () => null }));
vi.mock('../../content-calendar/ContentCalendarModal', () => ({ ContentCalendarModal: () => null }));
vi.mock('../../content-calendar/ContentCalendarImportModal', () => ({ ContentCalendarImportModal: () => null }));

(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
import { ContentCalendarView } from '../ContentCalendarView';

const resp = (...serials: string[]): Resp => ({
  items: serials.map((s) => ({ id: s, serial: s, stage: 'Creative Production' })),
  total: serials.length,
  stages_count: {},
});
const shown = () => Array.from(screen.getByTestId('rows').querySelectorAll('li')).map((l) => l.textContent);

describe('content calendar board while requests are in flight', () => {
  beforeEach(() => {
    pending.length = 0;
    invalidationHandlers.length = 0;
    getItems.mockClear();
    localStorage.setItem('reamarc_cc_view_mode', 'table');
  });

  it('typing a search quickly: the slow first answer must not replace the newer one', async () => {
    render(<ContentCalendarView />);
    await waitFor(() => expect(pending.length).toBe(1));
    await act(async () => pending[0].resolve(resp('CC-1', 'CC-2', 'CC-3')));
    await waitFor(() => expect(shown()).toEqual(['CC-1', 'CC-2', 'CC-3']));

    const box = screen.getByPlaceholderText('Search serial, copy, concept...');
    fireEvent.change(box, { target: { value: 'eid' } });
    await waitFor(() => expect(pending.length).toBe(2), { timeout: 2000 });
    fireEvent.change(box, { target: { value: 'eid reel' } });
    await waitFor(() => expect(pending.length).toBe(3), { timeout: 2000 });

    await act(async () => pending[2].resolve(resp('CC-7')));       // newer answer first
    await waitFor(() => expect(shown()).toEqual(['CC-7']));
    await act(async () => pending[1].resolve(resp('CC-1', 'CC-7'))); // slow older answer last
    await new Promise((r) => setTimeout(r, 50));
    expect(shown()).toEqual(['CC-7']);
  });

  it('background reload after a save: an older list must not undo the move', async () => {
    render(<ContentCalendarView />);
    await waitFor(() => expect(pending.length).toBe(1));
    // two reloads: one started before the save, one after (invalidation)
    act(() => invalidationHandlers[invalidationHandlers.length - 1]());
    await waitFor(() => expect(pending.length).toBe(2));
    await act(async () => pending[1].resolve(resp('CC-1-moved')));
    await waitFor(() => expect(shown()).toEqual(['CC-1-moved']));
    await act(async () => pending[0].resolve(resp('CC-1-old')));
    await new Promise((r) => setTimeout(r, 50));
    expect(shown()).toEqual(['CC-1-moved']);
  });
});
