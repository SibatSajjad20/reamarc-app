import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import React from 'react';

let taskCountsOk = false;
const authState = vi.hoisted(() => ({
  isLoading: false,
  user: null as any,
  pendingBrand: null as null | { display_name: string },
}));

const useAdAccountsMock = vi.fn((_enabled?: boolean) => ({ accounts: [] }));

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: authState.user,
    logout: vi.fn(),
    setActiveWorkspaceId: vi.fn(),
    isLoading: authState.isLoading,
    pendingBrand: authState.pendingBrand,
    isAuthenticated: true,
  }),
}));

vi.mock('./context/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('./context/BrandingProvider', () => ({
  BrandingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./context/ModuleLoadGate', () => ({
  ModuleLoadGateProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useModuleLoadBlocked: () => false,
}));

vi.mock('./components/layout/BreadcrumbContext', () => ({
  BreadcrumbProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useBreadcrumb: () => ({ trail: [] }),
}));

vi.mock('./hooks/useWorkspaces', () => ({ useWorkspaces: () => ({ workspaces: [], loading: false }) }));
vi.mock('./hooks/useAdAccounts', () => ({
  useAdAccounts: (enabled?: boolean) => useAdAccountsMock(enabled),
}));

vi.mock('./hooks/usePermissions', () => ({
  usePermissions: () => {
    const role = authState.user?.role;
    const isRep = role === 'team_member';
    return {
      can: (mod: string) => {
        if (mod === 'ads') return !isRep;
        return true;
      },
      canAccessAttendance: true,
      canAccessDailyLog: true,
      canSeeWonDealApprovals: role === 'admin' || role === 'operations',
      isViewOnly: false,
    };
  },
}));

vi.mock('./hooks/useTaskCounts', () => ({
  useTaskCounts: () => ({ counts: null, canSeeTasks: taskCountsOk }),
  setTaskCountsEnabled: vi.fn(),
}));

vi.mock('./utils/bootSplash', () => ({ removeBootSplash: vi.fn() }));
vi.mock('./components/task-manager/TaskChatWidget', () => ({
  TaskChatWidget: () => <div data-testid="task-chat-widget" />,
}));
vi.mock('./components/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('./routes/lazyViews', () => ({
  DashboardView: () => <div data-testid="dashboard-view">dashboard</div>,
  AttendanceView: () => <div data-testid="attendance-view">attendance</div>,
  PerformanceMarketing: () => <div data-testid="marketing-view">marketing</div>,
  AdminPanel: () => <div data-testid="admin-view">admin</div>,
  DailyLogView: () => <div data-testid="daily-log-view">daily-log</div>,
  ExceptionInboxView: () => <div data-testid="exceptions-view">exceptions</div>,
  SettingsView: () => <div data-testid="settings-view">settings</div>,
  ActiveClientsView: () => <div data-testid="active-clients-view">active-clients</div>,
  ClientPage: () => <div>client</div>,
  CrmView: () => <div data-testid="crm-view">crm</div>,
  WonDealApprovalsView: () => <div data-testid="won-view">won</div>,
  ContentCalendarView: () => <div data-testid="cc-view">cc</div>,
  WebsitePipelineView: () => <div data-testid="web-view">web</div>,
  TaskManagerView: () => <div data-testid="tasks-view">tasks</div>,
  FinanceContainer: () => <div data-testid="finance-view">finance</div>,
  ClientPortalContainer: () => <div>portal</div>,
  AuthScreen: () => <div data-testid="auth-screen" />,
  PublicSchedulerView: () => <div>sched</div>,
  PublicClientReviewView: () => <div>review</div>,
  PublicInvoiceView: () => <div>invoice</div>,
  prefetchPrimaryViews: vi.fn(),
}));

import App from './App';

