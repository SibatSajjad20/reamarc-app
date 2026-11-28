import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskFollowUpView } from '../TaskFollowUpView';
import type { Task } from '@/types/task';

vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));

const task = (over: Partial<Task> = {}): Task => ({
  id: over.id || 't1',
  serial: over.serial || 'T-0001',
  title: over.title || 'Item',
  status: 'todo',
  priority: 'medium',
  ...over,
});

describe('TaskFollowUpView', () => {
  it('renders overdue / today / upcoming / no due buckets', () => {
    const yesterday = '2020-01-01';
    render(
      <TaskFollowUpView
        tasks={[
          task({ id: 'o', title: 'Overdue one', due_date: yesterday }),
          task({ id: 'n', title: 'No date' }),
        ]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId('task-follow-up-view')).toBeTruthy();
    expect(screen.getByText('Overdue one')).toBeTruthy();
    expect(screen.getByText('No date')).toBeTruthy();
  });

  it('does not render row checkboxes', () => {
    render(
      <TaskFollowUpView
        tasks={[
          task({
            id: 'o',
            serial: 'T-0001',
            title: 'Overdue one',
            due_date: '2020-01-01',
            assignee_id: 'admin',
            assigner_id: 'lead',
            status: 'todo',
          }),
        ]}
        actor={{ id: 'admin', role: 'admin', primary_department: 'Website' }}
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Advance T-0001')).toBeNull();
    expect(screen.getByTestId('task-follow-up-view').querySelectorAll('[role="checkbox"]')).toHaveLength(0);
  });

  it('renders Start Date column across follow-up task lists with fallback', () => {
    render(
      <TaskFollowUpView
        tasks={[
          task({ id: 'o', title: 'Overdue one', start_date: '2020-01-01', due_date: '2020-01-02' }),
          task({ id: 'n', title: 'No date', start_date: null, due_date: null }),
        ]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('columnheader', { name: 'Start Date' })).toHaveLength(4);
    const startCells = screen.getAllByTestId('task-list-start-date');
    expect(startCells).toHaveLength(2);
    expect(startCells[0].textContent).toBe(
      new Date('2020-01-01T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    );
    expect(startCells[1].textContent).toBe('—');
  });
});
