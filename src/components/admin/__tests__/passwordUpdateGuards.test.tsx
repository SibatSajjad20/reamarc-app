import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { EditMemberModal } from '../EditMemberModal';
import { AdminPanel } from '../AdminPanel';
import { adminService } from '../../../services/adminService';
import type { AdminMember, UpdateMemberPayload } from '../../../types/admin';
import type { AuthUser } from '../../../types/auth';

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

const addToastMock = vi.fn();

const ownerUser: AuthUser = {
  id: 'usr_owner',
  email: 'owner@reamarc.com',
  name: 'Owner',
  role: 'admin',
  is_super_admin: true,
  company_id: 'company_reamarc',
  company: { id: 'company_reamarc', name: 'Reamarc', slug: 'reamarc' },
};

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: ownerUser,
    role: ownerUser.role,
    isAuthenticated: true,
    isLoading: false,
    switchCompany: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({
    addToast: addToastMock,
  }),
}));

vi.mock('../../../hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({
    workspaces: [],
    saveWorkspace: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('../../../services/adminService', () => ({
  adminService: {
    getCachedMembers: vi.fn().mockReturnValue(undefined),
    getCachedActivities: vi.fn().mockReturnValue(undefined),
    getCachedAdAccounts: vi.fn().mockReturnValue(undefined),
    hasInitialCache: vi.fn().mockReturnValue(false),
    getMembers: vi.fn().mockResolvedValue([]),
    getMembersActivity: vi.fn().mockResolvedValue([]),
    getAdAccounts: vi.fn().mockResolvedValue([]),
    updateMember: vi.fn(),
    createMember: vi.fn(),
    deleteMember: vi.fn(),
    sendMemberReminder: vi.fn(),
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

const multiCompanyOwnerEditable: AdminMember = {
  id: 'usr_7c47b0cc06',
  email: 'junaidjay27@gmail.com',
  full_name: 'Junaid',
  phone: '+923001234567',
  role: 'team_member',
  department: 'Website',
  departments: ['Website'],
  primary_department: 'Website',
  is_active: true,
  login_managed_elsewhere: true,
  can_edit: true,
  can_edit_identity: true,
  can_edit_role: true,
};

describe('EditMemberModal & AdminPanel password update safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends password when canEditIdentity is true even when loginManagedElsewhere is true', async () => {
    let submittedPayload: UpdateMemberPayload | null = null;
    const onSubmit = vi.fn().mockImplementation(async (_id, payload) => {
      submittedPayload = payload;
    });

    renderWithProviders(
      <EditMemberModal
        isOpen={true}
        member={multiCompanyOwnerEditable}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const pwdInput = screen.getByPlaceholderText('Enter new password or click generate');
    fireEvent.change(pwdInput, { target: { value: 'NewStrongPass123!' } });

    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(submittedPayload).toBeTruthy();
    expect(submittedPayload!.password).toBe('NewStrongPass123!');
    expect((submittedPayload as any).is_active).toBeUndefined();
  });

  it('shows error toast and keeps modal open when password was sent but password_updated is not true', async () => {
    vi.mocked(adminService.getMembers).mockResolvedValue([multiCompanyOwnerEditable]);
    vi.mocked(adminService.updateMember).mockResolvedValue({
      ...multiCompanyOwnerEditable,
      password_updated: false,
    });

    renderWithProviders(<AdminPanel activeSection="directory" />);

    const actionBtn = await screen.findByLabelText(/Actions for Junaid/i);
    fireEvent.pointerDown(actionBtn, { button: 0 });
    fireEvent.click(actionBtn);

    const editItem = await screen.findByText('Edit details');
    fireEvent.click(editItem);

    const pwdInput = await screen.findByPlaceholderText('Enter new password or click generate');
    fireEvent.change(pwdInput, { target: { value: 'NewStrongPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(adminService.updateMember).toHaveBeenCalled());
    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        'Password Not Updated',
        expect.any(String),
        'error',
      );
    });
    expect(addToastMock).not.toHaveBeenCalledWith(
      'Member Updated',
      expect.anything(),
      'success',
    );
    expect(screen.getByText('Edit member details')).toBeDefined();
  });

  it('toasts Member Updated and closes modal when password_updated is true', async () => {
    vi.mocked(adminService.getMembers).mockResolvedValue([multiCompanyOwnerEditable]);
    vi.mocked(adminService.updateMember).mockResolvedValue({
      ...multiCompanyOwnerEditable,
      password_updated: true,
    });

    renderWithProviders(<AdminPanel activeSection="directory" />);

    const actionBtn = await screen.findByLabelText(/Actions for Junaid/i);
    fireEvent.pointerDown(actionBtn, { button: 0 });
    fireEvent.click(actionBtn);

    const editItem = await screen.findByText('Edit details');
    fireEvent.click(editItem);

    const pwdInput = await screen.findByPlaceholderText('Enter new password or click generate');
    fireEvent.change(pwdInput, { target: { value: 'NewStrongPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        'Member Updated',
        'Profile changes saved.',
        'success',
      );
    });
  });
});
