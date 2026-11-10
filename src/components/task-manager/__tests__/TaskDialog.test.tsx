import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskDialog } from '../TaskDialog';
import type { Task } from '@/types/task';

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
  useToast: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => vi.fn(),
  usePrompt: () => vi.fn(),
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
  },
}));

describe('TaskDialog', () => {
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
});
