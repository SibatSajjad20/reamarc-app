import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { AddMemberModal } from './AddMemberModal';
import type { AuthUser } from '../../types/auth';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = MockResizeObserver;
  if (!window.PointerEvent) {
    (window as any).PointerEvent = class extends MouseEvent {};
  }
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
}

const mockUser: AuthUser = {
  id: 'usr_hr',
  email: 'hr@acme.com',
  name: 'HR User',
  role: 'hr',
  company_id: 'comp_acme',
  company: { id: 'comp_acme', name: 'Acme Media', slug: 'acme' },
};

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    role: mockUser.role,
    isAuthenticated: true,
    isLoading: false,
    switchCompany: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../services/workspaceService', () => ({
  workspaceService: {
    getWorkspaces: vi.fn().mockResolvedValue([]),
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('AddMemberModal - Reused Email & Conflict Choices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error and offers two choices when email belongs to a deactivated member', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce({
      name: 'ApiError',
      status: 409,
      message: 'This email belongs to deactivated member Jane HR.',
      details: {
        detail: {
          code: 'DEACTIVATED_MEMBER_EMAIL_REUSED',
          message: 'This email belongs to deactivated member Jane HR.',
          previous_name: 'Jane HR',
          previous_user_id: 'usr_jane_123',
          email: 'hr@acme.com',
        },
      },
    });
    const onClose = vi.fn();

    renderWithProviders(
      <AddMemberModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        defaultRole="hr"
      />
    );

    // Fill in required fields
    fireEvent.change(screen.getByPlaceholderText('Rida Kamal'), {
      target: { value: 'New HR Person' },
    });
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), {
      target: { value: 'hr@acme.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+92 300 1234567'), {
      target: { value: '+92 300 1234567' },
    });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /^add member$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    // Modal must NOT close
    expect(onClose).not.toHaveBeenCalled();

    // Reused email conflict banner must appear with both choices
    const banner = await screen.findByTestId('reused-email-conflict-banner');
    expect(banner).toBeDefined();
    expect(screen.getAllByText(/Jane HR/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Add as a new person/i)).toBeDefined();
    expect(screen.getByText(/Reactivate previous person/i)).toBeDefined();

    // Choice A: "Add as New Person" (Primary/Default)
    const addNewBtn = screen.getByRole('button', { name: /Add as New Person/i });
    expect(addNewBtn).toBeDefined();

    // Choice B: "Reactivate Person"
    const reactivateBtn = screen.getByRole('button', { name: /Reactivate Person/i });
    expect(reactivateBtn).toBeDefined();
  });

  it('submits with reused_email_action: archive_and_create when user chooses "Add as New Person"', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce({
        name: 'ApiError',
        status: 409,
        details: {
          detail: {
            code: 'DEACTIVATED_MEMBER_EMAIL_REUSED',
            previous_name: 'Jane HR',
            previous_user_id: 'usr_jane_123',
            email: 'hr@acme.com',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'usr_new_hr_456',
        full_name: 'New HR Person',
        email: 'hr@acme.com',
        role: 'hr',
        is_active: true,
      });

    const onClose = vi.fn();

    renderWithProviders(
      <AddMemberModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        defaultRole="hr"
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Rida Kamal'), {
      target: { value: 'New HR Person' },
    });
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), {
      target: { value: 'hr@acme.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+92 300 1234567'), {
      target: { value: '+92 300 1234567' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^add member$/i }));

    const addNewBtn = await screen.findByRole('button', { name: /Add as New Person/i });
    fireEvent.click(addNewBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          full_name: 'New HR Person',
          email: 'hr@acme.com',
          reused_email_action: 'archive_and_create',
        })
      );
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('submits with reused_email_action: reactivate when user chooses "Reactivate Person"', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce({
        name: 'ApiError',
        status: 409,
        details: {
          detail: {
            code: 'DEACTIVATED_MEMBER_EMAIL_REUSED',
            previous_name: 'Jane HR',
            previous_user_id: 'usr_jane_123',
            email: 'hr@acme.com',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'usr_jane_123',
        full_name: 'Jane HR',
        email: 'hr@acme.com',
        role: 'hr',
        is_active: true,
      });

    const onClose = vi.fn();

    renderWithProviders(
      <AddMemberModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        defaultRole="hr"
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Rida Kamal'), {
      target: { value: 'Jane HR' },
    });
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), {
      target: { value: 'hr@acme.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+92 300 1234567'), {
      target: { value: '+92 300 1234567' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^add member$/i }));

    const reactivateBtn = await screen.findByRole('button', { name: /Reactivate Person/i });
    fireEvent.click(reactivateBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          email: 'hr@acme.com',
          reused_email_action: 'reactivate',
        })
      );
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('displays clear already-a-member error when email is already registered', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(
      new Error('A member with this email is already a member of your company.')
    );
    const onClose = vi.fn();

    renderWithProviders(
      <AddMemberModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        defaultRole="hr"
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Rida Kamal'), {
      target: { value: 'Active Person' },
    });
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), {
      target: { value: 'active@acme.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+92 300 1234567'), {
      target: { value: '+92 300 1234567' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^add member$/i }));

    await waitFor(() => {
      expect(screen.getByText(/already a member of your company/i)).toBeDefined();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
