import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const authState = vi.hoisted(() => ({
  isLoading: false,
  user: {
    id: 'cm_test_dv_admin',
    role: 'admin',
    company_modules: ['sales', 'active_clients'],
    permissions: { modules: { sales: true }, levels: { sales: 'all', active_clients: 'manage' } },
  } as any,
  pendingBrand: null as null | { display_name: string },
}));

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
vi.mock('./hooks/useAdAccounts', () => ({ useAdAccounts: () => ({ accounts: [] }) }));
vi.mock('./hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: (mod: string) => ['sales', 'active_clients'].includes(mod) || authState.user?.company_modules == null,
    canAccessAttendance: true,
    canAccessDailyLog: true,
    canSeeWonDealApprovals: true,
    isViewOnly: false,
  }),
}));
vi.mock('./hooks/useTaskCounts', () => ({
  useTaskCounts: () => ({ counts: null, canSeeTasks: authState.user?.company_modules == null }),
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
  DashboardView: () => <div>dashboard</div>,
  AttendanceView: () => <div>attendance</div>,
  PerformanceMarketing: () => <div>marketing</div>,
  AdminPanel: () => <div>admin</div>,
  DailyLogView: () => <div>daily-log</div>,
  ExceptionInboxView: () => <div>exceptions</div>,
  SettingsView: () => <div>settings</div>,
  ActiveClientsView: () => <div>active-clients</div>,
  ClientPage: () => <div>client</div>,
  CrmView: () => <div data-testid="crm-view">crm</div>,
  WonDealApprovalsView: () => <div>won</div>,
  ContentCalendarView: () => <div>cc</div>,
  WebsitePipelineView: () => <div>web</div>,
  TaskManagerView: () => <div>tasks</div>,
  FinanceContainer: () => <div>finance</div>,
  ClientPortalContainer: () => <div>portal</div>,
  AuthScreen: () => <div data-testid="auth-screen" />,
  PublicSchedulerView: () => <div>sched</div>,
  PublicClientReviewView: () => <div>review</div>,
  PublicInvoiceView: () => <div>invoice</div>,
  prefetchPrimaryViews: vi.fn(),
}));

import App from './App';

describe('App company modules', () => {
  beforeEach(() => {
    authState.user = {
      id: 'cm_test_dv_admin',
      role: 'admin',
      company_modules: ['sales', 'active_clients'],
      permissions: { modules: { sales: true }, levels: { sales: 'all', active_clients: 'manage' } },
    };
    window.history.pushState({}, '', '/dashboard');
  });

  it('does not mount TaskChatWidget for DataViz and redirects off dashboard', async () => {
    render(<App />);
    expect(screen.queryByTestId('task-chat-widget')).toBeNull();
  });

  it('mounts TaskChatWidget for Reamarc', () => {
    authState.user = {
      id: 'cm_test_rm_admin',
      role: 'admin',
      company_modules: null,
      permissions: { modules: { sales: true, tasks: true }, levels: {} },
    };
    render(<App />);
    expect(screen.getByTestId('task-chat-widget')).toBeTruthy();
  });

  it.each([
    '/settings/attendance-shifts',
    '/settings/holidays',
    '/settings/daily-log-fields',
    '/settings/ad-accounts',
    '/settings/content-calendar-fields',
  ])('DataViz redirects disabled settings %s to /crm', async (path) => {
    window.history.pushState({}, '', path);
    render(<App />);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/crm');
    });
  });

  it('Reamarc role-disallowed settings section stays on /settings/profile', async () => {
    authState.user = {
      id: 'cm_test_rm_rep',
      role: 'team_member',
      company_modules: null,
      permissions: { modules: { sales: true, tasks: true }, levels: {} },
    };
    window.history.pushState({}, '', '/settings/access');
    render(<App />);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings/profile');
    });
  });
});