describe('App deeplinks & reload resilience (company modules fix round 2)', () => {
  beforeEach(() => {
    taskCountsOk = false;
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  const roles = [
    { role: 'admin', id: 'cm_test_rm_admin' },
    { role: 'hr', id: 'cm_test_rm_hr' },
    { role: 'team_member', id: 'cm_test_rm_rep' },
  ];

  const testPaths = [
    { path: '/tasks', expectedView: 'tasks' },
    { path: '/tasks/all?task=tsk_123', expectedView: 'tasks' },
    { path: '/content-calendar', expectedView: 'content-calendar' },
    { path: '/website-pipeline', expectedView: 'website-pipeline' },
    { path: '/exceptions', expectedView: 'exceptions' },
    { path: '/won-deal-approvals', expectedView: 'won-deal-approvals' },
  ];

  roles.forEach(({ role, id }) => {
    testPaths.forEach(({ path, expectedView }) => {
      it(`Reamarc ${role}: deep link to ${path} stays on path and does not redirect to /dashboard`, async () => {
        authState.user = {
          id,
          role,
          company_modules: null,
          permissions: { modules: {}, levels: {} },
        };
        window.history.pushState({}, '', path);
        const replaceSpy = vi.spyOn(window.history, 'replaceState');

        // Initial render with taskCountsOk = false
        taskCountsOk = false;
        const view = render(<App />);

        // Simulate async task counts finishing
        act(() => {
          taskCountsOk = true;
          window.dispatchEvent(new Event('popstate'));
        });

        // Pathname must equal base
        const cleanPath = path.split('?')[0];
        expect(window.location.pathname).toBe(cleanPath);
        expect(localStorage.getItem('reamarc_active_view')).toBe(expectedView);

        // Verify replaceState was NEVER called with /dashboard
        const dashboardRedirects = replaceSpy.mock.calls.filter(
          (call) => call[2] === '/dashboard' || call[2] === 'dashboard',
        );
        expect(dashboardRedirects).toHaveLength(0);

        view.unmount();
      });

      it(`Reamarc ${role}: reload (F5) with saved active view on ${path} stays on path`, async () => {
        authState.user = {
          id,
          role,
          company_modules: null,
          permissions: { modules: {}, levels: {} },
        };
        localStorage.setItem('reamarc_active_view', expectedView);
        window.history.pushState({}, '', path);
        const replaceSpy = vi.spyOn(window.history, 'replaceState');

        taskCountsOk = false;
        const view = render(<App />);

        act(() => {
          taskCountsOk = true;
          window.dispatchEvent(new Event('popstate'));
        });

        const cleanPath = path.split('?')[0];
        expect(window.location.pathname).toBe(cleanPath);
        expect(localStorage.getItem('reamarc_active_view')).toBe(expectedView);

        const dashboardRedirects = replaceSpy.mock.calls.filter(
          (call) => call[2] === '/dashboard' || call[2] === 'dashboard',
        );
        expect(dashboardRedirects).toHaveLength(0);

        view.unmount();
      });
    });

    it(`Reamarc ${role}: /won-deals matches base behavior on deep link and reload`, async () => {
      authState.user = {
        id,
        role,
        company_modules: null,
        permissions: { modules: {}, levels: {} },
      };
      // In base, when reamarc_active_view is unset, /won-deals falls back to /dashboard
      window.history.pushState({}, '', '/won-deals');
      let view = render(<App />);
      await waitFor(() => {
        expect(window.location.pathname).toBe('/dashboard');
      });
      view.unmount();

      // In base on F5 when saved view is dashboard: URL stays /won-deals
      localStorage.setItem('reamarc_active_view', 'dashboard');
      window.history.pushState({}, '', '/won-deals');
      view = render(<App />);
      expect(window.location.pathname).toBe('/won-deals');
      expect(localStorage.getItem('reamarc_active_view')).toBe('dashboard');
      view.unmount();
    });
  });

  const datavizGatedPaths = [
    '/tasks',
    '/content-calendar',
    '/website-pipeline',
    '/exceptions',
    '/dashboard',
    '/attendance',
    '/daily-log',
  ];

  datavizGatedPaths.forEach((path) => {
    it(`DataViz: deep link to disabled ${path} redirects to /crm`, async () => {
      authState.user = {
        id: 'cm_test_dv_admin',
        role: 'admin',
        company_modules: ['sales', 'active_clients'],
        permissions: { modules: { sales: true, active_clients: true }, levels: {} },
      };
      window.history.pushState({}, '', path);
      const view = render(<App />);
      await waitFor(() => {
        expect(window.location.pathname).toBe('/crm');
      });
      expect(localStorage.getItem('reamarc_active_view')).toBe('crm');
      view.unmount();
    });
  });

  it('DataViz: allowed path /active-clients stays on /active-clients', async () => {
    authState.user = {
      id: 'cm_test_dv_admin',
      role: 'admin',
      company_modules: ['sales', 'active_clients'],
      permissions: { modules: { sales: true, active_clients: true }, levels: {} },
    };
    window.history.pushState({}, '', '/active-clients');
    const view = render(<App />);
    expect(window.location.pathname).toBe('/active-clients');
    expect(localStorage.getItem('reamarc_active_view')).toBe('active-clients');
    view.unmount();
  });

  it('DataViz: allowed path /won-deal-approvals stays for approver', async () => {
    authState.user = {
      id: 'cm_test_dv_admin',
      role: 'admin',
      company_modules: ['sales', 'active_clients'],
      permissions: { modules: { sales: true, active_clients: true }, levels: {} },
    };
    window.history.pushState({}, '', '/won-deal-approvals');
    const view = render(<App />);
    expect(window.location.pathname).toBe('/won-deal-approvals');
    expect(localStorage.getItem('reamarc_active_view')).toBe('won-deal-approvals');
    view.unmount();
  });

  it('Ad-accounts boot gate: useAdAccounts receives false for DataViz admin, true for Reamarc admin, false for Reamarc rep', () => {
    // 1. DataViz admin
    authState.user = {
      id: 'cm_test_dv_admin',
      role: 'admin',
      company_modules: ['sales', 'active_clients'],
      permissions: { modules: { sales: true, active_clients: true }, levels: {} },
    };
    useAdAccountsMock.mockClear();
    let view = render(<App />);
    expect(useAdAccountsMock).toHaveBeenCalledWith(false);
    view.unmount();

    // 2. Reamarc admin
    authState.user = {
      id: 'cm_test_rm_admin',
      role: 'admin',
      company_modules: null,
      permissions: { modules: { sales: true }, levels: {} },
    };
    useAdAccountsMock.mockClear();
    view = render(<App />);
    expect(useAdAccountsMock).toHaveBeenCalledWith(true);
    view.unmount();

    // 3. Reamarc rep (no ads perm)
    authState.user = {
      id: 'cm_test_rm_rep',
      role: 'team_member',
      company_modules: null,
      permissions: { modules: {}, levels: {} },
    };
    useAdAccountsMock.mockClear();
    view = render(<App />);
    expect(useAdAccountsMock).toHaveBeenCalledWith(false);
    view.unmount();
  });
});
