import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomDatePicker } from '../CustomDatePicker';

vi.mock('../../hooks/useOffDays', () => ({
  useOffDays: () => ({
    getOffDay: (iso: string) => {
      // Mark 2026-11-15 as Sunday off day
      if (iso === '2026-11-15') return { isOff: true, label: 'Sunday' };
      return { isOff: false, label: '' };
    },
    isOffDay: (iso: string) => iso === '2026-11-15',
  }),
}));

describe('CustomDatePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trigger button with formatted date', () => {
    const onChange = vi.fn();
    render(<CustomDatePicker value="2026-11-17" onChange={onChange} />);

    expect(screen.getByText(/Nov 17, 2026/)).toBeTruthy();
  });

  it('disables dates before minDate, after maxDate, and matching isDateDisabled', () => {
    const onChange = vi.fn();
    render(
      <CustomDatePicker
        value="2026-11-17"
        onChange={onChange}
        minDate="2026-11-14"
        maxDate="2026-11-17"
        isDateDisabled={(iso) => iso === '2026-11-16'}
      />
    );

    // Open popover
    const trigger = screen.getByRole('button', { name: /Nov 17, 2026/i });
    fireEvent.click(trigger);

    // Day 10 (before minDate 2026-11-14) should be disabled
    const day10 = screen.getByRole('button', { name: '10' });
    expect(day10).toHaveProperty('disabled', true);
    fireEvent.click(day10);
    expect(onChange).not.toHaveBeenCalled();

    // Day 16 (matching isDateDisabled) should be disabled
    const day16 = screen.getByRole('button', { name: '16' });
    expect(day16).toHaveProperty('disabled', true);
    fireEvent.click(day16);
    expect(onChange).not.toHaveBeenCalled();

    // Day 19 (after maxDate 2026-11-17) should be disabled
    const day19 = screen.getByRole('button', { name: '19' });
    expect(day19).toHaveProperty('disabled', true);
    fireEvent.click(day19);
    expect(onChange).not.toHaveBeenCalled();

    // Day 14 (within range and not isDateDisabled) should be enabled
    const day14 = screen.getByRole('button', { name: '14' });
    expect(day14).toHaveProperty('disabled', false);
    fireEvent.click(day14);
    expect(onChange).toHaveBeenCalledWith('2026-11-14');
  });

  it('disables off days when offDayMode is disable', () => {
    const onChange = vi.fn();
    render(
      <CustomDatePicker
        value="2026-11-17"
        onChange={onChange}
        offDayMode="disable"
      />
    );

    const trigger = screen.getByRole('button', { name: /Nov 17, 2026/i });
    fireEvent.click(trigger);

    // Day 15 is mocked as Sunday off
    const day15 = screen.getByRole('button', { name: '15' });
    expect(day15).toHaveProperty('disabled', true);
    fireEvent.click(day15);
    expect(onChange).not.toHaveBeenCalled();
  });
});
