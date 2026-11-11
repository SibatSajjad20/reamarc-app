import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { EmployeeComplianceDrawer } from '../EmployeeComplianceDrawer';
import { logVarianceService } from '../../../../services/logVarianceService';
import type { EmployeeDetailResponse } from '../../../../types/logVariance';

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

vi.mock('../../../../services/logVarianceService', () => ({
  logVarianceService: {
    getEmployeeDetail: vi.fn(),
    exportExcel: vi.fn(),
  },
}));

const mockDetail: EmployeeDetailResponse = {
  user: {
    user_id: 'u_1',
    name: 'Alice Cooper',
    avatar: null,
    department: 'Engineering',
    role: 'team_member',
    email: 'alice@acme.com',
    inactive: false,
    joining_date: '2025-01-01',
  },
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
    worked: 2520,
    logged: 2280,
    expected: 2400,
    variance: 240,
    coverage_pct: 90.5,
    avg_logged_per_day: 456,
    avg_worked_per_day: 504,
    avg_logged_per_scheduled_day: 456,
    submission_pct: 100.0,
    attendance_vs_plan_pct: 105.0,
    logged_outside: 0,
    pending_ot: 60,
  },
  days: [
    {
      date: '2026-11-02',
      status: 'present',
      status_label: 'Present',
      check_in: '09:00',
      check_out: '18:00',
      worked: 540,
      pending_ot: 60,
      expected: 480,
      logged: 480,
      variance: 60,
      coverage_pct: 88.9,
      tone: 'warning',
      flags: ['pending_ot'],
      entries_count: 3,
      compare_ready: true,
      tasks: [
        {
          id: 't_1',
          task_description: 'Backend API redesign',
          client_project: 'Core App',
          task_type: 'feature',
          task_status: 'completed',
          hours_utilized: 4.5,
        },
      ],
    },
    {
      date: '2026-11-03',
      status: 'present',
      status_label: 'Present',
      check_in: '09:00',
      check_out: '17:00',
      worked: 480,
      pending_ot: 0,
      expected: 480,
      logged: 480,
      variance: 0,
      coverage_pct: 100.0,
      tone: 'neutral',
      flags: [],
      entries_count: 2,
      compare_ready: true,
      tasks: [],
    },
  ],
};

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('EmployeeComplianceDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (logVarianceService.getEmployeeDetail as any).mockResolvedValue(mockDetail);
  });

  it('renders employee info and 8 KPI cards', async () => {
    renderWithProviders(
      <EmployeeComplianceDrawer
        isOpen={true}
        onClose={vi.fn()}
        member={{ user_id: 'u_1', name: 'Alice Cooper', role: 'team_member' }}
        startDate="2026-11-02"
        endDate="2026-11-06"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Cooper')).toBeDefined();
      expect(screen.getByText('Team member')).toBeDefined();
    });

    // 8 KPI cards
    expect(screen.getAllByText('Worked')[0]).toBeDefined();
    expect(screen.getAllByText('Logged')[0]).toBeDefined();
    expect(screen.getAllByText('Variance')[0]).toBeDefined();
    expect(screen.getAllByText('Coverage')[0]).toBeDefined();
    expect(screen.getAllByText('Avg logged / day')[0]).toBeDefined();
    expect(screen.getAllByText('Avg worked / day')[0]).toBeDefined();
    expect(screen.getAllByText('Submission')[0]).toBeDefined();
    expect(screen.getAllByText('Excluded logs')[0]).toBeDefined();
  });

  it('renders pending OT callout when pending OT > 0', async () => {
    renderWithProviders(
      <EmployeeComplianceDrawer
        isOpen={true}
        onClose={vi.fn()}
        member={{ user_id: 'u_1', name: 'Alice Cooper' }}
        startDate="2026-11-02"
        endDate="2026-11-06"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/1h pending overtime/i)).toBeDefined();
    });
  });

  it('renders day-by-day table with tasks expandable', async () => {
    renderWithProviders(
      <EmployeeComplianceDrawer
        isOpen={true}
        onClose={vi.fn()}
        member={{ user_id: 'u_1', name: 'Alice Cooper' }}
        startDate="2026-11-02"
        endDate="2026-11-06"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Day by day')).toBeDefined();
      expect(screen.getAllByText(/2 Nov/)[0]).toBeDefined();
      expect(screen.getAllByText(/3 Nov/)[0]).toBeDefined();
    });

    // Expand the day with tasks (clicking the logged hours button)
    const expandBtn = screen.getAllByText('8h')[0];
    fireEvent.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText('Backend API redesign')).toBeDefined();
      expect(screen.getByText('Core App')).toBeDefined();
    });
  });

  it('triggers export call on export click', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    if (typeof window !== 'undefined' && !window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => 'blob:mock');
      window.URL.revokeObjectURL = vi.fn();
    } else if (typeof window !== 'undefined') {
      vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    }

    (logVarianceService.exportExcel as any).mockResolvedValue(new Blob());

    renderWithProviders(
      <EmployeeComplianceDrawer
        isOpen={true}
        onClose={vi.fn()}
        member={{ user_id: 'u_1', name: 'Alice Cooper' }}
        startDate="2026-11-02"
        endDate="2026-11-06"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Export'));

    await waitFor(() => {
      expect(logVarianceService.exportExcel).toHaveBeenCalledWith('2026-11-02', '2026-11-06', 'Engineering');
    });

    clickSpy.mockRestore();
  });
});
