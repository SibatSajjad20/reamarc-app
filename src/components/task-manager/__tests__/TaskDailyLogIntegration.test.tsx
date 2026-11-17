import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TaskLogTimeModal } from '../TaskLogTimeModal';
import { TaskPipelineCard } from '../TaskPipelineCard';
import { DailyLogForm } from '../../daily-log/DailyLogForm';
import { dailyLogService } from '@/services/dailyLogService';
import type { Task } from '@/types/task';

vi.mock('@/services/dailyLogService', () => ({
  dailyLogService: {
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
  },
}));

vi.mock('@/services/taskService', () => ({
  taskService: {
    getTasks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    emitTasksChanged: vi.fn(),
  },
  emitTasksChanged: vi.fn(),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'John Doe', role: 'team_member', department: 'Website' },
  }),
}));

vi.mock('@/hooks/useOffDays', () => ({
  useOffDays: () => ({
    isOffDay: () => false,
    getOffDay: () => ({ isOff: false }),
    holidays: new Set<string>(),
    workingSaturdays: new Set<string>(),
    lastWorkday: (d: string) => d,
  }),
}));

vi.mock('@/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({
    workspaces: [{ id: 'ws1', name: 'Acme Corp', status: 'active' }],
  }),
}));

vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));

const mockTask: Task = {
  id: 'tsk_101',
  serial: 'T-0101',
  title: 'Build landing page hero section',
  status: 'in_progress',
  priority: 'high',
  estimate_hours: 6.0,
  logged_hours: 2.5,
  related: { client_name: 'Acme Corp', workspace_id: 'ws1' },
};

