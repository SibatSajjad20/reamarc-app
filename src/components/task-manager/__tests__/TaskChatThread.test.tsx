import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskChatThread } from '../TaskChatThread';
import { serializeMention } from '../MentionInput';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

const getComments = vi.fn();
const getMentionable = vi.fn().mockResolvedValue({ items: [{ id: 'lead.web', name: 'Lead Web', department: 'Website' }] });
const markRead = vi.fn().mockResolvedValue({ ok: true });
const addComment = vi.fn().mockResolvedValue({ id: 'c2' });

vi.mock('@/services/taskService', () => ({
  taskService: {
    getComments: (...args: unknown[]) => getComments(...args),
    getMentionable: (...args: unknown[]) => getMentionable(...args),
    markRead: (...args: unknown[]) => markRead(...args),
    addComment: (...args: unknown[]) => addComment(...args),
  },
}));
vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));
vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

const conv = {
  task_id: 'tsk1',
  serial: 'T-0013',
  title: 'Landing',
  status: 'todo' as const,
  unread_count: 1,
  last_comment: { user_name: 'Lead Web', text_preview: 'Hi', created_at: '2026-11-10T10:00:00Z' },
};

describe('TaskChatThread', () => {
  it('pages history, serialises mentions, and opens the task', async () => {
    getComments.mockImplementation((_id: string, page: number) => {
      if (page === 1) {
        return Promise.resolve({
          items: [{ id: 'old', user_id: 'u', user_name: 'Old', text: 'older', created_at: '2026-11-09T10:00:00Z' }],
          total: 31,
        });
      }
      return Promise.resolve({
        items: [{ id: 'new', user_id: 'u2', user_name: 'Lead Web', text: 'latest', created_at: '2026-11-10T10:00:00Z' }],
        total: 31,
      });
    });
    const onOpen = vi.fn();
    render(<TaskChatThread conversation={conv} onBack={vi.fn()} onOpenTask={onOpen} />);
    await waitFor(() => expect(screen.getByText('latest')).toBeTruthy());
    fireEvent.click(screen.getByText('Load older'));
    await waitFor(() => expect(screen.getByText('older')).toBeTruthy());
    expect(serializeMention({ id: 'lead.web', name: 'Lead Web' })).toBe('@[Lead Web](lead.web)');
    fireEvent.click(screen.getByText('Open task'));
    expect(onOpen).toHaveBeenCalledWith('tsk1');
  });

  it('reloads on its own task id and on an id-less task event, not on another task', async () => {
    getComments.mockResolvedValue({ items: [], total: 0 });
    render(<TaskChatThread conversation={conv} onBack={vi.fn()} onOpenTask={vi.fn()} />);
    await waitFor(() => expect(getComments).toHaveBeenCalled());
    const afterMount = getComments.mock.calls.length;

    window.dispatchEvent(new CustomEvent('reamarc-task-activity', { detail: { kind: 'task_comment', task_id: 'tsk1' } }));
    await waitFor(() => expect(getComments.mock.calls.length).toBeGreaterThan(afterMount));
    const afterOwn = getComments.mock.calls.length;

    window.dispatchEvent(new CustomEvent('reamarc-task-activity', { detail: { kind: 'task_comment' } }));
    await waitFor(() => expect(getComments.mock.calls.length).toBeGreaterThan(afterOwn));
    const afterIdless = getComments.mock.calls.length;

    window.dispatchEvent(new CustomEvent('reamarc-task-activity', { detail: { kind: 'task_comment', task_id: 'other' } }));
    await Promise.resolve();
    expect(getComments.mock.calls.length).toBe(afterIdless);
  });
});
