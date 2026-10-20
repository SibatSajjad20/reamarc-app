import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { useClientForm } from '../useClientForm';

const confirmMock = vi.fn();

vi.mock('../../components/ui/ConfirmProvider', () => ({
  useConfirm: () => confirmMock,
}));

function GuardProbe({ dirty }: { dirty: boolean }) {
  const { confirmDiscard } = useUnsavedChangesGuard(dirty);
  return (
    <button type="button" onClick={() => void confirmDiscard().then((ok) => {
      (document.getElementById('nav-result') as HTMLElement).textContent = String(ok);
    })}>
      navigate
    </button>
  );
}

function FormProbe() {
  const form = useClientForm(null);
  const { confirmDiscard } = useUnsavedChangesGuard(form.isDirty);
  return (
    <div>
      <span data-testid="dirty">{String(form.isDirty)}</span>
      <button type="button" onClick={() => form.patch({ name: 'Edited' })}>edit</button>
      <button type="button" onClick={() => form.patch({ name: '' })}>revert</button>
      <button
        type="button"
        onClick={() => form.setPendingLogo(new File(['x'], 'logo.png', { type: 'image/png' }), 'blob:preview')}
      >
        logo
      </button>
      <button type="button" onClick={() => form.markClean()}>save</button>
      <button
        type="button"
        onClick={() => void confirmDiscard().then((ok) => {
          (document.getElementById('nav-result') as HTMLElement).textContent = String(ok);
        })}
      >
        navigate
      </button>
    </div>
  );
}

describe('useUnsavedChangesGuard', () => {
  afterEach(() => {
    cleanup();
    confirmMock.mockReset();
  });

  it('lets navigation through when the form is clean', async () => {
    confirmMock.mockReset();
    render(
      <>
        <div id="nav-result" />
        <GuardProbe dirty={false} />
      </>
    );
    fireEvent.click(screen.getByText('navigate'));
    await waitFor(() => expect(document.getElementById('nav-result')?.textContent).toBe('true'));
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('prevents beforeunload and prompts on in-app navigation when dirty', async () => {
    confirmMock.mockReset().mockResolvedValue(false);
    render(
      <>
        <div id="nav-result" />
        <GuardProbe dirty />
      </>
    );
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(event, 'returnValue', { writable: true, value: undefined });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByText('navigate'));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    await waitFor(() => expect(document.getElementById('nav-result')?.textContent).toBe('false'));
  });

  it('Discard navigates and Keep editing stays', async () => {
    confirmMock.mockReset().mockResolvedValueOnce(true);
    const { rerender } = render(
      <>
        <div id="nav-result" />
        <GuardProbe dirty />
      </>
    );
    fireEvent.click(screen.getByText('navigate'));
    await waitFor(() => expect(document.getElementById('nav-result')?.textContent).toBe('true'));

    confirmMock.mockResolvedValueOnce(false);
    rerender(
      <>
        <div id="nav-result" />
        <GuardProbe dirty />
      </>
    );
    fireEvent.click(screen.getByText('navigate'));
    await waitFor(() => expect(document.getElementById('nav-result')?.textContent).toBe('false'));
  });

  it('tracks field edits, pending logo, revert, and save', async () => {
    confirmMock.mockReset();
    render(
      <>
        <div id="nav-result" />
        <FormProbe />
      </>
    );
    expect(screen.getByTestId('dirty').textContent).toBe('false');

    fireEvent.click(screen.getByText('edit'));
    expect(screen.getByTestId('dirty').textContent).toBe('true');

    fireEvent.click(screen.getByText('revert'));
    expect(screen.getByTestId('dirty').textContent).toBe('false');

    fireEvent.click(screen.getByText('logo'));
    expect(screen.getByTestId('dirty').textContent).toBe('true');

    fireEvent.click(screen.getByText('save'));
    expect(screen.getByTestId('dirty').textContent).toBe('false');

    fireEvent.click(screen.getByText('navigate'));
    await waitFor(() => expect(document.getElementById('nav-result')?.textContent).toBe('true'));
    expect(confirmMock).not.toHaveBeenCalled();
  });
});
