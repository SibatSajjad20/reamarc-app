import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getItems, mockConfirm, invalidationHandlers } = vi.hoisted(() => {
  const getItems = vi.fn((_f?: { search?: string }) => Promise.resolve({ items: [], total: 0, stages_count: {} }));
  const mockConfirm = vi.fn();
  const invalidationHandlers: (() => void)[] = [];
  return { getItems, mockConfirm, invalidationHandlers };
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
vi.mock('../../ui/ConfirmProvider', () => ({ useConfirm: () => mockConfirm }));
vi.mock('../../../hooks/useWorkspaces', () => ({ useWorkspaces: () => ({ workspaces: [] }) }));
vi.mock('../../../utils/cacheBus', async (orig) => ({
  ...(await orig<object>()),
  useCacheInvalidation: (_k: string[], fn: () => void) => { invalidationHandlers.push(fn); },
}));
vi.mock('../../content-calendar/ContentCalendarTableView', async () => {
  const R = await import('react');
  return {
    ContentCalendarTableView: () => R.createElement('div', { 'data-testid': 'table-view' }, 'Table View'),
  };
});
vi.mock('../../content-calendar/ContentCalendarPipelineView', () => ({ ContentCalendarPipelineView: () => null }));
vi.mock('../../content-calendar/ContentCalendarMonthWeekView', () => ({ ContentCalendarMonthWeekView: () => null }));
vi.mock('../../content-calendar/overview/ContentCalendarOverviewTab', () => ({ ContentCalendarOverviewTab: () => null }));
vi.mock('../../content-calendar/ContentCalendarDrawer', () => ({ ContentCalendarDrawer: () => null }));
vi.mock('../../content-calendar/ContentCalendarModal', () => ({ ContentCalendarModal: () => null }));
vi.mock('../../content-calendar/ContentCalendarImportModal', () => ({ ContentCalendarImportModal: () => null }));

vi.mock('../../content-calendar/settings/ContentCalendarSettingsTab', () => ({
  ContentCalendarSettingsTab: ({ onDirtyChange }: { onDirtyChange?: (d: boolean) => void }) => {
    return (
      <div data-testid="cc-settings-tab">
        <button data-testid="make-dirty-btn" onClick={() => onDirtyChange?.(true)}>
          Make Dirty
        </button>
        <button data-testid="make-clean-btn" onClick={() => onDirtyChange?.(false)}>
          Make Clean
        </button>
      </div>
    );
  },
}));

(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
import { ContentCalendarView } from '../ContentCalendarView';

describe('ContentCalendarView settings dirty guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockReset();
    localStorage.setItem('reamarc_cc_view_mode', 'settings');
  });

  it('asserts Row 2 (search/filters) is not rendered while on Settings', async () => {
    render(<ContentCalendarView />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    // Row 2 search input must not be rendered on Settings
    expect(screen.queryByPlaceholderText('Search serial, copy, concept...')).toBeNull();
  });

  it('dirty Settings + click "Sheet" -> confirm shown; cancel keeps Settings', async () => {
    mockConfirm.mockResolvedValueOnce(false);
    render(<ContentCalendarView />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    // Mark dirty
    fireEvent.click(screen.getByTestId('make-dirty-btn'));

    // Click "Sheet"
    const sheetBtn = screen.getByText('Sheet').closest('button')!;
    await act(async () => {
      fireEvent.click(sheetBtn);
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0].title).toBe('Discard unsaved changes?');

    // Canceling keeps Settings tab active
    expect(screen.getByTestId('cc-settings-tab')).toBeTruthy();
    expect(screen.queryByTestId('table-view')).toBeNull();
    expect(screen.queryByPlaceholderText('Search serial, copy, concept...')).toBeNull();
  });

  it('dirty Settings + click "Sheet" -> confirm -> Sheet', async () => {
    mockConfirm.mockResolvedValueOnce(true);
    render(<ContentCalendarView />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    // Mark dirty
    fireEvent.click(screen.getByTestId('make-dirty-btn'));

    // Click "Sheet"
    const sheetBtn = screen.getByText('Sheet').closest('button')!;
    await act(async () => {
      fireEvent.click(sheetBtn);
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0].title).toBe('Discard unsaved changes?');

    // Confirm transitions to Sheet (table view) and renders Row 2
    await waitFor(() => {
      expect(screen.queryByTestId('cc-settings-tab')).toBeNull();
      expect(screen.getByTestId('table-view')).toBeTruthy();
      expect(screen.getByPlaceholderText('Search serial, copy, concept...')).toBeTruthy();
    });
  });
});
