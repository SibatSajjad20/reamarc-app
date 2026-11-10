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
});
