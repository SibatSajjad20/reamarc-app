import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TaskDialog } from '../TaskDialog';
import type { Task } from '@/types/task';
import { taskService } from '@/services/taskService';

const { mockAddToast, mockPrompt, mockConfirm } = vi.hoisted(() => ({
  mockAddToast: vi.fn(),
  mockPrompt: vi.fn(),
  mockConfirm: vi.fn(),
}));

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));
vi.mock('@/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [] }),
}));
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));
vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => mockConfirm,
  usePrompt: () => mockPrompt,
}));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscard: async () => true }),
}));
vi.mock('@/services/taskService', () => ({
  taskService: {
    getComments: vi.fn().mockResolvedValue({ items: [] }),
    getAttachments: vi.fn().mockResolvedValue({ items: [] }),
    getActivity: vi.fn().mockResolvedValue({ items: [] }),
    getTask: vi.fn().mockResolvedValue(null),
    getAssignable: vi.fn().mockResolvedValue({ items: [] }),
    getMentionable: vi.fn().mockResolvedValue({ items: [] }),
    assign: vi.fn(),
    patchTask: vi.fn(),
    createTask: vi.fn(),
    changeStage: vi.fn(),
    addChecklist: vi.fn(),
    patchChecklist: vi.fn(),
    deleteChecklist: vi.fn(),
    remove: vi.fn(),
  },
}));

