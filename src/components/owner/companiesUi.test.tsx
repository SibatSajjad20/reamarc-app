import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateCompanyDialog } from './CreateCompanyDialog';
import { OwnerCompaniesTab } from './OwnerCompaniesTab';
import { NewMemberDialog } from './NewMemberDialog';
import { Sidebar } from '@/components/Sidebar';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { ownerPathToCompaniesPath, isOwnerLegacyPath } from '@/utils/companiesRoutes';
import { DEFAULT_TIMEZONE, FALLBACK_TIMEZONES, getTimezoneIds } from '@/utils/timezones';
import type { Company } from '@/services/ownerService';
import type { AuthUser } from '@/types/auth';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { TooltipProvider } from '@radix-ui/react-tooltip';

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

let currentUserState: AuthUser = {
  id: 'usr_owner',
  email: 'owner@reamarc.test',
  name: 'Owner',
  role: 'admin',
  company_id: 'comp_home',
  is_super_admin: true,
  company: { id: 'comp_home', name: 'Home Co' },
};

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: currentUserState,
    role: currentUserState.role,
    isAuthenticated: true,
    isLoading: false,
    switchCompany: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAccessAttendance: true,
    canAccessDailyLog: true,
    canAccessCrm: true,
    canAccessContentCalendar: true,
    canAccessWebsitePipeline: true,
    canAccessAds: true,
    canSeeWonDealApprovals: false,
    isAttendanceTracked: true,
    isDailyLogTracked: true,
  }),
}));

vi.mock('@/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [], saveWorkspace: vi.fn(), refetch: vi.fn() }),
}));

vi.mock('@/services/adminService', () => ({
  adminService: {
    getCachedMembers: () => null,
    getCachedActivities: () => null,
    getCachedAdAccounts: () => null,
    hasInitialCache: () => true,
    getMembers: async () => [],
    getMembersActivity: async () => [],
    getAdAccounts: async () => [],
  },
}));

vi.mock('@/services/dailyLogService', () => ({
  dailyLogService: { getUnreadExceptionCount: async () => 0 },
}));

const createCompany = vi.fn();
vi.mock('@/services/ownerService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ownerService')>();
  return {
    ...actual,
    ownerService: {
      ...actual.ownerService,
      createCompany: (...args: unknown[]) => createCompany(...args),
      getCompanies: async () => [],
      getAuditLog: async () => [],
      getMembers: async () => [],
      updateCompany: vi.fn(),
      resetTokenVersion: vi.fn(),
    },
  };
});

const companies: Company[] = [
  {
    id: 'comp_home',
    name: 'Home Co',
    slug: 'home',
    status: 'active',
    timezone: 'Asia/Karachi',
    accent_color: '#6847E0',
    user_count: 4,
    plan: 'pro',
    limits: { max_users: 50 },
  },
  {
    id: 'comp_other',
    name: 'Other Co',
    slug: 'other',
    status: 'active',
    timezone: 'UTC',
    accent_color: '#00AA66',
    user_count: 2,
    plan: 'starter',
    limits: { max_users: 10 },
  },
];

