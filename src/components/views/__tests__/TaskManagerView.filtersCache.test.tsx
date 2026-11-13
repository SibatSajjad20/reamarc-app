import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TaskManagerView } from '../TaskManagerView';
import { taskService } from '@/services/taskService';
import type { Task } from '@/types/task';
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
vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => vi.fn(),
  usePrompt: () => vi.fn(),
}));
vi.mock('@/services/taskService', () => ({
  taskService: {
    getAllTasks: vi.fn(),
    getCounts: vi.fn(),
    getAssignable: vi.fn(),
    getSavedViews: vi.fn(),
    getOverview: vi.fn(),
    getFollowUp: vi.fn(),
    changeStage: vi.fn(),
  },
}));

function task(over: Partial<Task> & Pick<Task, 'id' | 'title' | 'status'>): Task {
  return {
    serial: 'T-0001',
    priority: 'medium',
    created_at: '2026-11-13T00:00:00Z',
    updated_at: '2026-11-13T00:00:00Z',
    ...over,
  } as Task;
}

function emptyMeta() {
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
}

describe('TaskManagerView filter cache and load more', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    taskManagerViewCache.clearAll();
    emptyMeta();
  });

  afterEach(() => {
    taskManagerViewCache.clearAll();
  });

  it('shows a skeleton instead of the previous stage’s tasks while the next filter loads', async () => {
    vi.mocked(taskService.getAllTasks).mockImplementation(async (filters?: { stage?: string }) => {
      if (filters?.stage === 'in_review') {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          items: [task({ id: 't2', title: 'Review cut', status: 'in_review' })],
          total: 1,
          page: 1,
          limit: 200,
          stage_counts: { in_review: 1 },
        } as any;
      }
      return {
        items: [task({ id: 't1', title: 'Client reel', status: 'todo' })],
        total: 1,
        page: 1,
        limit: 200,
        stage_counts: { todo: 1 },
      } as any;
    });

    render(
      <TooltipProvider>
        <TaskManagerView />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByText('Client reel')).toBeTruthy());

    sessionStorage.setItem('reamarc_tasks_section', 'in_review');
    fireEvent(window, new Event('reamarc-tasks-section'));

    expect(screen.queryByText('Client reel')).toBeNull();
    expect(screen.getByTestId('task-module-skeleton')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('Review cut')).toBeTruthy());
    expect(screen.queryByTestId('task-module-skeleton')).toBeNull();
  });

  it('restores a cached filter immediately when revisiting Tasks', async () => {
    vi.mocked(taskService.getAllTasks).mockResolvedValue({
      items: [task({ id: 't1', title: 'Client reel', status: 'todo' })],
      total: 1,
      page: 1,
      limit: 200,
      stage_counts: { todo: 1 },
    } as any);

    const first = render(
      <TooltipProvider>
        <TaskManagerView />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByText('Client reel')).toBeTruthy());
    first.unmount();
    vi.mocked(taskService.getAllTasks).mockClear();

    render(
      <TooltipProvider>
        <TaskManagerView />
      </TooltipProvider>,
    );
    expect(screen.getByText('Client reel')).toBeTruthy();
    expect(screen.queryByTestId('task-module-skeleton')).toBeNull();
    await waitFor(() => expect(taskService.getAllTasks).toHaveBeenCalled());
  });

  it('loads more when the first page is truncated instead of stopping at a hard cap', async () => {
    vi.mocked(taskService.getAllTasks).mockImplementation(async (_filters?: unknown, opts?: { cap?: number }) => {
      const cap = opts?.cap ?? 200;
      const items = [
        task({ id: 't1', title: 'First page', status: 'todo' }),
        ...(cap > 200 ? [task({ id: 't2', title: 'Second page', status: 'todo' })] : []),
      ];
      return {
        items,
        total: 2,
        page: 1,
        limit: items.length,
        truncated: items.length < 2,
        stage_counts: { todo: 2 },
      } as any;
    });

    render(
      <TooltipProvider>
        <TaskManagerView />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByText('First page')).toBeTruthy());
    expect(screen.queryByText('Second page')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => expect(screen.getByText('Second page')).toBeTruthy());
    expect(vi.mocked(taskService.getAllTasks).mock.calls.some((call) => call[1]?.cap === 201)).toBe(true);
  });
});
