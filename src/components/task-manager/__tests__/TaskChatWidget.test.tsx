import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskChatWidget } from '../TaskChatWidget';
import { useTaskChat } from '@/hooks/useTaskChat';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

const countsState = vi.hoisted(() => ({ canSeeTasks: true }));
const chatState = vi.hoisted(() => ({
  conversations: [
    {
      task_id: 'tsk1',
      serial: 'T-0013',
      title: 'Landing page',
      status: 'todo' as const,
      last_comment: { user_name: 'Lead Web', text_preview: 'Please check', created_at: '2026-11-10T10:00:00Z' },
      unread_count: 2,
    },
  ],
  total: 1,
  unreadTotal: 2,
  page: 1,
  setPage: vi.fn(),
  refresh: vi.fn(),
  markRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/useTaskCounts', () => ({
  useTaskCounts: () => ({ canSeeTasks: countsState.canSeeTasks, counts: null, refresh: vi.fn() }),
}));
vi.mock('@/hooks/useTaskChat', () => ({
  useTaskChat: vi.fn(() => chatState),
}));
vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));
vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));
vi.mock('@/services/taskService', () => ({
  taskService: {
    getComments: vi.fn().mockResolvedValue({ items: [{ id: 'c1', user_id: 'u1', user_name: 'Lead Web', text: 'Hi', created_at: '2026-11-10T10:00:00Z' }], total: 1 }),
    getMentionable: vi.fn().mockResolvedValue({ items: [] }),
    addComment: vi.fn().mockResolvedValue({ id: 'c2' }),
    markRead: vi.fn().mockResolvedValue({ ok: true }),
    getConversations: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getChatUnread: vi.fn().mockResolvedValue({ total: 0, by_task: {} }),
  },
}));

function mockMatchMedia(reduced = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: q.includes('reduce') ? reduced : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
}

describe('TaskChatWidget', () => {
  beforeEach(() => {
    mockMatchMedia(false);
    countsState.canSeeTasks = true;
    chatState.unreadTotal = 2;
  });

  it('is hidden when canSeeTasks is false', () => {
    countsState.canSeeTasks = false;
    const { container } = render(<TaskChatWidget />);
    expect(container.querySelector('[data-testid="task-chat-widget"]')).toBeNull();
  });

  it('shows unread badge and 99+', () => {
    chatState.unreadTotal = 120;
    render(<TaskChatWidget />);
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('applies bounce on unread increase and skips it under reduced motion', () => {
    const first = render(<TaskChatWidget />);
    chatState.unreadTotal = 5;
    first.rerender(<TaskChatWidget />);
    expect(first.getByTestId('task-chat-fab').className).toMatch(/animate-bounce/);
    first.unmount();

    mockMatchMedia(true);
    chatState.unreadTotal = 2;
    const again = render(<TaskChatWidget />);
    chatState.unreadTotal = 8;
    again.rerender(<TaskChatWidget />);
    expect(again.getByTestId('task-chat-fab').className).not.toMatch(/animate-bounce/);
    again.unmount();
  });

  it('opens a thread, sends a reply, and marks read', async () => {
    const { taskService } = await import('@/services/taskService');
    render(<TaskChatWidget />);
    fireEvent.click(screen.getByTestId('task-chat-fab'));
    fireEvent.click(screen.getByTestId('task-chat-row-tsk1'));
    expect(chatState.markRead).toHaveBeenCalledWith('tsk1');
    await waitFor(() => expect(screen.getByTestId('task-chat-thread')).toBeTruthy());
    const box = screen.getByPlaceholderText(/Reply/);
    fireEvent.change(box, { target: { value: 'Thanks' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(taskService.addComment).toHaveBeenCalled());
  });
});

describe('useTaskChat polling', () => {
  it('fetches conversations only while the panel is open', () => {
    render(<TaskChatWidget />);
    expect(useTaskChat).toHaveBeenCalledWith(true, false);
    fireEvent.click(screen.getByTestId('task-chat-fab'));
    expect(useTaskChat).toHaveBeenCalledWith(true, true);
  });
});
