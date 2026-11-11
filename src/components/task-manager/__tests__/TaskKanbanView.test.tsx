import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TaskKanbanView } from '../TaskKanbanView';
import type { Task } from '@/types/task';
import { canTransitionTo } from '@/utils/taskAccess';

vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));

const addToast = vi.fn();
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast }),
}));

const task = (over: Partial<Task> = {}): Task => ({
  id: 'tsk1',
  serial: 'T-0001',
  title: 'Pipeline card',
  status: 'todo',
  priority: 'low',
  ...over,
});

function renderBoard(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('TaskKanbanView', () => {
  it('renders four stage columns', () => {
    renderBoard(
      <TaskKanbanView
        tasks={[task(), task({ id: 't2', status: 'in_review', title: 'Review me' })]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onStageChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('task-kanban-todo')).toBeTruthy();
    expect(screen.getByTestId('task-kanban-in_progress')).toBeTruthy();
    expect(screen.getByTestId('task-kanban-in_review')).toBeTruthy();
    expect(screen.getByTestId('task-kanban-completed')).toBeTruthy();
    expect(screen.getByText('Pipeline card')).toBeTruthy();
    expect(screen.getByText('Review me')).toBeTruthy();
  });

  it('column headers match visible cards, not stale server stage_counts', () => {
    renderBoard(
      <TaskKanbanView
        tasks={[
          task(),
          task({ id: 't2', serial: 'T-0036', status: 'in_review', title: 'Review me' }),
          task({ id: 't3', serial: 'T-0041', status: 'completed', title: 'test' }),
        ]}
        stageCounts={{ todo: 40, in_progress: 5, in_review: 0, completed: 0 }}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onStageChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('task-kanban-count-todo').textContent).toBe('1');
    expect(screen.getByTestId('task-kanban-count-in_progress').textContent).toBe('0');
    expect(screen.getByTestId('task-kanban-count-in_review').textContent).toBe('1');
    expect(screen.getByTestId('task-kanban-count-completed').textContent).toBe('1');
    expect(screen.getByTestId('task-kanban-count-in_review').className).toMatch(/font-numeric/);
    expect(screen.queryByText(/open ·/)).toBeNull();
    expect(screen.queryByTestId('task-summary-counts')).toBeNull();
    const root = screen.getByTestId('task-kanban-view');
    const header = screen.getByTestId('task-kanban-header-todo');
    expect(root.contains(header)).toBe(true);
  });

  it("blocks illegal drop for a member completing someone else's task", () => {
    const onStageChange = vi.fn();
    renderBoard(
      <TaskKanbanView
        tasks={[task({ assigner_id: 'lead', assignee_id: 'other', creator_id: 'lead' })]}
        actor={{ id: 'member', role: 'team_member' }}
        onOpen={vi.fn()}
        onStageChange={onStageChange}
      />,
    );
    const completed = screen.getByTestId('task-kanban-body-completed');
    fireEvent.drop(completed, { dataTransfer: { getData: () => 'tsk1' } });
    expect(onStageChange).not.toHaveBeenCalled();
  });

  it('scrolls each column body independently with a fixed header outside the scroller', () => {
    renderBoard(
      <TaskKanbanView tasks={[task()]} actor={{ id: 'admin', role: 'admin' }} onOpen={vi.fn()} onStageChange={vi.fn()} />,
    );
    const root = screen.getByTestId('task-kanban-view');
    expect(root.className).toMatch(/overflow-hidden/);
    expect(root.className).not.toMatch(/overflow-auto/);
    const board = screen.getByRole('region', { name: 'Task pipeline' });
    expect(board.className).toMatch(/md:grid/);
    expect(board.className).toMatch(/minmax\(240px,1fr\)/);
    expect(board.className).toMatch(/flex-1/);
    expect(board.className).toMatch(/overflow-y-hidden/);
    const header = screen.getByTestId('task-kanban-header-todo');
    expect(header.className).toMatch(/shrink-0/);
    expect(header.className).toMatch(/bg-surface/);
    expect(header.className).toMatch(/isolate/);
    expect(header.className).not.toMatch(/sticky/);
    const body = screen.getByTestId('task-kanban-body-todo');
    expect(body.className).toMatch(/overflow-y-auto/);
    expect(body.className).toMatch(/min-h-0/);
    expect(body.className).toMatch(/z-0/);
    const column = screen.getByTestId('task-kanban-todo');
    expect(column.className).toMatch(/overflow-hidden/);
    expect(header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('mobile tabs scroll to a stage and update aria-selected from scrollLeft', () => {
    renderBoard(
      <TaskKanbanView tasks={[task()]} actor={{ id: 'admin', role: 'admin' }} onOpen={vi.fn()} onStageChange={vi.fn()} />,
    );
    const tabs = screen.getByRole('tablist');
    expect(tabs.querySelectorAll('[role="tab"]')).toHaveLength(4);
    const board = screen.getByRole('region', { name: 'Task pipeline' });
    const scrollTo = vi.fn();
    Object.defineProperty(board, 'clientWidth', { configurable: true, value: 390 });
    board.scrollTo = scrollTo as any;

    fireEvent.click(screen.getByRole('tab', { name: /In Review/ }));
    expect(scrollTo).toHaveBeenCalledWith({ left: 2 * 390, behavior: expect.any(String) });

    Object.defineProperty(board, 'scrollLeft', { configurable: true, value: 1 * 390 });
    fireEvent.scroll(board);
    expect(screen.getByRole('tab', { name: /In Progress/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('empty stage renders a 72px dashed drop zone and still accepts a drop', async () => {
    const onStageChange = vi.fn().mockResolvedValue(undefined);
    renderBoard(
      <TaskKanbanView
        tasks={[task({ id: 'tsk1', status: 'todo' })]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onStageChange={onStageChange}
      />,
    );
    const empty = screen.getAllByText('Drop a task here or add one')[0];
    expect(empty.className).toMatch(/h-\[72px\]/);
    expect(empty.className).toMatch(/border-dashed/);
    const zone = screen.getByTestId('task-kanban-body-in_progress');
    fireEvent.drop(zone, { dataTransfer: { getData: () => 'tsk1' } });
    await waitFor(() => expect(onStageChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'tsk1' }), 'in_progress'));
  });

  it('drag-and-drop sets the task id and moves allowed cards; failure toasts Move failed', async () => {
    const data: Record<string, string> = {};
    const onStageChange = vi.fn().mockRejectedValue(new Error('nope'));
    addToast.mockClear();
    renderBoard(
      <TaskKanbanView
        tasks={[task({ id: 'tsk1', status: 'todo', creator_id: 'admin', assigner_id: 'admin', assignee_id: 'admin' })]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onStageChange={onStageChange}
      />,
    );
    fireEvent.dragStart(screen.getByText('Pipeline card').closest('[draggable]') as HTMLElement, {
      dataTransfer: {
        setData: (k: string, v: string) => {
          data[k] = v;
        },
        effectAllowed: '',
      },
    });
    expect(data['text/plain']).toBe('tsk1');
    fireEvent.drop(screen.getByTestId('task-kanban-body-in_progress'), {
      dataTransfer: { getData: (k: string) => data[k] },
    });
    await waitFor(() => expect(onStageChange).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Move failed', expect.any(String), 'error'));
  });

  it('shows + on To Do / In Progress / In Review for admin, not Completed; member follows canTransitionTo', () => {
    const onAddToStage = vi.fn();
    const { unmount } = renderBoard(
      <TaskKanbanView
        tasks={[task()]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onStageChange={vi.fn()}
        onAddToStage={onAddToStage}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add task to To Do' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add task to In Progress' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add task to In Review' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add task to Completed' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add task to In Progress' }));
    expect(onAddToStage).toHaveBeenCalledWith('in_progress');
    unmount();

    const member = { id: 'member', role: 'team_member' };
    const stub = { status: 'todo', creator_id: member.id, assigner_id: member.id, assignee_id: member.id } as Task;
    const allowed = (['todo', 'in_progress', 'in_review', 'completed'] as const).filter((s) => canTransitionTo(member, stub, s));
    renderBoard(
      <TaskKanbanView
        tasks={[task()]}
        actor={member}
        onOpen={vi.fn()}
        onStageChange={vi.fn()}
        onAddToStage={vi.fn()}
      />,
    );
    const shown = ['To Do', 'In Progress', 'In Review', 'Completed']
      .filter((label) => screen.queryByRole('button', { name: `Add task to ${label}` }))
      .map((label) => ({ 'To Do': 'todo', 'In Progress': 'in_progress', 'In Review': 'in_review', Completed: 'completed' }[label]));
    expect(shown).toEqual(allowed.filter((s) => s !== 'completed'));
  });

  it('moves the card into the drop column before the stage request resolves', async () => {
    let finish!: () => void;
    const onStageChange = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    renderBoard(
      <TaskKanbanView
        tasks={[task({ id: 'tsk1', status: 'todo', creator_id: 'admin', assigner_id: 'admin', assignee_id: 'admin' })]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onStageChange={onStageChange}
      />,
    );
    fireEvent.drop(screen.getByTestId('task-kanban-body-in_progress'), {
      dataTransfer: { getData: () => 'tsk1' },
    });
    expect(screen.getByTestId('task-kanban-body-in_progress').textContent).toMatch(/Pipeline card/);
    expect(screen.getByTestId('task-kanban-body-todo').textContent).not.toMatch(/Pipeline card/);
    finish();
    await waitFor(() => expect(onStageChange).toHaveBeenCalledTimes(1));
  });

  it('density prop keeps department chip and footer in both densities', () => {
    const rich = task({ department: 'Content', assignee_name: 'Hira' });
    const { rerender } = renderBoard(
      <TaskKanbanView
        tasks={[rich]}
        actor={{ id: 'admin', role: 'admin' }}
        density="compact"
        onOpen={vi.fn()}
        onStageChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('task-pipeline-department').textContent).toBe('Content');
    rerender(
      <TooltipProvider>
        <TaskKanbanView
          tasks={[rich]}
          actor={{ id: 'admin', role: 'admin' }}
          density="comfortable"
          onOpen={vi.fn()}
          onStageChange={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.getByTestId('task-pipeline-department').textContent).toBe('Content');
    expect(screen.getByText('Hira')).toBeTruthy();
  });

  it('optimistic drop updates the destination column count', async () => {
    let finish!: () => void;
    const onStageChange = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    renderBoard(
      <TaskKanbanView
        tasks={[task({ id: 'tsk1', status: 'todo', creator_id: 'admin', assigner_id: 'admin', assignee_id: 'admin' })]}
        stageCounts={{ todo: 1, in_progress: 0, in_review: 0, completed: 0 }}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onStageChange={onStageChange}
      />,
    );
    fireEvent.drop(screen.getByTestId('task-kanban-body-in_progress'), {
      dataTransfer: { getData: () => 'tsk1' },
    });
    expect(screen.getByTestId('task-kanban-count-todo').textContent).toBe('0');
    expect(screen.getByTestId('task-kanban-count-in_progress').textContent).toBe('1');
    finish();
    await waitFor(() => expect(onStageChange).toHaveBeenCalledTimes(1));
  });
});
