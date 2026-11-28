import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShiftTasksTracker } from '../ShiftTasksTracker';
import type { DayTarget } from '../../../types/dailyLog';

const baseTarget: DayTarget = {
  date: '2026-11-06',
  expected_hours: 8,
  worked_hours: 8,
  logged_hours: 8,
  remaining_hours: 0,
  has_checkin: true,
  has_checkout: true,
  compare_ready: true,
  check_in: '09:30',
  check_out: '19:30',
  time_at_work_hours: 9,
  is_full_leave: false,
  is_wfh: false,
  status: 'green',
  shift_name: 'Standard Shift',
  shift_start: '09:30',
  shift_end: '18:30',
};

describe('ShiftTasksTracker pending OT hint', () => {
  it('renders a pending OT hint when pending_overtime_minutes > 0', () => {
    render(
      <ShiftTasksTracker
        dayTarget={{
          ...baseTarget,
          pending_overtime_minutes: 60,
          overtime_status: 'pending',
        }}
      />
    );
    expect(screen.getByText(/includes 1h OT pending/i)).toBeTruthy();
  });

  it('does not render a pending OT hint when pending_overtime_minutes is 0', () => {
    render(
      <ShiftTasksTracker
        dayTarget={{
          ...baseTarget,
          pending_overtime_minutes: 0,
          overtime_status: 'rejected',
        }}
      />
    );
    expect(screen.queryByText(/OT pending/i)).toBeNull();
  });

  it('calculates Remaining as At work minus Logged (e.g. 4h 20m - 2h = 2h 20m)', () => {
    render(
      <ShiftTasksTracker
        dayTarget={{
          ...baseTarget,
          expected_hours: 6,
          time_at_work_hours: 4 + 20 / 60,
          logged_hours: 2,
          has_checkout: true,
        }}
      />
    );
    const remainingValue = screen.getByText('Remaining').nextElementSibling;
    expect(remainingValue?.textContent).toBe('2h 20m');
  });

  it('clamps Remaining to 0m when Logged exceeds At work and falls back to expected for WFH without check-in', () => {
    const { rerender } = render(
      <ShiftTasksTracker
        dayTarget={{
          ...baseTarget,
          expected_hours: 6,
          time_at_work_hours: 4,
          logged_hours: 5,
          has_checkout: true,
        }}
      />
    );
    expect(screen.getByText('Remaining').nextElementSibling?.textContent).toBe('0m');

    rerender(
      <ShiftTasksTracker
        dayTarget={{
          ...baseTarget,
          expected_hours: 6,
          time_at_work_hours: 0,
          worked_hours: 0,
          logged_hours: 2.5,
          has_checkin: false,
          has_checkout: false,
          is_wfh: true,
        }}
      />
    );
    expect(screen.getByText('Remaining').nextElementSibling?.textContent).toBe('3h 30m');
  });
});
