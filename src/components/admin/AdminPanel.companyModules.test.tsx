import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const authState = vi.hoisted(() => ({
  user: {
    id: 'cm_test_dv_admin',
    role: 'admin',
    company_modules: ['sales', 'active_clients'],
  } as any,
}));

const getMembers = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getMembersActivity = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getAdAccounts = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));
vi.mock('../../hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [], saveWorkspace: vi.fn(), refetch: vi.fn() }),
}));
vi.mock('../../services/adminService', () => ({
  adminService: {
    getMembers: (...a: unknown[]) => getMembers(...a),
    getMembersActivity: (...a: unknown[]) => getMembersActivity(...a),
    getAdAccounts: (...a: unknown[]) => getAdAccounts(...a),
    getCachedMembers: () => null,
    getCachedActivities: () => null,
    getCachedAdAccounts: () => null,
    hasInitialCache: () => false,
  },
}));
vi.mock('./sections/UserManagementSection', () => ({
  UserManagementSection: () => <div data-testid="directory" />,
}));
vi.mock('./sections/ComplianceRemindersSection', () => ({
  ComplianceRemindersSection: () => <div />,
}));
vi.mock('./sections/WorkspacesSection', () => ({
  WorkspacesSection: () => <div />,
}));
vi.mock('../views/OwnerView', () => ({ OwnerView: () => <div /> }));
vi.mock('./AddMemberModal', () => ({ AddMemberModal: () => null }));
vi.mock('./EditMemberModal', () => ({ EditMemberModal: () => null }));

import { AdminPanel } from './AdminPanel';

describe('AdminPanel disabled-module fetches', () => {
  beforeEach(() => {
    getMembers.mockClear();
    getMembersActivity.mockClear();
    getAdAccounts.mockClear();
    authState.user = {
      id: 'cm_test_dv_admin',
      role: 'admin',
      company_modules: ['sales', 'active_clients'],
    };
  });

  it('skips activity and ad-account fetches for DataViz', async () => {
    render(<AdminPanel />);
    await waitFor(() => expect(getMembers).toHaveBeenCalled());
    expect(getMembersActivity).not.toHaveBeenCalled();
    expect(getAdAccounts).not.toHaveBeenCalled();
  });

  it('fetches activity and ad accounts when company_modules is null', async () => {
    authState.user = { id: 'cm_test_rm_admin', role: 'admin', company_modules: null };
    render(<AdminPanel />);
    await waitFor(() => expect(getMembers).toHaveBeenCalled());
    await waitFor(() => expect(getMembersActivity).toHaveBeenCalled());
    await waitFor(() => expect(getAdAccounts).toHaveBeenCalled());
  });
});