describe('Companies UI', () => {
  beforeEach(() => {
    createCompany.mockReset();
    currentUserState = {
      id: 'usr_owner',
      email: 'owner@reamarc.test',
      name: 'Owner',
      role: 'admin',
      company_id: 'comp_home',
      is_super_admin: true,
      company: { id: 'comp_home', name: 'Home Co' },
    };
  });

  it('redirects legacy /owner paths to /admin/companies', () => {
    expect(isOwnerLegacyPath('owner')).toBe(true);
    expect(isOwnerLegacyPath('owner/members')).toBe(true);
    expect(ownerPathToCompaniesPath('owner')).toBe('/admin/companies');
    expect(ownerPathToCompaniesPath('owner/members')).toBe('/admin/companies/members');
    expect(ownerPathToCompaniesPath('owner/activity')).toBe('/admin/companies/activity');
  });

  it('sidebar has no top-level Owner Console or Companies item', () => {
    render(
      <TooltipProvider>
        <Sidebar
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );
    expect(screen.queryByText('Owner Console')).toBeNull();
    expect(screen.queryByText('Owner console')).toBeNull();
    const nav = document.getElementById('app-sidebar');
    const topLevel = nav?.querySelectorAll('[class*="h-[34px]"]');
    const labels = Array.from(topLevel || []).map((el) => el.textContent || '');
    expect(labels.some((t) => t === 'Companies' || t === 'Owner Console')).toBe(false);
  });

  it('Admin panel shows Companies only for super admin', () => {
    const { unmount } = render(
      <ConfirmProvider>
        <AdminPanel activeSection="companies" />
      </ConfirmProvider>
    );
    expect(screen.getAllByText('Companies').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /New company/i }).length).toBeGreaterThan(0);
    unmount();

    currentUserState = { ...currentUserState, is_super_admin: false, role: 'admin' };
    render(
      <ConfirmProvider>
        <AdminPanel activeSection="companies" />
      </ConfirmProvider>
    );
    expect(screen.queryByRole('button', { name: /New company/i })).toBeNull();
  });

  it('command palette finds Companies via companies and owner keywords', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        currentView="dashboard"
        onSelectView={vi.fn()}
        onSelectAdminSection={vi.fn()}
        themePreference="system"
        onSelectThemePreference={vi.fn()}
        isSidebarCollapsed={false}
        onToggleSidebar={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onSignOut={vi.fn()}
        canSeeActiveClients={false}
        canSeeCrm={false}
        canSeeMarketing={false}
        canSeeContentCalendar={false}
        canSeeWebsitePipeline={false}
        canSeeAttendance={false}
        canSeeDailyLog={false}
        canSeeExceptions={false}
        canSeeAdmin={true}
        adminLabel="Admin panel"
        isManagementRole={true}
        isClient={false}
        isAdmin={true}
      />
    );
    const input = screen.getByPlaceholderText(/Search pages and actions/i);
    fireEvent.change(input, { target: { value: 'owner' } });
    expect(screen.getAllByText('Companies').length).toBeGreaterThan(0);
    fireEvent.change(input, { target: { value: 'companies' } });
    expect(screen.getAllByText('Companies').length).toBeGreaterThan(0);
  });

  it('CreateCompanyDialog has no Plan/People limit, uses CustomSelect, defaults timezone, blocks mismatch', async () => {
    render(
      <CreateCompanyDialog isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    expect(screen.queryByText('Plan')).toBeNull();
    expect(screen.queryByText('People limit')).toBeNull();
    expect(screen.getByLabelText('Time zone')).toBeDefined();
    expect(getTimezoneIds()).toContain('Asia/Karachi');
    expect(FALLBACK_TIMEZONES).toContain('Asia/Karachi');
    expect(DEFAULT_TIMEZONE).toBe('Asia/Karachi');

    const tzTrigger = screen.getByLabelText('Time zone');
    expect(tzTrigger.textContent || '').toContain('Asia/Karachi');

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), {
      target: { value: 'jane@acme.test' },
    });
    const pwds = document.querySelectorAll('input[type="password"]');
    fireEvent.change(pwds[0], { target: { value: 'StartingPwd1!' } });
    fireEvent.change(pwds[1], { target: { value: 'DifferentPwd1!' } });
    expect(screen.getByText("Passwords don't match")).toBeDefined();
    const submit = screen.getByRole('button', { name: /Create company/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it('companies table has no Plan/seat bar, shows Current, no Open, Give access for non-members', () => {
    render(
      <ConfirmProvider>
        <OwnerCompaniesTab
          companies={companies}
          isLoading={false}
          currentUserCompanyId="comp_home"
          memberCompanyIds={new Set(['comp_home'])}
          onSelectCompany={vi.fn()}
          onGiveAccess={vi.fn()}
          onOpenCreateModal={vi.fn()}
          onRefreshData={async () => {}}
        />
      </ConfirmProvider>
    );
    expect(screen.queryByText('Plan')).toBeNull();
    expect(screen.queryByText(/of 50/)).toBeNull();
    expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Open$/i })).toBeNull();
    expect(screen.queryByText('Open as owner (read-only)')).toBeNull();
    expect(screen.getAllByText('4 people').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Give access/i }).length).toBeGreaterThan(0);
  });

  it('NewMemberDialog uses CustomSelect for company and role', async () => {
    render(
      <NewMemberDialog
        companies={companies}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Company').tagName).toBe('BUTTON');
    expect(screen.getByLabelText('Role').tagName).toBe('BUTTON');
    fireEvent.click(screen.getByLabelText('Role'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Admin' })).toBeDefined();
    });
  });
});
