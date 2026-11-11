import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ExceptionInboxView, clearExceptionsRangeCache } from '../ExceptionInboxView';
import { logVarianceService } from '../../../services/logVarianceService';
import { logExceptionService } from '../../../services/logExceptionService';
import type { ExceptionsResponse } from '../../../types/logVariance';

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

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    role: mockUser.role,
    isAuthenticated: true,
  }),
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({
    addToast: vi.fn(),
    removeToast: vi.fn(),
  }),
}));

vi.mock('../../../services/logVarianceService', () => ({
  logVarianceService: {
    getExceptions: vi.fn(),
    exportExcel: vi.fn(),
  },
}));

vi.mock('../../../services/logExceptionService', () => ({
  logExceptionService: {
    act: vi.fn(),
    askReason: vi.fn(),
  },
}));

const mockExceptionsData: ExceptionsResponse = {
  groups: [
    {
      key: 'u_1',
      label: 'Alice Cooper',
      count: 1,
      user_id: 'u_1',
      avatar: null,
      department: 'Engineering',
      role: 'team_member',
      flags: ['No log on worked day'],
      items: [
        {
          id: 'exc_1',
          user_id: 'u_1',
          user_name: 'Alice Cooper',
          avatar: null,
          department: 'Engineering',
          role: 'team_member',
          date: '2026-11-02',
          type: 'no_log',
          type_label: 'No log on worked day',
          detail: 'Worked 8h 00m, 0m logged',
          review_state: 'open',
          worked: 480,
          logged: 0,
          variance: 480,
          expected: 480,
          has_checkin: true,
          has_checkout: true,
          is_wfh: false,
          action_status: 'none',
          member_reason: null,
          reopen_note: null,
        },
      ],
    },
  ],
  totals_by_type: {
    all: 1,
    no_log: 1,
    over_logged: 0,
    missing_checkout: 0,
    large_variance: 0,
    logged_on_leave_or_off: 0,
    logged_without_attendance: 0,
    logged_late: 0,
  },
};

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ExceptionInboxView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearExceptionsRangeCache();
    (logVarianceService.getExceptions as any).mockResolvedValue(mockExceptionsData);
  });

  it('renders header, range controls, and grouping dropdown', async () => {
    renderWithProviders(<ExceptionInboxView />);

    expect(screen.getByText('Exceptions')).toBeDefined();
    expect(screen.getByText('Today')).toBeDefined();
    expect(screen.getByText('This week')).toBeDefined();
    expect(screen.getByText('This month')).toBeDefined();
    expect(screen.getByText('Custom')).toBeDefined();
    expect(screen.queryByText(/Admin/)).toBeNull();
    expect(screen.getByLabelText('Group exceptions')).toBeDefined();
    expect(screen.getByLabelText('All departments')).toBeDefined();

    await waitFor(() => {
      expect(logVarianceService.getExceptions).toHaveBeenCalled();
    });
  });

  it('lists every canonical department in the dropdown', async () => {
    renderWithProviders(<ExceptionInboxView />);
    fireEvent.click(screen.getByLabelText('All departments'));
    await waitFor(() => {
      expect(screen.getByText('AI')).toBeDefined();
      expect(screen.getByText('HR')).toBeDefined();
      expect(screen.getByText('Social media')).toBeDefined();
      expect(screen.getByText('Performance marketing')).toBeDefined();
      expect(screen.getByText('Software development')).toBeDefined();
    });
  });

  it('keeps a vertical scrollbar on the exceptions list', async () => {
    renderWithProviders(<ExceptionInboxView />);

    await waitFor(() => {
      expect(screen.getByTestId('exceptions-scroll')).toBeDefined();
    });
    expect(screen.getByTestId('exceptions-scroll').className).toContain('overflow-y-scroll');
  });

  it('renders type filters with a separate count and hides logged late', async () => {
    renderWithProviders(<ExceptionInboxView />);

    await waitFor(() => {
      expect(screen.getByText('All types')).toBeDefined();
      expect(screen.getAllByText('No log on worked day').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Alice Cooper')[0]).toBeDefined();
      expect(screen.getByText('Worked 8h 00m, 0m logged')).toBeDefined();
    });
    expect(screen.queryByText(/Logged late/i)).toBeNull();
    expect(screen.queryByText('Open day')).toBeNull();
    expect(screen.queryByText('Status')).toBeNull();
    expect(screen.queryByText(/today \(live\) is never flagged/i)).toBeNull();
  });

  it('switches grouping from employee to day via the dropdown', async () => {
    renderWithProviders(<ExceptionInboxView />);

    await waitFor(() => {
      expect(logVarianceService.getExceptions).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByLabelText('Group exceptions'));
    fireEvent.click(screen.getByText('By day'));

    await waitFor(() => {
      expect(logVarianceService.getExceptions).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'day',
        })
      );
    });
  });

  it('does not refetch a range that was already loaded', async () => {
    renderWithProviders(<ExceptionInboxView />);

    await waitFor(() => {
      expect(logVarianceService.getExceptions).toHaveBeenCalled();
    });
    const afterMonth = (logVarianceService.getExceptions as any).mock.calls.length;

    fireEvent.click(screen.getByText('Today'));
    await waitFor(() => {
      expect((logVarianceService.getExceptions as any).mock.calls.length).toBeGreaterThan(afterMonth);
    });
    const afterToday = (logVarianceService.getExceptions as any).mock.calls.length;

    fireEvent.click(screen.getByText('This month'));
    await new Promise((r) => setTimeout(r, 50));
    expect((logVarianceService.getExceptions as any).mock.calls.length).toBe(afterToday);
  });

  it('hides previous rows while a new range is loading', async () => {
    let resolveToday: (value: ExceptionsResponse) => void = () => {};
    (logVarianceService.getExceptions as any).mockImplementation((params: { startDate: string; endDate?: string }) => {
      if (params.startDate === params.endDate) {
        return new Promise<ExceptionsResponse>((resolve) => {
          resolveToday = resolve;
        });
      }
      return Promise.resolve(mockExceptionsData);
    });

    renderWithProviders(<ExceptionInboxView />);
    await waitFor(() => {
      expect(screen.getAllByText('Alice Cooper')[0]).toBeDefined();
    });

    fireEvent.click(screen.getByText('Today'));
    await waitFor(() => {
      expect(screen.queryByText('Alice Cooper')).toBeNull();
    });

    resolveToday({
      ...mockExceptionsData,
      groups: [
        {
          ...mockExceptionsData.groups[0],
          label: 'Today Person',
          items: [{ ...mockExceptionsData.groups[0].items[0], user_name: 'Today Person' }],
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('Today Person')).toBeDefined();
    });
  });

  it('handles item action button click', async () => {
    (logExceptionService.act as any).mockResolvedValue({ success: true });
    renderWithProviders(<ExceptionInboxView />);

    await waitFor(() => {
      expect(screen.getAllByText('Resolve')[0]).toBeDefined();
    });

    fireEvent.click(screen.getAllByText('Resolve')[0]);

    await waitFor(() => {
      expect(logExceptionService.act).toHaveBeenCalledWith('exc_1', 'review');
    });
  });
});