describe('TaskDialog', () => {
  afterEach(() => {
    cleanup();
    mockPrompt.mockReset();
    mockConfirm.mockReset();
    mockAddToast.mockReset();
    vi.mocked(taskService.patchTask).mockReset();
    vi.mocked(taskService.createTask).mockReset();
    vi.mocked(taskService.changeStage).mockReset();
    vi.mocked(taskService.remove).mockReset();
  });
  it('keeps the discussion pane from scrolling with the form on desktop', () => {
    render(
      <TaskDialog
        open
        actor={{ id: 'lead.content', role: 'team_lead', primary_department: 'Content' }}
        assignable={[{ id: 'member.content1', name: 'Member Content 1', department: 'Content', role: 'team_member' }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const body = screen.getByTestId('task-dialog-form').parentElement as HTMLElement;
    expect(body.className).toMatch(/lg:overflow-hidden/);
    expect(screen.getByTestId('task-dialog-form').className).toMatch(/lg:overflow-y-auto/);
    expect(screen.getByTestId('task-dialog-side').className).toMatch(/lg:overflow-hidden/);
    expect(screen.getByRole('tablist').className).toMatch(/shrink-0/);
  });

  it('requires title and shows read-only department', () => {
    render(
      <TaskDialog
        open
        actor={{ id: 'lead.content', role: 'team_lead', primary_department: 'Content' }}
        assignable={[{ id: 'member.content1', name: 'Member Content 1', department: 'Content', role: 'team_member' }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText('Create task')).toBeTruthy();
    expect(screen.getByText(/Assigned person/)).toBeTruthy();
    expect(screen.getByTestId('task-dialog-primary')).toHaveProperty('disabled', true);
    expect(screen.getByText('Department')).toBeTruthy();
    const dept = screen.getByDisplayValue('Content');
    expect(dept).toHaveProperty('readOnly', true);
  });

  it('shows Approve and Send back when in review for assigner', () => {
    const task: Task = {
      id: 'tsk1',
      serial: 'T-0009',
      title: 'Review me',
      status: 'in_review',
      priority: 'medium',
      creator_id: 'lead.content',
      assigner_id: 'lead.content',
      assignee_id: 'member.content1',
      department: 'Content',
      involved_ids: ['lead.content', 'member.content1'],
      updated_at: '2026-11-10T00:00:00Z',
    };
    render(
      <TaskDialog
        open
        task={task}
        actor={{ id: 'lead.content', role: 'team_lead', primary_department: 'Content' }}
        assignable={[{ id: 'member.content1', name: 'Member Content 1', department: 'Content' }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Send back')).toBeTruthy();
    expect(screen.getByText('T-0009')).toBeTruthy();
    expect(screen.queryByText('Reminders')).toBeNull();
  });

  it('hides Approve and Send back for the assignee', () => {
    const task: Task = {
      id: 'tsk1',
      serial: 'T-0009',
      title: 'Review me',
      status: 'in_review',
      priority: 'medium',
      creator_id: 'lead.content',
      assigner_id: 'lead.content',
      assignee_id: 'member.content1',
      department: 'Content',
      involved_ids: ['lead.content', 'member.content1'],
      updated_at: '2026-11-10T00:00:00Z',
    };
    render(
      <TaskDialog
        open
        task={task}
        actor={{ id: 'member.content1', role: 'team_member', primary_department: 'Content' }}
        assignable={[{ id: 'member.content1', name: 'Member Content 1', department: 'Content' }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Send back')).toBeNull();
  });

  it('shows Approve for a department lead who is not the assignee', () => {
    const task: Task = {
      id: 'tsk1',
      serial: 'T-0009',
      title: 'Review me',
      status: 'in_review',
      priority: 'medium',
      creator_id: 'lead.web',
      assigner_id: 'lead.content',
      assignee_id: 'member.content1',
      department: 'Content',
      assignment_chain: [
        { from_id: 'lead.web', to_id: 'lead.content' },
        { from_id: 'lead.content', to_id: 'member.content1' },
      ],
      involved_ids: ['lead.web', 'lead.content', 'member.content1'],
      updated_at: '2026-11-10T00:00:00Z',
    };
    render(
      <TaskDialog
        open
        task={task}
        actor={{ id: 'lead.content', role: 'team_lead', primary_department: 'Content' }}
        assignable={[{ id: 'member.content1', name: 'Member Content 1', department: 'Content' }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Send back')).toBeTruthy();
  });

  it('defaultStage in_progress creates then changeStage; failure keeps To Do; none skips changeStage', async () => {
    const created = { id: 'new1', serial: 'T-0100', title: 'From board', status: 'todo', priority: 'medium' };
    const moved = { ...created, status: 'in_progress' };
    vi.mocked(taskService.createTask).mockResolvedValue(created as Task);
    vi.mocked(taskService.changeStage).mockResolvedValue(moved as Task);
    const onSaved = vi.fn();

    const { unmount } = render(
      <TaskDialog
        open
        defaultStage="in_progress"
        actor={{ id: 'admin', role: 'admin' }}
        assignable={[{ id: 'admin', name: 'Ada Admin', role: 'admin', department: 'Content' }]}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    const title = screen.getByLabelText(/Title/i) as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'From board' } });
    fireEvent.click(screen.getByText('Select option...'));
    fireEvent.click(screen.getByText('Ada Admin'));
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(taskService.changeStage).toHaveBeenCalledWith('new1', 'in_progress'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(moved));
    unmount();

    vi.mocked(taskService.createTask).mockClear();
    vi.mocked(taskService.changeStage).mockClear();
    vi.mocked(taskService.changeStage).mockRejectedValue(new Error('blocked by policy'));
    mockAddToast.mockClear();
    const onSavedFail = vi.fn();
    const second = render(
      <TaskDialog
        open
        defaultStage="in_progress"
        actor={{ id: 'admin', role: 'admin' }}
        assignable={[{ id: 'admin', name: 'Ada Admin', role: 'admin', department: 'Content' }]}
        onClose={vi.fn()}
        onSaved={onSavedFail}
      />,
    );
    fireEvent.change(second.getByLabelText(/Title/i), { target: { value: 'From board' } });
    fireEvent.click(second.getByText('Select option...'));
    fireEvent.click(second.getByText('Ada Admin'));
    fireEvent.click(second.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(onSavedFail).toHaveBeenCalledWith(created));
    expect(mockAddToast).toHaveBeenCalledWith('Created in To Do', 'blocked by policy', 'error');
    second.unmount();

    vi.mocked(taskService.createTask).mockClear();
    vi.mocked(taskService.changeStage).mockClear();
    const onSavedBase = vi.fn();
    render(
      <TaskDialog
        open
        actor={{ id: 'admin', role: 'admin' }}
        assignable={[{ id: 'admin', name: 'Ada Admin', role: 'admin', department: 'Content' }]}
        onClose={vi.fn()}
        onSaved={onSavedBase}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Plain' } });
    fireEvent.click(screen.getByText('Select option...'));
    fireEvent.click(screen.getByText('Ada Admin'));
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(1));
    expect(taskService.changeStage).not.toHaveBeenCalled();
  });

  it('resets discussion, files, and activity when opening create after a task', async () => {
    vi.mocked(taskService.getComments).mockResolvedValue({
      items: [{ id: 'c1', text: 'leftover comment', author_name: 'A', created_at: '2026-11-10T00:00:00Z' }],
    } as any);
    vi.mocked(taskService.getAttachments).mockResolvedValue({
      items: [{ id: 'a1', name: 'leftover.pdf', kind: 'upload', task_id: 'tsk1', created_at: '2026-11-10T00:00:00Z' }],
    } as any);
    vi.mocked(taskService.getActivity).mockResolvedValue({
      items: [{ id: 'act1', type: 'created', body: 'Created leftover', created_at: '2026-11-10T00:00:00Z' }],
    } as any);
    const task: Task = {
      id: 'tsk1',
      serial: 'T-0001',
      title: 'Open me',
      status: 'todo',
      priority: 'medium',
      comments_count: 4,
      attachments_count: 2,
    };
    const actor = { id: 'admin', role: 'admin' as const };
    const { rerender } = render(
      <TaskDialog open task={task} actor={actor} assignable={[]} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByRole('tab', { name: /Discussion/ }).textContent).toMatch(/1/));
    rerender(<TaskDialog open actor={actor} assignable={[]} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText('New task')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Discussion/ }).textContent).not.toMatch(/1/);
    expect(screen.queryByText('leftover.pdf')).toBeNull();
    expect(screen.queryByText('Created leftover')).toBeNull();
  });

  it('toggles a checklist item immediately without waiting on the patch', async () => {
    let finish!: (value: Task) => void;
    vi.mocked(taskService.patchChecklist).mockImplementation(
      () => new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const task: Task = {
      id: 'tsk1',
      serial: 'T-0001',
      title: 'Checks',
      status: 'todo',
      priority: 'medium',
      creator_id: 'admin',
      assigner_id: 'admin',
      assignee_id: 'admin',
      checklist: [{ id: 'c1', text: 'Ship it', done: false }],
    };
    const onSaved = vi.fn();
    render(
      <TaskDialog open task={task} actor={{ id: 'admin', role: 'admin' }} assignable={[]} onClose={vi.fn()} onSaved={onSaved} />,
    );
    fireEvent.click(screen.getByText('Ship it'));
    expect(screen.getByRole('checkbox', { name: /Ship it/ }).getAttribute('data-state')).toBe('checked');
    expect(onSaved).not.toHaveBeenCalled();
    finish({ ...task, checklist: [{ id: 'c1', text: 'Ship it', done: true }] });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'tsk1' }), { refreshList: false }));
  });

  it('shows the child serial for a subtask of T-0001', async () => {
    const child: Task = {
      id: 'tsk-child',
      serial: 'T-0002',
      title: 'Child work',
      status: 'todo',
      priority: 'medium',
      parent_id: 'tsk1',
    };
    const task: Task = {
      id: 'tsk1',
      serial: 'T-0001',
      title: 'Parent',
      status: 'todo',
      priority: 'medium',
      creator_id: 'admin',
      assigner_id: 'admin',
      assignee_id: 'admin',
      subtasks: [child],
    };
    vi.mocked(taskService.getTask).mockResolvedValue(task);
    render(
      <TaskDialog open task={task} actor={{ id: 'admin', role: 'admin' }} assignable={[]} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    await waitFor(() => expect(document.querySelector('[data-subtask-serial="T-0002"]')).toBeTruthy());
    expect(screen.getByText('Subtasks of T-0001')).toBeTruthy();
    expect(screen.getByText(/Child work/)).toBeTruthy();
  });

  const editTodo: Task = {
    id: 'tsk39',
    serial: 'T-0039',
    title: 'Cross-dept: landing page copy review',
    status: 'todo',
    priority: 'high',
    creator_id: 'admin',
    assigner_id: 'admin',
    assignee_id: 'member.content1',
    department: 'Content',
    involved_ids: ['admin', 'member.content1'],
    updated_at: '2026-11-11T00:00:00Z',
  };
  const adminActor = { id: 'admin', role: 'admin' as const };

  it('shows Save as the primary when an existing task is dirty, then restores Start after save', async () => {
    const saved: Task = { ...editTodo, title: 'Updated landing copy', updated_at: '2026-11-11T01:00:00Z' };
    vi.mocked(taskService.patchTask).mockResolvedValue(saved);
    const onSaved = vi.fn();
    render(
      <TaskDialog open task={editTodo} actor={adminActor} assignable={[]} onClose={vi.fn()} onSaved={onSaved} />,
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(screen.queryByTestId('task-dialog-save')).toBeNull();
    expect(screen.getByText('Close')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Updated landing copy' } });
    expect(screen.getByTestId('task-dialog-save')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.getByText('Close')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(taskService.patchTask).toHaveBeenCalledWith(
      'tsk39',
      expect.objectContaining({ title: 'Updated landing copy' }),
    ));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, { refreshList: false }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy());
    expect(screen.queryByTestId('task-dialog-save')).toBeNull();
  });

  it('prompts Discard vs Save when closing a dirty edit, and discard does not PATCH', async () => {
    const onClose = vi.fn();
    render(
      <TaskDialog open task={editTodo} actor={adminActor} assignable={[]} onClose={onClose} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Unsaved title' } });
    fireEvent.click(screen.getByText('Close'));
    const confirm = await screen.findByTestId('task-unsaved-changes');
    expect(confirm.textContent).toMatch(/Unsaved changes/);
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(taskService.patchTask).not.toHaveBeenCalled();
  });

  it('saves field edits from the close-without-save confirm then closes', async () => {
    const saved: Task = { ...editTodo, title: 'Kept edits', updated_at: '2026-11-11T01:00:00Z' };
    vi.mocked(taskService.patchTask).mockResolvedValue(saved);
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <TaskDialog open task={editTodo} actor={adminActor} assignable={[]} onClose={onClose} onSaved={onSaved} />,
    );
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Kept edits' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    const confirm = await screen.findByTestId('task-unsaved-changes');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(taskService.patchTask).toHaveBeenCalledWith(
      'tsk39',
      expect.objectContaining({ title: 'Kept edits' }),
    ));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, { refreshList: false }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('does not prompt when closing a clean existing task', async () => {
    const onClose = vi.fn();
    render(
      <TaskDialog open task={editTodo} actor={adminActor} assignable={[]} onClose={onClose} onSaved={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('task-unsaved-changes')).toBeNull();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('hides Save on a completed task until a field is edited', () => {
    const completed: Task = { ...editTodo, status: 'completed', title: 'Done work' };
    render(
      <TaskDialog open task={completed} actor={adminActor} assignable={[]} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByTestId('task-dialog-save')).toBeNull();
    expect(screen.queryByTestId('task-dialog-primary')).toBeNull();
    expect(screen.getByText('Close')).toBeTruthy();
  });

  it('shows Saving on the primary while field edits are in flight', async () => {
    let finish!: (task: Task) => void;
    vi.mocked(taskService.patchTask).mockImplementation(
      () => new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <TaskDialog open task={editTodo} actor={adminActor} assignable={[]} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Updated landing copy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getAllByText('Saving…').length).toBeGreaterThan(0));
    finish({ ...editTodo, title: 'Updated landing copy', updated_at: '2026-11-11T01:00:00Z' });
    await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());
  });

  it('keeps Create task as the primary on the add-task flow even when dirty', () => {
    render(
      <TaskDialog open actor={adminActor} assignable={[]} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'New board task' } });
    expect(screen.getByRole('button', { name: 'Create task' })).toBeTruthy();
    expect(screen.queryByTestId('task-dialog-save')).toBeNull();
  });
});
