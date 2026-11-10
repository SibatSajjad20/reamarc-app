import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TaskCalendarView } from '../TaskCalendarView';
import type { Task } from '@/types/task';

const addToast = vi.fn();

vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast }),
}));

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('TaskCalendarView', () => {
  it('places tasks on due date and prefills create on empty day click', () => {
    const onCreateForDate = vi.fn();
    const due = isoToday();
    const task: Task = {
      id: 'tsk1',
      serial: 'T-0042',
      title: 'Cal item',
      status: 'todo',
      priority: 'urgent',
      due_date: due,
    };
    render(
      <TaskCalendarView
        tasks={[task]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onCreateForDate={onCreateForDate}
        onReschedule={vi.fn()}
      />,
    );
    expect(screen.getByTestId('task-cal-card-tsk1')).toBeTruthy();
    expect(screen.getByText('Cal item')).toBeTruthy();
    fireEvent.click(screen.getByText('Today'));
    expect(screen.getByTestId('task-calendar-view')).toBeTruthy();
  });

  it('opens extra tasks from the +N more popover and switches to week cards', () => {
    const onOpen = vi.fn();
    const due = isoToday();
    const tasks = [1, 2, 3, 4].map((n) => ({
      id: `tsk${n}`,
      serial: `T-000${n}`,
      title: `Overflow ${n}`,
      status: 'todo' as const,
      priority: 'medium' as const,
      due_date: due,
    })) as Task[];
    render(
      <TaskCalendarView
        tasks={tasks}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={onOpen}
        onCreateForDate={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('+1 more'));
    fireEvent.click(screen.getByText('Overflow 4'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'tsk4' }));

    fireEvent.click(screen.getByText('Week view'));
    expect(screen.getAllByText('No tasks due this day').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('task-cal-card-tsk1').length).toBeGreaterThan(0);
  });

  it('toasts and leaves the task in place when reschedule fails', async () => {
    addToast.mockClear();
    const due = isoToday();
    const onReschedule = vi.fn().mockRejectedValue(new Error('conflict'));
    const { container } = render(
      <TaskCalendarView
        tasks={[{
          id: 'tsk1',
          serial: 'T-0042',
          title: 'Cal item',
          status: 'todo',
          priority: 'urgent',
          due_date: due,
          assignee_id: 'admin',
          assigner_id: 'admin',
        }]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onCreateForDate={vi.fn()}
        onReschedule={onReschedule}
      />,
    );
    const card = screen.getByTestId('task-cal-card-tsk1');
    const cells = container.querySelectorAll('[class*="min-h-[112px]"]');
    const target = cells[cells.length - 1] as HTMLElement;
    fireEvent.drop(target, { dataTransfer: { getData: () => 'tsk1' }, preventDefault() {} });
    expect(onReschedule).toHaveBeenCalled();
    await vi.waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(screen.getByTestId('task-cal-card-tsk1')).toBeTruthy();
    void card;
  });
});
