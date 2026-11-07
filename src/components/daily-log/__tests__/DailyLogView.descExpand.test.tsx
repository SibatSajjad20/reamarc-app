import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyLogColumn, DailyLogEntry } from '../../../types/dailyLog';
import { dailyLogViewCache } from '../../../utils/dailyLogViewCache';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = MockResizeObserver;
}

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 44,
        end: (index + 1) * 44,
        size: 44,
      })),
    getTotalSize: () => count * 44,
    measure: vi.fn(),
    measureElement: vi.fn(),
  }),
}));

vi.mock('../../../context/ModuleLoadGate', () => ({
  useModuleLoadGate: vi.fn(),
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      role: 'admin',
      name: 'Admin',
      full_name: 'Admin User',
      permissions: {},
    },
  }),
}));

vi.mock('../../ui/ConfirmProvider', () => ({
  useConfirm: () => vi.fn(async () => true),
}));

vi.mock('../../../hooks/useOffDays', () => ({
  useOffDays: () => ({
    getOffDay: () => ({ isOff: false }),
    holidays: new Set(),
    workingSaturdays: new Set(),
  }),
}));

vi.mock('../../../utils/cacheBus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/cacheBus')>();
  return {
    ...actual,
    useCacheInvalidation: vi.fn(),
  };
});

vi.mock('../DailyLogModal', () => ({
  DailyLogModal: () => null,
}));

const LONG_DESC =
  'Line one of a very long daily log task description that must wrap.\nLine two continues the story.\nLine three and four exist so the cell clamp cannot show everything at once without a dialog.';

const COLUMNS: DailyLogColumn[] = [
  { key: 'date', label: 'Date', type: 'date', editable: true, width: '130' },
  { key: 'resource_name', label: 'Resource Name', type: 'text', editable: true, width: '160' },
  { key: 'client_project', label: 'Client / Project', type: 'text', editable: true, width: '160' },
  { key: 'task_description', label: 'Task Description', type: 'text', editable: true, width: '280' },
  { key: 'task_status', label: 'Task Status', type: 'select', options: ['Completed'], editable: true, width: '150' },
];

function makeEntry(partial: Partial<DailyLogEntry> & { id: string }): DailyLogEntry {
  return {
    workspace_id: 'ws-1',
    version: 1,
    date: '2026-11-07',
    resource_name: 'Alex',
    role: 'Team Member',
    department: 'creative',
    client_project: 'Acme Launch',
    task_description: 'Short',
    task_type: 'Scheduled Task',
    task_status: 'Completed',
    revisions_done: '',
    deliverables: '',
    hours_utilized: 2,
    month_sheet: 'November - 2026',
    ...partial,
  };
}

const mockEntries: DailyLogEntry[] = [
  makeEntry({ id: 'row-default', task_description: LONG_DESC }),
  makeEntry({
    id: 'row-tall',
    client_project: 'Tall Project',
    task_description: 'Tall row description that should wrap without a two-line clamp.',
  }),
];

const { mockGetAllEntries } = vi.hoisted(() => ({
  mockGetAllEntries: vi.fn(),
}));

vi.mock('../../../services/dailyLogService', () => ({
  dailyLogService: {
    getSheets: vi.fn(async () => ['November - 2026']),
    getColumns: vi.fn(async () => COLUMNS),
    getAllEntries: (...args: unknown[]) => mockGetAllEntries(...args),
    getMyLogActivity: vi.fn(async () => null),
    getDayTarget: vi.fn(async () => null),
    deleteEntry: vi.fn(),
  },
}));

vi.mock('../../../services/logExceptionService', () => ({
  logExceptionService: { submitReason: vi.fn() },
}));

import { DailyLogView } from '../../views/DailyLogView';

const queryHidden = { hidden: true } as const;

async function renderSheet() {
  render(<DailyLogView />);
  await screen.findByText('Showing 2 entries', queryHidden);
}

describe('DailyLogView description expand and row resize', () => {
  beforeEach(() => {
    dailyLogViewCache.clearAllCaches();
    localStorage.clear();
    mockGetAllEntries.mockReset();
    mockGetAllEntries.mockResolvedValue(mockEntries);
  });

  it('clamps a long description and opens a dialog with the full text; Esc closes it', async () => {
    await renderSheet();

    const descButton = document.querySelector('[data-desc-expand="row-default"]') as HTMLButtonElement;
    expect(descButton).toBeTruthy();
    expect(descButton.className).toContain('line-clamp-2');
    expect(descButton.textContent).toBe(LONG_DESC);

    fireEvent.click(descButton);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(LONG_DESC);
    expect(dialog.querySelector('.whitespace-pre-wrap')).toBeTruthy();
    expect(dialog.textContent).toContain('Acme Launch');
    expect(dialog.textContent).toContain('2026-11-07');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('resizes only the dragged row, saves height, and clamps to 34–200px', async () => {
    await renderSheet();

    const handleA = document.querySelector('[data-row-resize-handle="row-default"]') as HTMLElement;
    const handleB = document.querySelector('[data-row-resize-handle="row-tall"]') as HTMLElement;
    expect(handleA).toBeTruthy();
    expect(handleB).toBeTruthy();

    fireEvent.mouseDown(handleA, { clientY: 100 });
    fireEvent.mouseMove(document, { clientY: 160 });
    fireEvent.mouseUp(document);

    const rowA = handleA.closest('tr') as HTMLTableRowElement;
    const rowB = handleB.closest('tr') as HTMLTableRowElement;
    expect(rowA.style.height).toBe('104px');
    expect(rowB.style.height).toBe('44px');

    const saved = JSON.parse(localStorage.getItem('reamarc_daily_log_row_heights') || '{}');
    expect(saved['row-default']).toBe(104);
    expect(saved['row-tall']).toBeUndefined();

    fireEvent.mouseDown(handleA, { clientY: 100 });
    fireEvent.mouseMove(document, { clientY: 800 });
    fireEvent.mouseUp(document);
    expect(rowA.style.height).toBe('200px');

    fireEvent.mouseDown(handleA, { clientY: 100 });
    fireEvent.mouseMove(document, { clientY: -400 });
    fireEvent.mouseUp(document);
    expect(rowA.style.height).toBe('34px');
  });

  it('drops line-clamp-2 on a tall saved row and keeps it on a default row', async () => {
    localStorage.setItem('reamarc_daily_log_row_heights', JSON.stringify({ 'row-tall': 120 }));
    await renderSheet();

    const defaultDesc = document.querySelector('[data-desc-expand="row-default"]') as HTMLButtonElement;
    const tallDesc = document.querySelector('[data-desc-expand="row-tall"]') as HTMLButtonElement;

    expect(defaultDesc.className).toContain('line-clamp-2');
    expect(tallDesc.className).not.toContain('line-clamp-2');
    expect(tallDesc.className).toContain('whitespace-pre-wrap');
  });

  it('still renders a column resize handle', async () => {
    await renderSheet();
    expect(document.querySelector('.cursor-col-resize')).toBeTruthy();
  });
});
