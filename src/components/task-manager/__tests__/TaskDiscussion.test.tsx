import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskDiscussion } from '../TaskDiscussion';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

const confirm = vi.fn();

vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));
vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => confirm,
}));

describe('TaskDiscussion', () => {
  it('does not send add_watchers without confirm', async () => {
    confirm.mockResolvedValue(false);
    const onSubmit = vi.fn();
    render(
      <TaskDiscussion
        comments={[]}
        users={[{ id: 'u2', name: 'Lead Web', will_add_watcher: true }]}
        canAddWatchers
        onSubmit={onSubmit}
      />,
    );
    const box = screen.getByPlaceholderText(/Type @ to mention/);
    fireEvent.change(box, { target: { value: '@[Lead Web](u2) hello' } });
    fireEvent.click(screen.getByText('Comment'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith('@[Lead Web](u2) hello', { question: false, add_watchers: undefined });
  });

  it('sends add_watchers after confirm when the actor may add watchers', async () => {
    confirm.mockResolvedValue(true);
    const onSubmit = vi.fn();
    render(
      <TaskDiscussion
        comments={[]}
        users={[{ id: 'u2', name: 'Lead Web', will_add_watcher: true }]}
        canAddWatchers
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Type @ to mention/), {
      target: { value: '@[Lead Web](u2) hello' },
    });
    fireEvent.click(screen.getByText('Comment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('@[Lead Web](u2) hello', { question: false, add_watchers: ['u2'] }));
  });
});
