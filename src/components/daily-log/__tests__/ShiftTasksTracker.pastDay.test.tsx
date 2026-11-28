import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ShiftTasksTracker } from '../ShiftTasksTracker';
import type { DayTarget } from '../../../types/dailyLog';

const afternoonTarget: DayTarget = {
  date: '2026-11-27',
  expected_hours: 6,
  worked_hours: 0,
  logged_hours: 0,
  remaining_hours: 0,
  has_checkin: true,
  has_checkout: false,
  compare_ready: false,
  check_in: '14:00',
  check_out: null,
  time_at_work_hours: 0,
  is_full_leave: false,
  is_wfh: false,
  is_night_shift: false,
  status: 'amber',
  shift_name: 'Afternoon Shift',
  shift_start: '14:00',
  shift_end: '20:00',
  break_duration_minutes: 0,
};

function getMetricValue(label: string): string | null | undefined {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe('ShiftTasksTracker live clock vs past-day guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caps a past day without checkout at shift_end, shows No checkout, and does not tick', () => {
    vi.setSystemTime(new Date('2026-11-28T15:20:00'));

    render(<ShiftTasksTracker dayTarget={afternoonTarget} />);

    expect(getMetricValue('At work')).toBe('6h');
    expect(getMetricValue('Remaining')).toBe('6h');
    expect(screen.getByText(/no checkout/i)).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });

    expect(getMetricValue('At work')).toBe('6h');
    expect(getMetricValue('Remaining')).toBe('6h');
  });

  it('uses backend time_at_work_hours when > 0 on a past day without checkout', () => {
    vi.setSystemTime(new Date('2026-11-28T15:20:00'));

    render(
      <ShiftTasksTracker
        dayTarget={{
          ...afternoonTarget,
          time_at_work_hours: 5,
          logged_hours: 2,
        }}
      />
    );

    expect(getMetricValue('At work')).toBe('5h');
    expect(getMetricValue('Remaining')).toBe('3h');
    expect(screen.getByText(/no checkout/i)).toBeTruthy();
  });

  it('uses live clock and ticks for today when checked in without checkout', () => {
    vi.setSystemTime(new Date('2026-11-28T15:20:00'));

    render(
      <ShiftTasksTracker
        dayTarget={{
          ...afternoonTarget,
          date: '2026-11-28',
        }}
      />
    );

    expect(getMetricValue('At work')).toBe('1h 20m');
    expect(getMetricValue('Remaining')).toBe('1h 20m');
    expect(screen.queryByText(/no checkout/i)).toBeNull();
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    expect(getMetricValue('At work')).toBe('1h 25m');
    expect(getMetricValue('Remaining')).toBe('1h 25m');
  });

  it('keeps an active night shift started yesterday live at 02:00 today', () => {
    vi.setSystemTime(new Date('2026-11-28T02:00:00'));

    render(
      <ShiftTasksTracker
        dayTarget={{
          ...afternoonTarget,
          date: '2026-11-27',
          expected_hours: 8,
          shift_name: 'Night Shift',
          shift_start: '22:00',
          shift_end: '06:00',
          check_in: '22:00',
          is_night_shift: true,
          break_duration_minutes: 0,
        }}
      />
    );

    expect(getMetricValue('At work')).toBe('4h');
    expect(screen.queryByText(/no checkout/i)).toBeNull();
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });

    expect(getMetricValue('At work')).toBe('4h 15m');
  });

  it('treats yesterday night shift as past once the next afternoon arrives', () => {
    vi.setSystemTime(new Date('2026-11-28T15:20:00'));

    render(
      <ShiftTasksTracker
        dayTarget={{
          ...afternoonTarget,
          date: '2026-11-27',
          expected_hours: 8,
          shift_name: 'Night Shift',
          shift_start: '22:00',
          shift_end: '06:00',
          check_in: '22:00',
          is_night_shift: true,
          break_duration_minutes: 0,
        }}
      />
    );

    expect(getMetricValue('At work')).toBe('8h');
    expect(screen.getByText(/no checkout/i)).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves a past day with checkout unchanged', () => {
    vi.setSystemTime(new Date('2026-11-28T15:20:00'));

    render(
      <ShiftTasksTracker
        dayTarget={{
          ...afternoonTarget,
          has_checkout: true,
          check_out: '19:30',
          time_at_work_hours: 5.5,
          worked_hours: 5.5,
          logged_hours: 3,
        }}
      />
    );

    expect(getMetricValue('At work')).toBe('5h 30m');
    expect(getMetricValue('Remaining')).toBe('2h 30m');
    expect(screen.queryByText(/no checkout/i)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
