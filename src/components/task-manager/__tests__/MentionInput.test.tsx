import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MentionInput, serializeMention } from '../MentionInput';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

describe('MentionInput', () => {
  it('serialises mention tokens', () => {
    expect(serializeMention({ id: 'u1', name: 'Lead Content' })).toBe('@[Lead Content](u1)');
  });

  it('opens picker on @', async () => {
    const onChange = vi.fn();
    render(
      <MentionInput
        value=""
        onChange={onChange}
        users={[{ id: 'u1', name: 'Lead Content', department: 'Content' }]}
      />,
    );
    const box = screen.getByPlaceholderText(/Type @ to mention/);
    fireEvent.keyDown(box, { key: '@' });
    fireEvent.change(box, { target: { value: '@Le' } });
    expect(await screen.findByTestId('mention-results')).toBeTruthy();
    expect(screen.getByText('Lead Content')).toBeTruthy();
  });
});
