import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskDialog } from '../TaskDialog';
import type { Task } from '@/types/task';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

const getAssignable = vi.fn();
const assign = vi.fn();
const patchTask = vi.fn();

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
  usePrompt: () => vi.fn().mockResolvedValue(''),
}));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscard: async () => true }),
}));
vi.mock('@/services/taskService', () => ({
  taskService: {
    getComments: vi.fn().mockResolvedValue({ items: [] }),
    getAttachments: vi.fn().mockResolvedValue({ items: [] }),
    getActivity: vi.fn().mockResolvedValue({ items: [] }),
    getTask: vi.fn(),
    getAssignable: (...a: unknown[]) => getAssignable(...a),
    getMentionable: vi.fn().mockResolvedValue({ items: [] }),
    assign: (...a: unknown[]) => assign(...a),
    patchTask: (...a: unknown[]) => patchTask(...a),
  },
}));

const task: Task = {
  id: 'tsk1',
  serial: 'T-0013',
  title: 'Landing',
  status: 'todo',
  priority: 'medium',
  creator_id: 'lead.web',
  assigner_id: 'lead.web',
  assignee_id: 'lead.content',
  department: 'Website',
  involved_ids: ['lead.web', 'lead.content'],
  updated_at: '2026-11-10T00:00:00Z',
};

describe('TaskAssigneePicker', () => {
  beforeEach(() => {
    getAssignable.mockResolvedValue({
      items: [
        { id: 'lead.content', name: 'Lead Content', department: 'Content', role: 'team_lead' },
        { id: 'member.content1', name: 'Member Content 1', department: 'Content', role: 'team_member' },
      ],
    });
    assign.mockResolvedValue({ ...task, assignee_id: 'member.content1', assignee_name: 'Member Content 1' });
    patchTask.mockResolvedValue(task);
  });

  it('shows only the server assignable list and reassigns via assign, not PATCH', async () => {
    render(
      <TaskDialog
        open
        task={task}
        actor={{ id: 'lead.content', role: 'team_lead', primary_department: 'Content' }}
        assignable={[{ id: 'should-not-appear', name: 'Ghost User', department: 'SEO' }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    await waitFor(() => expect(getAssignable).toHaveBeenCalledWith('tsk1'));
    fireEvent.click(screen.getByText('Lead Content'));
    expect(await screen.findByText('Member Content 1')).toBeTruthy();
    expect(screen.queryByText('Ghost User')).toBeNull();
    fireEvent.click(screen.getByText('Member Content 1'));
    fireEvent.click(screen.getByRole('button', { name: /start|save/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('tsk1', 'member.content1', undefined));
    const patchPayload = patchTask.mock.calls[0]?.[1] || {};
    expect(patchPayload.assignee_id).toBeUndefined();
  });
});