describe('Task Daily Log Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  describe('TaskLogTimeModal', () => {
    it('renders task info and logs time with sync stage', async () => {
      vi.mocked(dailyLogService.createEntry).mockResolvedValue({
        id: 'log-1',
        workspace_id: 'global',
        version: 1,
        date: '2026-11-16',
        resource_name: 'John Doe',
        role: 'Team Member',
        client_project: 'Acme Corp',
        task_description: 'Build landing page hero section',
        task_type: 'Scheduled Task',
        task_status: 'Incomplete',
        revisions_done: '',
        deliverables: '',
        hours_utilized: 1.5,
        month_sheet: 'November - 2026',
        task_id: 'tsk_101',
        task_serial: 'T-0101',
      });

      const onClose = vi.fn();
      const onSuccess = vi.fn();

      render(
        <TaskLogTimeModal
          task={mockTask}
          isOpen={true}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      );

      expect(screen.getByText(/Log Time: T-0101/)).toBeTruthy();
      expect(screen.getAllByText('Build landing page hero section').length).toBeGreaterThan(0);
      expect(screen.getByText('2.5h')).toBeTruthy();
      expect(screen.getByText('/ 6h estimated')).toBeTruthy();

      // Click quick pick '1.5h'
      const chip15 = screen.getByRole('button', { name: '1.5h' });
      fireEvent.click(chip15);

      // Submit
      const submitBtn = screen.getByRole('button', { name: 'Save Log Entry' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(dailyLogService.createEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            task_id: 'tsk_101',
            task_serial: 'T-0101',
            client_project: 'Acme Corp',
            hours_utilized: '1.5',
            sync_task_status: 'in_progress',
          })
        );
      });

      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('identifies 30m quick pick and logs 0:30 without error', async () => {
      vi.mocked(dailyLogService.createEntry).mockResolvedValue({
        id: 'log-30m',
        workspace_id: 'global',
        version: 1,
        date: '2026-11-16',
        resource_name: 'John Doe',
        role: 'Team Member',
        client_project: 'Acme Corp',
        task_description: 'Build landing page hero section',
        task_type: 'Scheduled Task',
        task_status: 'Incomplete',
        revisions_done: '',
        deliverables: '',
        hours_utilized: 0.5,
        month_sheet: 'November - 2026',
        task_id: 'tsk_101',
        task_serial: 'T-0101',
      });

      const onClose = vi.fn();
      const onSuccess = vi.fn();

      render(
        <TaskLogTimeModal
          task={mockTask}
          isOpen={true}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      );

      // Click quick pick '30m'
      const chip30m = screen.getByRole('button', { name: '30m' });
      fireEvent.click(chip30m);

      // Verify input value
      const timeInput = screen.getByPlaceholderText('e.g. 1.0 or 0:30') as HTMLInputElement;
      expect(timeInput.value).toBe('0:30');

      // Submit
      const submitBtn = screen.getByRole('button', { name: 'Save Log Entry' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(dailyLogService.createEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            task_id: 'tsk_101',
            task_serial: 'T-0101',
            client_project: 'Acme Corp',
            hours_utilized: '0:30',
          })
        );
      });

      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      expect(screen.queryByText(/Please provide a valid time utilized/)).toBeNull();
    });

    it('rejects invalid time utilized inputs with descriptive error message', async () => {
      render(
        <TaskLogTimeModal
          task={mockTask}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const timeInput = screen.getByPlaceholderText('e.g. 1.0 or 0:30');
      fireEvent.change(timeInput, { target: { value: 'invalid_duration' } });

      const submitBtn = screen.getByRole('button', { name: 'Save Log Entry' });
      fireEvent.click(submitBtn);

      expect(screen.getByText('Please provide a valid time utilized (e.g. 1.5 or 0:30).')).toBeTruthy();
      expect(dailyLogService.createEntry).not.toHaveBeenCalled();
    });

    it('renders description rich formatting toolbar buttons (bold, bulleted list, numbered list)', () => {
      render(
        <TaskLogTimeModal
          task={mockTask}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      // Verify formatting toolbar buttons
      expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Bulleted list' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Numbered list' })).toBeTruthy();
    });
  });

  describe('TaskPipelineCard', () => {
    it('displays logged hours badge and provides Log Time trigger', () => {
      const onOpen = vi.fn();
      const onLogTime = vi.fn();

      render(
        <TooltipProvider>
          <TaskPipelineCard
            task={mockTask}
            onOpen={onOpen}
            onLogTime={onLogTime}
            onDragStart={vi.fn()}
            onDragEnd={vi.fn()}
          />
        </TooltipProvider>
      );

      // Logged hours indicator
      expect(screen.getByText('2.5h / 6h')).toBeTruthy();

      // Log button in card footer
      const logBtn = screen.getByRole('button', { name: 'Log' });
      fireEvent.click(logBtn);
      expect(onLogTime).toHaveBeenCalledWith(mockTask);
    });
  });

  describe('DailyLogForm with prefilledTask', () => {
    it('prefills task details and includes task_id in creation payload', async () => {
      vi.mocked(dailyLogService.createEntry).mockResolvedValue({
        id: 'log-2',
        workspace_id: 'global',
        version: 1,
        date: '2026-11-16',
        resource_name: 'John Doe',
        role: 'Team Member',
        client_project: 'Acme Corp',
        task_description: 'Build landing page hero section',
        task_type: 'Scheduled Task',
        task_status: 'Incomplete',
        revisions_done: '',
        deliverables: '',
        hours_utilized: 2.0,
        month_sheet: 'November - 2026',
        task_id: 'tsk_101',
        task_serial: 'T-0101',
      });

      const onSaved = vi.fn();

      render(
        <DailyLogForm
          mode="create"
          activeSheet="November - 2026"
          prefilledTask={mockTask}
          onSaved={onSaved}
        />
      );

      // Verify task link label
      expect(screen.getByText('Link to Task (Task Manager)')).toBeTruthy();

      // Submit form
      const submitBtn = screen.getByRole('button', { name: /Add Entry|Save/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(dailyLogService.createEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            task_id: 'tsk_101',
            task_serial: 'T-0101',
            client_project: 'Acme Corp',
          })
        );
      });
      expect(onSaved).toHaveBeenCalled();
    });
  });
});
