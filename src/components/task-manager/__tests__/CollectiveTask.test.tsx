import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TaskDialog } from '../TaskDialog';
import { TaskPipelineCard } from '../TaskPipelineCard';
import { collectiveRowsError, isLeadOwnerCandidate } from '@/utils/collectiveTask';
import type { Task } from '@/types/task';
import { taskService } from '@/services/taskService';
import {
  canAddSubtask,
  canCreateCollective,
  canTransitionTo,
  isApprover,
  subtasksBlockClose,
} from '@/utils/taskAccess';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

const { mockAddToast } = vi.hoisted(() => ({ mockAddToast: vi.fn() }));

vi.mock('@/hooks/useMemberAvatars', () => ({ useMemberAvatars: () => ({ getAvatarUrl: () => null }) }));
vi.mock('@/hooks/useWorkspaces', () => ({ useWorkspaces: () => ({ workspaces: [] }) }));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: mockAddToast }) }));
vi.mock('@/components/ui/ConfirmProvider', () => ({ useConfirm: () => vi.fn(), usePrompt: () => vi.fn() }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => ({ confirmDiscard: async () => true }) }));
vi.mock('@/services/taskService', () => ({
  taskService: {
    getComments: vi.fn().mockResolvedValue({ items: [] }),
    getAttachments: vi.fn().mockResolvedValue({ items: [] }),
    getActivity: vi.fn().mockResolvedValue({ items: [] }),
    getTask: vi.fn().mockResolvedValue(null),
    getTaskLogs: vi.fn().mockResolvedValue([]),
    getAssignable: vi.fn().mockResolvedValue({ items: [] }),
    getMentionable: vi.fn().mockResolvedValue({ items: [] }),
    createTask: vi.fn(),
    createCollective: vi.fn(),
    changeStage: vi.fn(),
    patchTask: vi.fn(),
    getAllTasks: vi.fn(),
  },
}));

const admin = { id: 'admin', role: 'admin' };
const leadWeb = { id: 'lead.web', role: 'team_lead', primary_department: 'Website' };
const memberWeb = { id: 'member.web', role: 'team_member', primary_department: 'Website' };
const people = [
  { id: 'lead.web', name: 'Lead Web', department: 'Website', role: 'team_lead' },
  { id: 'member.web', name: 'Member Web', department: 'Website', role: 'team_member' },
  { id: 'member.c1', name: 'Member Content', department: 'Content', role: 'team_member' },
];

const main = (over: Partial<Task> = {}): Task => ({
  id: 'main1',
  serial: 'T-0100',
  title: 'ZEM launch',
  status: 'in_progress',
  priority: 'high',
  assignee_id: 'lead.web',
  assignee_role: 'team_lead',
  assigner_id: 'admin',
  assigner_role: 'admin',
  creator_id: 'admin',
  subtasks_count: 3,
  subtasks_done: 1,
  subtask_progress: 33,
  ...over,
});

const sub = (over: Partial<Task> = {}): Task => ({
  id: 'sub1',
  serial: 'T-0101',
  title: 'Build page',
  status: 'in_review',
  priority: 'high',
  parent_id: 'main1',
  lead_owner_id: 'lead.web',
  assignee_id: 'member.c1',
  assignee_role: 'team_member',
  assigner_id: 'admin',
  assigner_role: 'admin',
  department: 'Content',
  ...over,
});

afterEach(() => {
  cleanup();
  mockAddToast.mockReset();
  vi.mocked(taskService.createCollective).mockReset();
});

describe('collective task access rules', () => {
  it('blocks review/complete on a main task until every sub-task is done', () => {
    expect(subtasksBlockClose(main(), 'in_review')).toBe(true);
    expect(subtasksBlockClose(main(), 'completed')).toBe(true);
    expect(subtasksBlockClose(main(), 'in_progress')).toBe(false);
    expect(subtasksBlockClose(main({ subtasks_done: 3 }), 'completed')).toBe(false);
    expect(canTransitionTo(leadWeb, main(), 'in_review')).toBe(false);
    expect(canTransitionTo(admin, main(), 'completed')).toBe(false);
    expect(canTransitionTo(leadWeb, main({ subtasks_done: 3 }), 'in_review')).toBe(true);
    expect(subtasksBlockClose({ ...main(), subtasks_count: 0 }, 'completed')).toBe(false);
  });

  it('lets the lead owner approve a sub-task in another department', () => {
    expect(isApprover(leadWeb, sub())).toBe(true);
    expect(canTransitionTo(leadWeb, sub(), 'completed')).toBe(true);
    expect(isApprover({ id: 'member.c1', role: 'team_member' }, sub())).toBe(false);
    expect(isApprover(leadWeb, sub({ parent_id: null }))).toBe(false);
  });

  it('only admins, the lead owner or the assigner add sub-tasks; leads and admins create collectives', () => {
    expect(canAddSubtask(admin, main())).toBe(true);
    expect(canAddSubtask(leadWeb, main())).toBe(true);
    expect(canAddSubtask(memberWeb, main())).toBe(false);
    expect(canAddSubtask(admin, sub())).toBe(false);
    expect(canCreateCollective(admin)).toBe(true);
    expect(canCreateCollective(leadWeb)).toBe(true);
    expect(canCreateCollective(memberWeb)).toBe(false);
  });

  it('validates rows and lead candidates', () => {
    expect(collectiveRowsError([])).toMatch(/at least one/);
    expect(collectiveRowsError([{ key: 'a', title: ' ', assignee_id: 'x' }])).toMatch(/title/);
    expect(collectiveRowsError([{ key: 'a', title: 'Page', assignee_id: '' }])).toMatch(/assignee/);
    expect(collectiveRowsError([{ key: 'a', title: 'Page', assignee_id: 'm' }])).toBeNull();
    expect(isLeadOwnerCandidate({ role: 'team_lead' })).toBe(true);
    expect(isLeadOwnerCandidate({ role: 'team_member' })).toBe(false);
  });
});

