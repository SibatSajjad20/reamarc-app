import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TaskKanbanView } from '../TaskKanbanView';
import type { Task } from '@/types/task';

vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

const task = (over: Partial<Task> = {}): Task => ({
  id: 'tsk1',
  serial: 'T-0001',
  title: 'Kanban card',
  status: 'todo',
  priority: 'low',
  ...over,
});

describe('TaskKanbanView', () => {
  it('renders four stage columns', () => {
    render(
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
    expect(screen.getByText('Kanban card')).toBeTruthy();
    expect(screen.getByText('Review me')).toBeTruthy();
  });

  it('uses server stage_counts for column headers', () => {
    render(
      <TaskKanbanView
        tasks={[task()]}
        counts={{ open: 9, overdue: 2, blocked: 1, in_review: 3 } as any}
        stageCounts={{ todo: 40, in_progress: 5, in_review: 3, completed: 8 }}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onStageChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('task-kanban-todo').textContent).toMatch(/40/);
    expect(screen.getByText('9 open')).toBeTruthy();
  });

  it('blocks illegal drop for a member completing someone else\'s task', () => {
    const onStageChange = vi.fn();
    render(
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
});
