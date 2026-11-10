import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TaskListView } from '../TaskListView';
import type { Task } from '@/types/task';

vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));

const task = (over: Partial<Task> = {}): Task => ({
  id: over.id || 'tsk1',
  serial: over.serial || 'T-0001',
  title: over.title || 'Landing page copy',
  status: over.status || 'todo',
  priority: over.priority || 'high',
  assignee_name: 'Member Content 1',
  department: 'Content',
  progress: 40,
  due_date: '2026-11-12',
  ...over,
});

describe('TaskListView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('groups by stage and shows server stage_counts', () => {
    render(
      <TaskListView
        tasks={[
          task({ id: 'a', status: 'todo', title: 'Landing page copy' }),
          task({ id: 'b', serial: 'T-0002', status: 'todo', title: 'Peer draft' }),
          task({ id: 'c', serial: 'T-0003', status: 'in_progress', title: 'In flight' }),
        ]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onAction={vi.fn()}
        onViewAll={vi.fn()}
        onBulk={vi.fn()}
        stageCounts={{ todo: 12, in_progress: 4 }}
      />,
    );
    expect(screen.getByTestId('task-stage-todo').textContent).toMatch(/12/);
    expect(screen.getByTestId('task-stage-in_progress').textContent).toMatch(/4/);
    expect(screen.getByText('Landing page copy')).toBeTruthy();
  });

  it('View all calls onViewAll with the stage', () => {
    const onViewAll = vi.fn();
    render(
      <TaskListView
        tasks={[task()]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onAction={vi.fn()}
        onViewAll={onViewAll}
        onBulk={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByText('View all')[0]);
    expect(onViewAll).toHaveBeenCalledWith('todo');
  });

  it('shows bulk bar when a row is selected', () => {
    render(
      <TaskListView
        tasks={[task()]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onAction={vi.fn()}
        onViewAll={vi.fn()}
        onBulk={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Select T-0001'));
    expect(screen.getByText(/1 selected/)).toBeTruthy();
  });
});
