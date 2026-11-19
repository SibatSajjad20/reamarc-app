import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { AddMemberModal, buildClientUpdatePayload } from './AddMemberModal';
import type { AdminMember } from '../../types/admin';
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
    getWorkspaces: vi.fn().mockResolvedValue([
      { id: 'ws_acme', name: 'Acme Foods', status: 'active' },
      { id: 'ws_beta', name: 'Beta Labs', status: 'active' },
    ]),
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}


const clientMember = {
  id: 'usr_client_1',
  full_name: 'Rida Client',
  email: 'rida@acmefoods.com',
  role: 'client',
  phone: '+92 300 1112233',
  is_active: true,
  workspace_ids: ['ws_acme'],
  can_edit: true,
  can_edit_identity: true,
  can_edit_role: true,
} as unknown as AdminMember;

describe('AddMemberModal - HR role options', () => {
  it('offers HR only Team member and Team lead in the role picker', () => {
    renderWithProviders(
      <AddMemberModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} defaultRole="team_member" />,
    );
    expect(screen.getByText('Team member')).toBeTruthy();
    expect(screen.getByText('Team lead')).toBeTruthy();
    expect(screen.queryByText('HR')).toBeNull();
    expect(screen.queryByText('Operations')).toBeNull();
    expect(screen.queryByText('Admin')).toBeNull();
  });
});

describe('AddMemberModal - client account form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has no phone field when adding a client', () => {
    renderWithProviders(
      <AddMemberModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} defaultRole="client" />,
    );
    expect(screen.getByText('Add client account', { selector: 'h2, h1, [role="heading"], div, span' })).toBeTruthy();
    expect(document.querySelector('input[name="phone"]')).toBeNull();
    expect(screen.queryByText('Phone / WhatsApp')).toBeNull();
  });

  it('keeps a team member phone field', () => {
    renderWithProviders(
      <AddMemberModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} defaultRole="team_member" />,
    );
    expect(document.querySelector('input[name="phone"]')).not.toBeNull();
  });

  it('edits a client with the client form, prefilled, without phone or role fields', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderWithProviders(
      <AddMemberModal isOpen onClose={onClose} member={clientMember} onUpdate={onUpdate} defaultRole="client" />,
    );
    expect(screen.getAllByText('Edit client account').length).toBeGreaterThan(0);
    expect((document.querySelector('input[name="fullName"]') as HTMLInputElement).value).toBe('Rida Client');
    expect((document.querySelector('input[name="email"]') as HTMLInputElement).value).toBe('rida@acmefoods.com');
    expect(document.querySelector('input[name="phone"]')).toBeNull();
    expect(screen.queryByText('Role')).toBeNull();
    expect(screen.queryByText('Joining date')).toBeNull();
    expect(screen.getAllByText('Client workspace', { exact: false }).length).toBeGreaterThan(0);

    fireEvent.change(document.querySelector('input[name="fullName"]') as HTMLInputElement, {
      target: { value: 'Rida K. Client' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith('usr_client_1', { full_name: 'Rida K. Client' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open and shows the error when saving a client fails', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('One or more selected clients are not active.'));
    const onClose = vi.fn();
    renderWithProviders(
      <AddMemberModal isOpen onClose={onClose} member={clientMember} onUpdate={onUpdate} defaultRole="client" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(await screen.findByText('One or more selected clients are not active.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when the create call reports nothing was created', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("No account was created. This email can't be used here."));
    const onClose = vi.fn();
    renderWithProviders(
      <AddMemberModal isOpen onClose={onClose} onSubmit={onSubmit} defaultRole="team_member" />,
    );
    fireEvent.change(document.querySelector('input[name="fullName"]') as HTMLInputElement, { target: { value: 'New Person' } });
    fireEvent.change(document.querySelector('input[name="email"]') as HTMLInputElement, { target: { value: 'new@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add member/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(await screen.findByText(/No account was created/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('buildClientUpdatePayload', () => {
  const base = {
    fullName: 'Rida Client',
    email: 'rida@acmefoods.com',
    workspaceId: 'ws_acme',
    password: '',
    isActive: true,
    canEditIdentity: true,
    loginManagedElsewhere: false,
  };

  it('sends nothing when nothing changed', () => {
    expect(buildClientUpdatePayload(clientMember, base)).toEqual({});
  });

  it('never sends a phone and only sends changed fields', () => {
    const payload = buildClientUpdatePayload(clientMember, {
      ...base,
      email: 'Rida.New@AcmeFoods.com',
      workspaceId: 'ws_beta',
      password: 'abcd-efgh-ijkl',
      isActive: false,
    });
    expect(payload).toEqual({
      email: 'rida.new@acmefoods.com',
      workspace_ids: ['ws_beta'],
      password: 'abcd-efgh-ijkl',
      is_active: false,
    });
    expect('phone' in payload).toBe(false);
  });

  it('keeps extra linked workspaces when the primary one changes', () => {
    const multi = { ...clientMember, workspace_ids: ['ws_acme', 'ws_gamma'] } as AdminMember;
    expect(buildClientUpdatePayload(multi, { ...base, workspaceId: 'ws_beta' }).workspace_ids).toEqual([
      'ws_beta',
      'ws_gamma',
    ]);
  });

  it('skips identity fields when the login is managed elsewhere', () => {
    const payload = buildClientUpdatePayload(clientMember, {
      ...base,
      fullName: 'Other',
      email: 'other@x.com',
      password: 'pw',
      isActive: false,
      canEditIdentity: false,
      loginManagedElsewhere: true,
    });
    expect(payload).toEqual({});
  });
});