describe('collective task UI', () => {
  it('pipeline card shows sub-task progress (1 of 3 = 33%)', () => {
    render(
      <TooltipProvider>
        <TaskPipelineCard task={main({ progress: 80 })} density="comfortable" onOpen={vi.fn()} onDragStart={vi.fn()} onDragEnd={vi.fn()} />
      </TooltipProvider>,
    );
    const bar = screen.getByTestId('task-subtask-progress');
    expect(bar.textContent).toContain('33%');
    expect(screen.queryByText('80%')).toBeNull();
  });

  it('members get no collective toggle', () => {
    render(<TaskDialog open actor={memberWeb} assignable={people} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByTestId('collective-toggle')).toBeNull();
  });

  it('admin creates a collective task: lead owner + sub-task rows in one request', async () => {
    const onSaved = vi.fn();
    vi.mocked(taskService.createCollective).mockResolvedValue({ ...main(), status: 'todo', subtasks_done: 0, subtask_progress: 0 } as Task);
    render(<TaskDialog open actor={admin} assignable={people} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^Title/i), { target: { value: 'ZEM launch' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getAllByTestId('collective-subtask-row')).toHaveLength(2);
    fireEvent.click(screen.getAllByText('Select option...')[0]);
    expect(screen.queryByText('Member Web')).toBeNull();
    fireEvent.click(screen.getByText('Lead Web'));
    fireEvent.change(screen.getByLabelText('Sub-task 1 name'), { target: { value: 'Build page' } });
    fireEvent.change(screen.getByLabelText('Sub-task 2 name'), { target: { value: 'Write copy' } });
    fireEvent.click(screen.getAllByText('Assign to…')[0]);
    fireEvent.click(screen.getByText('Member Web'));
    fireEvent.click(screen.getAllByText('Assign to…')[0]);
    fireEvent.click(screen.getByText('Member Content'));
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(taskService.createCollective).toHaveBeenCalled());
    const body = vi.mocked(taskService.createCollective).mock.calls[0][0];
    expect(body.main.assignee_id).toBe('lead.web');
    expect(body.main).not.toHaveProperty('assignee_ids');
    expect(body.main).not.toHaveProperty('recurrence');
    expect(body.subtasks).toEqual([
      { title: 'Build page', assignee_id: 'member.web' },
      { title: 'Write copy', assignee_id: 'member.c1' },
    ]);
    expect(taskService.createTask).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('refuses to send a collective task with an unassigned sub-task', async () => {
    render(<TaskDialog open actor={admin} assignable={people} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^Title/i), { target: { value: 'ZEM launch' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getAllByText('Select option...')[0]);
    fireEvent.click(screen.getByText('Lead Web'));
    fireEvent.change(screen.getByLabelText('Sub-task 1 name'), { target: { value: 'Build page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(screen.getAllByText(/needs an assignee/).length).toBeGreaterThan(0));
    expect(taskService.createCollective).not.toHaveBeenCalled();
  });

  it('main task detail shows the sub-task progress bar and hours breakdown', async () => {
    vi.mocked(taskService.getTask).mockResolvedValueOnce({
      ...main(),
      logged_hours: 4,
      own_logged_hours: 1,
      subtasks_logged_hours: 3,
      subtasks: [sub({ status: 'completed' })],
    } as Task);
    render(<TaskDialog open task={main()} actor={leadWeb} assignable={people} onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('task-hours-breakdown').textContent).toContain('3h on sub-tasks'));
    expect(screen.getByTestId('subtask-progress-label').textContent).toContain('1/3 done · 33%');
    expect(screen.getByTestId('add-subtask-row')).toBeTruthy();
  });

  it('sub-task detail names its main task and hides Log time for non-owners', async () => {
    vi.mocked(taskService.getTask).mockResolvedValueOnce({
      ...sub(),
      parent: { id: 'main1', serial: 'T-0100', title: 'ZEM launch', assignee_name: 'Lead Web' },
    } as Task);
    render(<TaskDialog open task={sub()} actor={leadWeb} assignable={people} onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('task-parent-link').textContent).toContain('T-0100'));
    expect(screen.queryByRole('button', { name: /Log time/i })).toBeNull();
    expect(screen.queryByTestId('add-subtask-row')).toBeNull();
  });
});
