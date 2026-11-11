import type { ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TaskPipelineCard } from '../TaskPipelineCard';
import type { Task } from '@/types/task';
import { formatPktDate } from '@/utils/datetime';
import { taskService } from '@/services/taskService';

vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));

vi.mock('@/services/taskService', () => ({
  taskService: {
    getAllTasks: vi.fn(),
    getTask: vi.fn(),
  },
}));

const fetchSpy = vi.spyOn(globalThis, 'fetch');

const task = (over: Partial<Task> = {}): Task => ({
  id: 'tsk1',
  serial: 'T-0001',
  title: 'Pipeline card title that should clamp to two lines',
  status: 'todo',
  priority: 'high',
  department: 'Website',
  assignee_name: 'Hira',
  due_date: '2026-11-14',
  ...over,
});

function renderCard(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('TaskPipelineCard', () => {
  beforeEach(() => {
    fetchSpy.mockClear();
    vi.mocked(taskService.getAllTasks).mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-11T12:00:00+05:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('comfortable renders serial, priority, clamp, avatar, department, due', () => {
    renderCard(
      <TaskPipelineCard
        task={task()}
        density="comfortable"
        onOpen={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );
    expect(screen.getByText('T-0001')).toBeTruthy();
    expect(screen.getByText('T-0001').className).toMatch(/font-numeric/);
    expect(screen.getByText('T-0001').className).not.toMatch(/font-mono/);
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText(/Pipeline card title/).className).toMatch(/line-clamp-2/);
    expect(screen.getByText('Hira')).toBeTruthy();
    const dept = screen.getByTestId('task-pipeline-department');
    expect(dept.textContent).toBe('Website');
    expect(dept.className).not.toMatch(/truncate/);
    expect(dept.className).not.toMatch(/max-w-\[50%\]/);
    expect(dept.className).toMatch(/break-words/);
    expect(screen.getByText(formatPktDate('2026-11-14'))).toBeTruthy();
  });

  it('colours overdue due dates and skips completed tasks', () => {
    const { rerender } = renderCard(
      <TaskPipelineCard
        task={task({ due_date: '2026-11-10' })}
        density="comfortable"
        onOpen={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );
    expect(screen.getByText(formatPktDate('2026-11-10')).className).toMatch(/text-danger-fg/);
    expect(screen.getByText('Overdue')).toBeTruthy();

    rerender(
      <TooltipProvider>
        <TaskPipelineCard
          task={task({ due_date: '2026-11-14' })}
          density="comfortable"
          onOpen={vi.fn()}
          onDragStart={vi.fn()}
          onDragEnd={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText(formatPktDate('2026-11-14')).className).toMatch(/text-fg-muted/);
    expect(screen.queryByText('Overdue')).toBeNull();

    rerender(
      <TooltipProvider>
        <TaskPipelineCard
          task={task({ due_date: '2026-11-10', status: 'completed' })}
          density="comfortable"
          onOpen={vi.fn()}
          onDragStart={vi.fn()}
          onDragEnd={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText(formatPktDate('2026-11-10')).className).not.toMatch(/text-danger-fg/);
    expect(screen.queryByText('Overdue')).toBeNull();
  });

  it('shows Awaiting approval only for in_review', () => {
    const { rerender } = renderCard(
      <TaskPipelineCard
        task={task({ status: 'in_review' })}
        density="comfortable"
        onOpen={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );
    expect(screen.getByText('Awaiting approval')).toBeTruthy();
    rerender(
      <TooltipProvider>
        <TaskPipelineCard
          task={task({ status: 'in_progress' })}
          density="comfortable"
          onOpen={vi.fn()}
          onDragStart={vi.fn()}
          onDragEnd={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.queryByText('Awaiting approval')).toBeNull();
  });

  it('meta row prefers subtasks, else checklist, and does not fetch', () => {
    const { rerender } = renderCard(
      <TaskPipelineCard
        task={task({ subtasks_count: 5, subtasks_done: 2, comments_count: 0, attachments_count: 0 })}
        density="comfortable"
        onOpen={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );
    expect(screen.getByText('2/5')).toBeTruthy();
    rerender(
      <TooltipProvider>
        <TaskPipelineCard
          task={task({
            subtasks_count: 0,
            checklist: [
              { id: '1', text: 'a', done: true },
              { id: '2', text: 'b', done: false },
              { id: '3', text: 'c', done: false },
              { id: '4', text: 'd', done: false },
            ],
            comments_count: 3,
            attachments_count: 2,
          })}
          density="comfortable"
          onOpen={vi.fn()}
          onDragStart={vi.fn()}
          onDragEnd={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText('1/4')).toBeTruthy();
    expect(screen.getByLabelText('3 comments')).toBeTruthy();
    expect(screen.getByLabelText('2 attachments')).toBeTruthy();
    expect(taskService.getAllTasks).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('compact density shows the full department name without a 50% truncate cap', () => {
    renderCard(
      <TaskPipelineCard
        task={task({ department: 'Website' })}
        density="compact"
        onOpen={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );
    const dept = screen.getByTestId('task-pipeline-department');
    expect(dept.textContent).toBe('Website');
    expect(dept.className).not.toMatch(/truncate/);
    expect(dept.className).not.toMatch(/max-w-\[50%\]/);
    expect(screen.getByText('T-0001').className).toMatch(/font-numeric/);
  });
});
