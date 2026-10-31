import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../services/apiClient';
import { attendanceService } from '../../../services/attendanceService';
import { dashboardService } from '../../../services/dashboardService';

const user = {
  id: 'user-a',
  company_id: 'company-a',
  role: 'team_member',
  full_name: 'Test User',
  effective_access: { attendance: true, daily_log: true },
};

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user }),
}));
vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => false,
    canAccessAttendance: true,
    canAccessDailyLog: true,
    isAttendanceTracked: true,
    isDailyLogTracked: true,
    canApproveWonDeal: false,
    canSeeWonDealApprovals: false,
  }),
}));
vi.mock('../../../hooks/useOffDays', () => ({
  useOffDays: () => ({ isOffDay: () => false }),
}));
vi.mock('../../../context/ModuleLoadGate', () => ({
  useModuleLoadGate: () => undefined,
}));
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));
vi.mock('../../attendance/EmployeePunchCard', () => ({
  EmployeePunchCard: () => <div>punch-card</div>,
}));
vi.mock('../../dashboard/MyHoursChart', () => ({
  MyHoursChart: () => <div>my-hours</div>,
}));
vi.mock('../../attendance/PersonalTimesheetTable', () => ({
  PersonalTimesheetTable: ({ isLoading }: { isLoading: boolean }) => (
    <div>{isLoading ? 'attendance-loading' : 'attendance-ready'}</div>
  ),
}));

const summary = {
  meta: { generatedAt: new Date().toISOString(), role: 'team_member' },
};
const dashboardPayload = {
  summary,
  todayAttendance: null,
  timesheet: {
    user_id: 'user-a',
    employee_name: 'Test User',
    year: 2026,
    month: 10,
    records: [],
    summary: { days_present: 4, late_count: 0 },
  },
  matrix: null,
  dayTarget: null,
  weeklyLogs: [{ date: '2026-10-27', hours: 8 }],
  meta: {
    generatedAt: new Date().toISOString(),
    companyId: 'company-a',
    weekStart: '2026-10-26',
    today: '2026-10-31',
  },
};
const attendancePayload = {
  kind: 'employee' as const,
  matrix: null,
  timesheet: {
    user_id: 'user-a',
    employee_name: 'Test User',
    year: 2026,
    month: 10,
    records: [],
    summary: null,
  },
  config: {
    go_live_date: '2026-08-19',
    test_start_date: '2026-08-01',
    effective_start_date: '2026-08-19',
    timezone: 'Asia/Karachi',
    go_live_reached: true,
  },
  meta: { company_id: 'company-a', date: '2026-10-31' },
};

describe('first-paint request budgets and warm-cache revisits', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    dashboardService.clearCache();
    attendanceService.clearAllCaches();
    attendanceService.setCompanyScope('company-a');
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path === '/dashboard/bootstrap') return dashboardPayload as never;
      if (path === '/attendance/bootstrap') return attendancePayload as never;
      throw new Error(`Unexpected blocking request: ${path}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DashboardView uses at most three cold requests and a warm revisit is non-blocking', async () => {
    const { DashboardView } = await import('../DashboardView');
    const first = render(<DashboardView onNavigateView={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('logged-this-week')).toBeTruthy());
    expect(vi.mocked(apiClient.get).mock.calls.length).toBeLessThanOrEqual(3);
    expect(screen.getByTestId('logged-this-week').getAttribute('aria-busy')).not.toBe('true');
    expect(screen.getByTestId('present-this-month').getAttribute('aria-busy')).not.toBe('true');
    first.unmount();

    vi.mocked(apiClient.get).mockClear();
    render(<DashboardView onNavigateView={vi.fn()} />);
    await act(async () => {});
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(screen.getByTestId('logged-this-week').getAttribute('aria-busy')).not.toBe('true');
    expect(screen.getByTestId('present-this-month').getAttribute('aria-busy')).not.toBe('true');
  });

  it('AttendanceView uses one cold request and zero blocking requests on a warm revisit', async () => {
    const { AttendanceView } = await import('../AttendanceView');
    const first = render(<AttendanceView />);
    await waitFor(() => expect(screen.getByText('attendance-ready')).toBeTruthy());
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    first.unmount();

    vi.mocked(apiClient.get).mockClear();
    render(<AttendanceView />);
    await waitFor(() => expect(screen.getByText('attendance-ready')).toBeTruthy());
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(screen.queryByText('attendance-loading')).toBeNull();
  });
});
