import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '@/components/Sidebar';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import type { AuthUser } from '@/types/auth';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = MockResizeObserver;
}

let currentUserState: AuthUser = {
  id: 'cm_test_dv_admin',
  email: 'a@x',
  name: 'Admin',
  role: 'admin',
  company_id: 'cm_test_dataviz',
  company_modules: ['sales', 'active_clients'],
  company: { id: 'cm_test_dataviz', name: 'DataViz Test' },
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
    can: (mod: string) => ['sales', 'active_clients'].includes(mod) || currentUserState.company_modules == null,
    canAccessAttendance: true,
    canAccessDailyLog: true,
    canAccessCrm: true,
    canAccessContentCalendar: true,
    canAccessWebsitePipeline: true,
    canAccessAds: true,
    canSeeWonDealApprovals: true,
    isAttendanceTracked: true,
    isDailyLogTracked: true,
  }),
}));

vi.mock('@/hooks/useTaskCounts', () => ({
  useTaskCounts: () => ({ counts: { open: 2 }, canSeeTasks: true }),
  setTaskCountsEnabled: vi.fn(),
}));

vi.mock('@/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [], saveWorkspace: vi.fn(), refetch: vi.fn() }),
}));

vi.mock('@/services/dailyLogService', () => ({
  dailyLogService: { getUnreadExceptionCount: async () => 0, getDayTarget: async () => ({ follow_ups: [] }) },
}));

vi.mock('@/utils/cacheBus', () => ({
  useCacheInvalidation: () => {},
}));

describe('Sidebar company modules', () => {
  beforeEach(() => {
    currentUserState = {
      id: 'cm_test_dv_admin',
      email: 'a@x',
      name: 'Admin',
      role: 'admin',
      company_id: 'cm_test_dataviz',
      company_modules: ['sales', 'active_clients'],
      company: { id: 'cm_test_dataviz', name: 'DataViz Test' },
    };
  });

  it('DataViz admin sees Sales, Won-deal, Active clients, Admin', () => {
    render(
      <TooltipProvider>
        <Sidebar currentView="crm" onSelectView={vi.fn()} onSignOut={vi.fn()} theme="light" onToggleTheme={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getAllByText('Sales pipeline').length).toBeGreaterThan(0);
    expect(screen.getByText('Won-deal approvals')).toBeTruthy();
    expect(screen.getByText('Active clients')).toBeTruthy();
    expect(screen.getByText('Admin panel')).toBeTruthy();
    expect(screen.queryByText('Dashboard')).toBeNull();
    expect(screen.queryByText('Tasks')).toBeNull();
    expect(screen.queryByText('Log variance')).toBeNull();
  });

  it('Reamarc admin still sees Dashboard and Tasks', () => {
    currentUserState = {
      ...currentUserState,
      id: 'cm_test_rm_admin',
      company_id: 'cm_test_reamarc',
      company_modules: null,
      company: { id: 'cm_test_reamarc', name: 'Reamarc Test' },
    };
    render(
      <TooltipProvider>
        <Sidebar currentView="dashboard" onSelectView={vi.fn()} onSignOut={vi.fn()} theme="light" onToggleTheme={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Tasks')).toBeTruthy();
  });
});
