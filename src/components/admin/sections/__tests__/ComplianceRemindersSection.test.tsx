import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ComplianceRemindersSection, clearLogVarianceRangeCache } from '../ComplianceRemindersSection';
import { logVarianceService } from '../../../../services/logVarianceService';
import type { LogVarianceResponse } from '../../../../types/logVariance';

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
}

const mockUser = {
  id: 'admin_1',
  email: 'admin@acme.com',
  name: 'Admin User',
  role: 'admin',
};

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    role: mockUser.role,
    isAuthenticated: true,
  }),
}));

vi.mock('../../../../context/ToastContext', () => ({
  useToast: () => ({
    addToast: vi.fn(),
    removeToast: vi.fn(),
  }),
}));

vi.mock('../../../../services/logVarianceService', () => ({
  logVarianceService: {
    getOverview: vi.fn(),
    exportExcel: vi.fn(),
  },
}));

const mockData: LogVarianceResponse = {
  range: {
    start: '2026-11-02',
    end: '2026-11-06',
    today_included: false,
  },
  generated_at: '2026-11-10T12:00:00Z',
  summary: {
    days_scheduled: 5,
    days_present: 5,
    days_logged: 5,
    days_missing: 0,
    days_under_target: 1,
    days_absent: 0,
    days_leave: 0,
    days_off: 0,
    days_missing_checkout: 0,
    worked: 2400,
    logged: 2280,
    expected: 2400,
    variance: 120,
    coverage_pct: 95.0,
    avg_logged_per_day: 456,
    avg_worked_per_day: 480,
    avg_logged_per_scheduled_day: 456,
    submission_pct: 100.0,
    logged_outside: 0,
    people: 1,
    open_exceptions: 1,
    today_live: { worked: 0, logged: 0 },
  },
  departments: [
    {
      department: 'Engineering',
      people: 1,
      days_present: 5,
      worked: 2400,
      logged: 2280,
      coverage_pct: 95.0,
      avg_logged_per_day: 456,
      days_missing: 0,
    },
  ],
  rows: [
    {
      user_id: 'u_1',
      name: 'Alice Cooper',
      avatar: null,
      department: 'Engineering',
      role: 'team_member',
      inactive: false,
      days_scheduled: 5,
      days_present: 5,
      days_logged: 5,
      days_missing: 0,
      days_under_target: 1,
      days_absent: 0,
      days_leave: 0,
      days_off: 0,
      days_missing_checkout: 0,
      worked: 2400,
      logged: 2280,
      expected: 2400,
      variance: 120,
      coverage_pct: 95.0,
      avg_logged_per_day: 456,
      avg_worked_per_day: 480,
      avg_logged_per_scheduled_day: 456,
      submission_pct: 100.0,
      logged_outside: 0,
      flags: [],
      open_exceptions: 1,
    },
    {
      user_id: 'u_pm',
      name: 'Salman Tahir',
      avatar: null,
      department: 'Performance marketing, Social media',
      role: 'team_member',
      inactive: false,
      days_scheduled: 5,
      days_present: 5,
      days_logged: 4,
      days_missing: 1,
      days_under_target: 1,
      days_absent: 0,
      days_leave: 0,
      days_off: 0,
      days_missing_checkout: 0,
      worked: 2400,
      logged: 1800,
      expected: 2400,
      variance: 600,
      coverage_pct: 75.0,
      avg_logged_per_day: 360,
      avg_worked_per_day: 480,
      avg_logged_per_scheduled_day: 360,
      submission_pct: 80.0,
      logged_outside: 0,
      flags: ['no_log', 'large_variance'],
      open_exceptions: 2,
    },
    {
      user_id: 'u_2',
      name: 'Bob Inactive',
      avatar: null,
      department: 'Design',
      role: 'team_member',
      inactive: true,
      days_scheduled: 0,
      days_present: 0,
      days_logged: 0,
      days_missing: 0,
      days_under_target: 0,
      days_absent: 0,
      days_leave: 0,
      days_off: 0,
      days_missing_checkout: 0,
      worked: 0,
      logged: 0,
      expected: 0,
      variance: 0,
      coverage_pct: null,
      avg_logged_per_day: null,
      avg_worked_per_day: null,
      avg_logged_per_scheduled_day: null,
      submission_pct: 0,
      logged_outside: 0,
      flags: [],
      open_exceptions: 0,
    },
  ],
  thresholds: {
    under_target_min: 30,
    large_variance_min: 60,
    over_logged_min: 30,
    late_hours: 48,
    coverage_target_pct: 95,
  },
};

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ComplianceRemindersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogVarianceRangeCache();
    (logVarianceService.getOverview as any).mockResolvedValue(mockData);
  });

  it('renders page header and range controls', async () => {
    renderWithProviders(<ComplianceRemindersSection />);

    expect(screen.getByText('Log variance')).toBeDefined();
    expect(screen.getByText('Today')).toBeDefined();
    expect(screen.getByText('This week')).toBeDefined();
    expect(screen.getByText('This month')).toBeDefined();
    expect(screen.getByText('Custom')).toBeDefined();

    await waitFor(() => {
      expect(logVarianceService.getOverview).toHaveBeenCalled();
    });
  });

  it('renders KPI cards from API summary', async () => {
    renderWithProviders(<ComplianceRemindersSection />);

    await waitFor(() => {
      expect(screen.getAllByText('Worked')[0]).toBeDefined();
      expect(screen.getAllByText('Logged')[0]).toBeDefined();
      expect(screen.getAllByText('Coverage')[0]).toBeDefined();
      expect(screen.getAllByText('Avg logged / day')[0]).toBeDefined();
      expect(screen.getAllByText('Submission')[0]).toBeDefined();
    });
  });

  it('keeps a vertical scrollbar and shows one row per employee', async () => {
    renderWithProviders(<ComplianceRemindersSection />);

    await waitFor(() => {
      expect(screen.getByText('People')).toBeDefined();
      expect(screen.getByText('Alice Cooper')).toBeDefined();
    });
    const scroller = screen.getByTestId('log-variance-scroll');
    expect(scroller.className).toContain('overflow-y-scroll');
  });

  it('renders department strip and employee row with team totals footer', async () => {
    renderWithProviders(<ComplianceRemindersSection />);

    await waitFor(() => {
      expect(screen.getByText('Alice Cooper')).toBeDefined();
      expect(screen.getByText(/Team total/)).toBeDefined();
      expect(screen.getAllByText('Engineering')[0]).toBeDefined();
    });
    expect(screen.queryByText(/Today so far/)).toBeNull();
    expect(screen.queryByText('Actions')).toBeNull();
    expect(screen.queryByText('Remind')).toBeNull();
    expect(screen.queryByText(/Averages use finished present days only/)).toBeNull();
    expect(screen.queryByText(/within ±30m\/day/)).toBeNull();
  });

  it('splits combined departments into separate cards', async () => {
    renderWithProviders(<ComplianceRemindersSection />);

    await waitFor(() => {
      expect(screen.getByText('Salman Tahir')).toBeDefined();
    });
    expect(screen.getByText('Performance marketing')).toBeDefined();
    expect(screen.getByText('Social media')).toBeDefined();
    expect(screen.queryByText('Performance marketing, Social media')).toBeNull();
  });

  it('filters rows by quick filter chip', async () => {
    renderWithProviders(<ComplianceRemindersSection />);

    await waitFor(() => {
      expect(screen.getByText('Alice Cooper')).toBeDefined();
    });

    // Alice has days_under_target = 1, so clicking 'Under target' still shows her
    const underTargetBtn = screen.getByRole('button', { name: /Under target/i });
    fireEvent.click(underTargetBtn);
    await waitFor(() => {
      expect(screen.getByText('Alice Cooper')).toBeDefined();
    });

    // Alice is not inactive, so clicking 'Inactive' filters her out
    const inactiveBtn = screen.getByRole('button', { name: /Inactive/i });
    fireEvent.click(inactiveBtn);
    await waitFor(() => {
      expect(screen.queryByText('Alice Cooper')).toBeNull();
    });
  });

  it('triggers export button call', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    if (typeof window !== 'undefined' && !window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => 'blob:mock');
      window.URL.revokeObjectURL = vi.fn();
    } else if (typeof window !== 'undefined') {
      vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    }

    (logVarianceService.exportExcel as any).mockResolvedValue(new Blob());
    renderWithProviders(<ComplianceRemindersSection />);

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeDefined();
    });

    const exportBtn = screen.getByText('Export');
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(logVarianceService.exportExcel).toHaveBeenCalled();
    });

    clickSpy.mockRestore();
  });
});
