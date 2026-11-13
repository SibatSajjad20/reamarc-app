import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TASKS_LIVE_POLL_MS, TaskManagerView } from '../TaskManagerView';
import { taskService } from '@/services/taskService';
import type { Task } from '@/types/task';

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

describe('TaskManagerView live poll while the board stays open', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    emptyMeta();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('picks up another user moving a task into In Review without a loading flash', async () => {
    vi.mocked(taskService.getAllTasks).mockResolvedValue({
      items: [task({ id: 't1', title: 'Client reel', status: 'in_progress' })],
      total: 1,
      page: 1,
      limit: 200,
      stage_counts: { in_progress: 1 },
    } as any);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <TooltipProvider>
        <TaskManagerView />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText('Client reel')).toBeTruthy());
    expect(screen.queryByTestId('task-module-skeleton')).toBeNull();
    const afterMount = vi.mocked(taskService.getAllTasks).mock.calls.length;

    vi.mocked(taskService.getAllTasks).mockResolvedValue({
      items: [task({ id: 't1', title: 'Client reel', status: 'in_review' })],
      total: 1,
      page: 1,
      limit: 200,
      stage_counts: { in_review: 1 },
    } as any);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TASKS_LIVE_POLL_MS);
    });

    await waitFor(() => {
      expect(screen.getByTestId('task-stage-in_review').textContent).toContain('Client reel');
    });
    expect(screen.queryByTestId('task-module-skeleton')).toBeNull();
    expect(vi.mocked(taskService.getAllTasks).mock.calls.length).toBeGreaterThan(afterMount);
  });

  it('does not poll the task list while the tab is hidden', async () => {
    vi.mocked(taskService.getAllTasks).mockResolvedValue({
      items: [task({ id: 't1', title: 'Client reel', status: 'todo' })],
      total: 1,
      page: 1,
      limit: 200,
      stage_counts: { todo: 1 },
    } as any);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <TooltipProvider>
        <TaskManagerView />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByText('Client reel')).toBeTruthy());
    const afterMount = vi.mocked(taskService.getAllTasks).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TASKS_LIVE_POLL_MS * 3);
    });

    expect(vi.mocked(taskService.getAllTasks).mock.calls.length).toBe(afterMount);
  });
});
