import { describe, it, expect, vi, beforeEach } from 'vitest';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = MockResizeObserver;
  if (!(window as any).PointerEvent) {
    (window as any).PointerEvent = class extends MouseEvent {};
  }
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OwnerMembersTab } from './OwnerMembersTab';
import { GiveAccessDialog } from './GiveAccessDialog';
import { NewMemberDialog } from './NewMemberDialog';
import type { Company, OwnerMember } from '@/services/ownerService';

const grantCompanyAccess = vi.fn();
const provisionMember = vi.fn();

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'usr_owner',
      email: 'owner@reamarc.test',
      name: 'Owner',
      role: 'admin',
      company_id: 'comp_reamarc',
      is_super_admin: true,
      company: { id: 'comp_reamarc', name: 'Reamarc' },
    },
  }),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

vi.mock('@/services/ownerService', () => ({
  ownerService: {
    grantCompanyAccess: (...args: unknown[]) => grantCompanyAccess(...args),
    provisionMember: (...args: unknown[]) => provisionMember(...args),
    removeCompanyAccess: vi.fn(),
  },
}));

const companies: Company[] = [
  {
    id: 'comp_reamarc',
    name: 'Reamarc',
    slug: 'reamarc',
    plan: 'pro',
    status: 'active',
    timezone: 'Asia/Karachi',
    accent_color: '#6847E0',
  },
  {
    id: 'comp_dataviz',
    name: 'DataViz',
    slug: 'dataviz',
    plan: 'starter',
    status: 'active',
    timezone: 'Asia/Karachi',
    accent_color: '#00AA66',
  },
];

const ownerMember: OwnerMember = {
  id: 'usr_owner',
  email: 'owner@reamarc.test',
  name: 'Owner',
  full_name: 'Owner',
  is_active: true,
  is_super_admin: true,
  company_id: 'comp_reamarc',
  memberships: [
    {
      id: 'mem_home',
      company_id: 'comp_reamarc',
      company_name: 'Reamarc',
      company_slug: 'reamarc',
      role: 'admin',
      status: 'active',
      needs_setup: false,
    },
  ],
};

async function pickSelect(label: RegExp | string, option: string) {
  fireEvent.click(screen.getByLabelText(label));
  const opt = await screen.findByRole('button', { name: option });
  fireEvent.click(opt);
}

describe('Companies admin grant UI', () => {
  beforeEach(() => {
    grantCompanyAccess.mockReset();
    provisionMember.mockReset();
    grantCompanyAccess.mockResolvedValue({ ok: true, role: 'admin' });
    provisionMember.mockResolvedValue({ ok: true, user_id: 'usr_new', company_id: 'comp_dataviz' });
  });

  it('shows Give access on the owner row', async () => {
    render(
      <OwnerMembersTab
        members={[ownerMember]}
        companies={companies}
        isLoading={false}
        onRefreshData={async () => {}}
        onOpenGiveAccess={vi.fn()}
        onOpenSetPassword={vi.fn()}
        onOpenNewMemberModal={vi.fn()}
      />
    );

    const actionBtns = screen.getAllByLabelText('Member actions');
    fireEvent.pointerDown(actionBtns[0], { button: 0 });
    fireEvent.click(actionBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Give access to a company')).toBeDefined();
    });
    expect(screen.queryByText('Set starting password')).toBeNull();
  });

  it('GiveAccessDialog role select sends role and hides companies the user already has', async () => {
    render(
      <GiveAccessDialog
        user={ownerMember}
        companies={companies}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.queryByText('Reamarc')).toBeNull();
    await pickSelect(/Company/i, 'DataViz');
    await pickSelect(/^Role$/i, 'Admin');
    expect(screen.getByText(/They'll be Admin of DataViz straight away/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /^Give access$/i }));
    await waitFor(() => {
      expect(grantCompanyAccess).toHaveBeenCalledWith('usr_owner', 'comp_dataviz', 'admin');
    });
  });

  it('NewMemberDialog sends the selected role', async () => {
    render(
      <NewMemberDialog
        companies={companies}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'Ada Admin' } });
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), {
      target: { value: 'ada@example.com' },
    });
    await pickSelect(/Company/i, 'DataViz');
    await pickSelect(/^Role$/i, 'Admin');
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: 'StartingPwd1!' } });

    fireEvent.click(screen.getByRole('button', { name: /Create member/i }));
    await waitFor(() => {
      expect(provisionMember).toHaveBeenCalled();
    });
    expect(provisionMember.mock.calls[0][0].role).toBe('admin');
  });
});
