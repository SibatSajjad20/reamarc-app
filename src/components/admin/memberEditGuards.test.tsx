import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { EditMemberModal } from './EditMemberModal';
import { UserManagementSection } from './sections/UserManagementSection';
import type { AdminMember, UpdateMemberPayload } from '../../types/admin';
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
  id: 'usr_admin',
  email: 'admin@acme.com',
  name: 'Admin User',
  role: 'admin',
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

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

const baseMember: AdminMember = {
  id: 'usr_tm',
  email: 'tm@acme.com',
  full_name: 'Team Member',
  role: 'team_member',
  is_active: true,
  can_edit: true,
  can_edit_identity: true,
  can_edit_role: true,
};

describe('member edit guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the row actions menu when can_edit is false', () => {
    renderWithProviders(
      <UserManagementSection
        members={[{ ...baseMember, full_name: 'Locked Admin', can_edit: false }]}
        isLoading={false}
        onAddMember={vi.fn()}
        onEditMember={vi.fn()}
        onDeleteMember={vi.fn()}
        onToggleStatus={vi.fn()}
      />
    );
    expect(screen.queryByLabelText(/Actions for Locked Admin/i)).toBeNull();
    expect(screen.queryByText('Edit details')).toBeNull();
  });

  it('shows the row actions menu when can_edit is true', async () => {
    renderWithProviders(
      <UserManagementSection
        members={[{ ...baseMember, full_name: 'Editable Person', can_edit: true }]}
        isLoading={false}
        onAddMember={vi.fn()}
        onEditMember={vi.fn()}
        onDeleteMember={vi.fn()}
        onToggleStatus={vi.fn()}
      />
    );
    const btn = screen.getByLabelText(/Actions for Editable Person/i);
    fireEvent.pointerDown(btn, { button: 0 });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText('Edit details')).toBeDefined();
    });
  });

  it('disables email, password, and role when flags are false', async () => {
    const submitted: UpdateMemberPayload[] = [];
    const onSubmit = vi.fn().mockImplementation(async (_id, payload: UpdateMemberPayload) => {
      submitted.push(payload);
    });
    renderWithProviders(
      <EditMemberModal
        isOpen={true}
        member={{
          ...baseMember,
          can_edit: true,
          can_edit_identity: false,
          can_edit_role: false,
        }}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText('Only the platform owner can change this login.')).toBeDefined();
    expect(screen.queryByRole('textbox', { name: /Work email/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/Enter new password/i)).toBeNull();

    const saveBtn = screen.getByRole('button', { name: /Save changes/i });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(submitted[0]).toBeDefined();
    expect(submitted[0].email).toBeUndefined();
    expect(submitted[0].role).toBeUndefined();
    expect(submitted[0].password).toBeUndefined();
  });

  it('keeps email and role editable when flags are true and omits unchanged email/role', async () => {
    const submitted: UpdateMemberPayload[] = [];
    const onSubmit = vi.fn().mockImplementation(async (_id, payload: UpdateMemberPayload) => {
      submitted.push(payload);
    });
    renderWithProviders(
      <EditMemberModal
        isOpen={true}
        member={baseMember}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByDisplayValue('tm@acme.com')).toBeDefined();
    const saveBtn = screen.getByRole('button', { name: /Save changes/i });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(submitted[0].email).toBeUndefined();
    expect(submitted[0].role).toBeUndefined();
  });
});
