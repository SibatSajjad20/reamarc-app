import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TaskManagerView } from '../TaskManagerView';
import { taskService } from '@/services/taskService';
import { taskManagerViewCache } from '@/utils/taskManagerViewCache';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin', role: 'admin', full_name: 'Admin' } }),
}));
vi.mock('@/hooks/useTaskCounts', () => ({
  useTaskCounts: () => ({ counts: null, canSeeTasks: true, refresh: vi.fn() }),
}));
vi.mock('@/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [] }),
}));
vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));
const { mockPrompt } = vi.hoisted(() => ({ mockPrompt: vi.fn() }));
vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => vi.fn(),
  usePrompt: () => mockPrompt,
}));
vi.mock('@/services/taskService', () => ({
  taskService: {
    getAllTasks: vi.fn(),
    getCounts: vi.fn(),
    getAssignable: vi.fn(),
    getSavedViews: vi.fn(),
    createSavedView: vi.fn(),
    getOverview: vi.fn(),
    getFollowUp: vi.fn(),
    changeStage: vi.fn(),
  },
}));

function renderTasks() {
  return render(
    <TooltipProvider>
      <TaskManagerView />
    </TooltipProvider>,
  );
}

describe('TaskManagerView pipeline', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    taskManagerViewCache.clearAll();
    vi.mocked(taskService.getAllTasks).mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, stage_counts: {} } as any);
    vi.mocked(taskService.getCounts).mockResolvedValue({
      todo: 0,
      in_progress: 0,
      in_review: 0,
      completed: 0,
      cancelled: 0,
      overdue: 0,
      today: 0,
      upcoming: 0,
      no_due: 0,
      blocked: 0,
      open: 0,
    } as any);
    vi.mocked(taskService.getAssignable).mockResolvedValue({ items: [] } as any);
    vi.mocked(taskService.getSavedViews).mockResolvedValue({ items: [] } as any);
    vi.mocked(taskService.getOverview).mockResolvedValue({ counts: {}, people: [], departments: [] } as any);
    vi.mocked(taskService.getFollowUp).mockResolvedValue({} as any);
    vi.mocked(taskService.createSavedView).mockResolvedValue({ id: 'sv1', name: 'Board', view: 'kanban', filters: {} } as any);
    mockPrompt.mockResolvedValue('Board');
  });

  it('renames the switcher to Task pipeline and keeps the kanban storage key', async () => {
    const { unmount } = renderTasks();
    await waitFor(() => expect(screen.getByText('Task pipeline')).toBeTruthy());
    const header = screen.getByTestId('task-manager-view').querySelector('.relative.z-40');
    expect(header?.textContent || '').not.toMatch(/\bKanban\b/);
    fireEvent.click(screen.getByText('Task pipeline'));
    expect(localStorage.getItem('reamarc_tasks_view_mode')).toBe('kanban');
    unmount();

    localStorage.setItem('reamarc_tasks_view_mode', 'kanban');
    renderTasks();
    await waitFor(() => expect(screen.getByTestId('task-kanban-view')).toBeTruthy());

    fireEvent.click(screen.getByText('Save view'));
    await waitFor(() =>
      expect(taskService.createSavedView).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'kanban' }),
      ),
    );
  });

  it('persists density in localStorage and hides the toggle off the board', async () => {
    const first = renderTasks();
    await waitFor(() => expect(screen.getByText('List')).toBeTruthy());
    expect(screen.queryByLabelText('Board density')).toBeNull();
    fireEvent.click(screen.getByText('Task pipeline'));
    await waitFor(() => expect(screen.getByLabelText('Board density')).toBeTruthy());
    fireEvent.click(screen.getByText('Compact'));
    expect(localStorage.getItem('reamarc_tasks_board_density')).toBe('compact');
    first.unmount();

    const second = renderTasks();
    await waitFor(() => expect(screen.getByTestId('task-kanban-view')).toBeTruthy());
    expect(localStorage.getItem('reamarc_tasks_board_density')).toBe('compact');
    second.unmount();

    localStorage.setItem('reamarc_tasks_board_density', 'nope');
    localStorage.setItem('reamarc_tasks_view_mode', 'kanban');
    const third = renderTasks();
    await waitFor(() => expect(screen.getByLabelText('Board density')).toBeTruthy());
    fireEvent.click(screen.getByText('List'));
    expect(screen.queryByLabelText('Board density')).toBeNull();
    fireEvent.click(screen.getByText('Calendar'));
    expect(screen.queryByLabelText('Board density')).toBeNull();
    third.unmount();
  });

  it('keeps the same service calls as base when toggling density', async () => {
    localStorage.setItem('reamarc_tasks_view_mode', 'kanban');
    renderTasks();
    await waitFor(() => expect(taskService.getAllTasks).toHaveBeenCalledTimes(1));
    expect(taskService.getCounts).toHaveBeenCalledTimes(1);
    expect(taskService.getAssignable).toHaveBeenCalledTimes(1);
    expect(taskService.getSavedViews).toHaveBeenCalledTimes(1);
    const afterLoad = {
      all: vi.mocked(taskService.getAllTasks).mock.calls.length,
      counts: vi.mocked(taskService.getCounts).mock.calls.length,
      assignable: vi.mocked(taskService.getAssignable).mock.calls.length,
      views: vi.mocked(taskService.getSavedViews).mock.calls.length,
    };
    fireEvent.click(screen.getByText('Compact'));
    expect(vi.mocked(taskService.getAllTasks).mock.calls.length).toBe(afterLoad.all);
    fireEvent.click(screen.getByText('List'));
    await waitFor(() => expect(vi.mocked(taskService.getAllTasks).mock.calls.length).toBeGreaterThan(afterLoad.all));
    const afterList = vi.mocked(taskService.getAllTasks).mock.calls.length;
    fireEvent.click(screen.getByText('Task pipeline'));
    await waitFor(() => expect(vi.mocked(taskService.getAllTasks).mock.calls.length).toBeGreaterThan(afterList));
  });

  it('shows KanbanSkeleton while the pipeline view is loading', () => {
    vi.mocked(taskService.getAllTasks).mockImplementation(() => new Promise(() => {}));
    localStorage.setItem('reamarc_tasks_view_mode', 'kanban');
    renderTasks();
    expect(screen.getByTestId('task-module-skeleton')).toBeTruthy();
  });

  it('collapses scope chips into a labelled dropdown and keeps filter URLs/state', async () => {
    renderTasks();
    await waitFor(() => expect(screen.getByTestId('task-scope-select')).toBeTruthy());
    const trigger = screen.getByTestId('task-scope-select');
    expect(trigger.getAttribute('aria-label')).toBe('Task scope: All visible');
    expect(trigger.textContent).toMatch(/All visible/);
    expect(screen.queryByRole('menuitemradio', { name: 'My tasks' })).toBeNull();
    expect(screen.queryByRole('menuitemradio', { name: 'Assigned by me' })).toBeNull();
    expect(screen.queryByRole('menuitemradio', { name: 'Created by me' })).toBeNull();
    expect(screen.queryByRole('menuitemradio', { name: 'Watching' })).toBeNull();

    fireEvent.pointerDown(trigger, { button: 0 });
    const options: { label: string; scope: string; testId: string }[] = [
      { label: 'My tasks', scope: 'mine', testId: 'task-scope-mine' },
      { label: 'Assigned by me', scope: 'assigned_by_me', testId: 'task-scope-assigned_by_me' },
      { label: 'Created by me', scope: 'created_by_me', testId: 'task-scope-created_by_me' },
      { label: 'Watching', scope: 'watching', testId: 'task-scope-watching' },
      { label: 'All visible', scope: 'all', testId: 'task-scope-all' },
    ];
    await waitFor(() => expect(screen.getByTestId('task-scope-mine')).toBeTruthy());
    for (const opt of options) {
      expect(screen.getByTestId(opt.testId).textContent).toMatch(opt.label);
    }

    fireEvent.click(screen.getByTestId('task-scope-mine'));
    await waitFor(() =>
      expect(taskService.getAllTasks).toHaveBeenCalledWith(expect.objectContaining({ scope: 'mine' })),
    );
    expect(screen.getByTestId('task-scope-select').textContent).toMatch(/My tasks/);

    fireEvent.pointerDown(screen.getByTestId('task-scope-select'), { button: 0 });
    await waitFor(() => expect(screen.getByTestId('task-scope-assigned_by_me')).toBeTruthy());
    fireEvent.click(screen.getByTestId('task-scope-assigned_by_me'));
    await waitFor(() =>
      expect(taskService.getAllTasks).toHaveBeenCalledWith(expect.objectContaining({ scope: 'assigned_by_me' })),
    );
  });

  it('puts colored summary counts on the shared toolbar for List, pipeline, Calendar, and Follow-up', async () => {
    vi.mocked(taskService.getCounts).mockResolvedValue({
      todo: 3,
      in_progress: 2,
      in_review: 1,
      completed: 0,
      cancelled: 0,
      overdue: 2,
      today: 0,
      upcoming: 0,
      no_due: 0,
      blocked: 4,
      open: 8,
    } as any);
    renderTasks();
    await waitFor(() => expect(screen.getByTestId('task-summary-counts')).toBeTruthy());

    const counts = screen.getByTestId('task-summary-counts');
    expect(counts.getAttribute('aria-label')).toBe('Task summary');
    expect(counts.textContent).not.toMatch(/·/);
    const open = screen.getByTestId('task-count-open');
    const overdue = screen.getByTestId('task-count-overdue');
    const blocked = screen.getByTestId('task-count-blocked');
    const inReview = screen.getByTestId('task-count-in-review');
    expect(open.textContent).toMatch(/8 open/);
    expect(overdue.textContent).toMatch(/2 overdue/);
    expect(blocked.textContent).toMatch(/4 blocked/);
    expect(inReview.textContent).toMatch(/1 in review/);
    expect(open.className).toMatch(/bg-accent-pill-bg/);
    expect(overdue.className).toMatch(/bg-danger-bg/);
    expect(blocked.className).toMatch(/bg-danger-bg/);
    expect(inReview.className).toMatch(/bg-info-bg/);

    const toolbar = counts.closest('.px-3') as HTMLElement;
    expect(toolbar.contains(screen.getByTestId('task-scope-select'))).toBe(true);
    expect(toolbar.textContent).toMatch(/Filter/);
    expect(toolbar.contains(screen.getByTestId('task-list-view'))).toBe(false);

    fireEvent.click(screen.getByText('Task pipeline'));
    await waitFor(() => expect(screen.getByTestId('task-kanban-view')).toBeTruthy());
    expect(screen.getByTestId('task-summary-counts')).toBeTruthy();
    expect(screen.getByTestId('task-kanban-view').textContent).not.toMatch(/8 open/);
    expect(screen.getByLabelText('Board density')).toBeTruthy();
    expect(screen.getByText('Save view')).toBeTruthy();

    fireEvent.click(screen.getByText('Calendar'));
    await waitFor(() => expect(screen.getByTestId('task-calendar-view')).toBeTruthy());
    expect(screen.getByTestId('task-scope-select')).toBeTruthy();
    expect(screen.getByTestId('task-summary-counts')).toBeTruthy();

    fireEvent.click(screen.getByText('Follow-up'));
    await waitFor(() => expect(screen.getByTestId('task-follow-up-view')).toBeTruthy());
    expect(screen.getByTestId('task-scope-select')).toBeTruthy();
    expect(screen.getByTestId('task-summary-counts')).toBeTruthy();

    fireEvent.click(screen.getByText('Overview'));
    await waitFor(() => expect(screen.getByTestId('task-overview-tab')).toBeTruthy());
    expect(screen.queryByTestId('task-scope-select')).toBeNull();
    expect(screen.queryByTestId('task-summary-counts')).toBeNull();
  });

  it('prompts for a reason when a list card is dropped back from In Review', async () => {
    mockPrompt.mockResolvedValue('Need a revision');
    vi.mocked(taskService.getAllTasks).mockResolvedValue({
      items: [
        {
          id: 'tsk-review',
          serial: 'T-0099',
          title: 'Review drop',
          status: 'in_review',
          priority: 'medium',
          creator_id: 'admin',
          assigner_id: 'admin',
          assignee_id: 'member.1',
          department: 'Content',
          involved_ids: ['admin', 'member.1'],
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
      stage_counts: { in_review: 1 },
    } as any);
    vi.mocked(taskService.changeStage).mockResolvedValue({
      id: 'tsk-review',
      status: 'in_progress',
      serial: 'T-0099',
      title: 'Review drop',
    } as any);
    renderTasks();
    await waitFor(() => expect(screen.getByText('Review drop')).toBeTruthy());
    fireEvent.drop(screen.getByTestId('task-stage-in_progress'), {
      dataTransfer: { getData: () => 'tsk-review' },
    });
    await waitFor(() =>
      expect(mockPrompt).toHaveBeenCalledWith(expect.objectContaining({ title: 'Send back' })),
    );
    await waitFor(() =>
      expect(taskService.changeStage).toHaveBeenCalledWith('tsk-review', 'in_progress', 'Need a revision'),
    );
  });
});
