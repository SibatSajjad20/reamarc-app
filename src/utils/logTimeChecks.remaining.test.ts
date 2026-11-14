import { describe, expect, it } from 'vitest';
import { findDuplicate, formatHours, remainingShiftHours } from './logTimeChecks';

describe('remainingShiftHours', () => {
  it('drops remaining as time at work increases, even with 0 logged', () => {
    const remaining = remainingShiftHours(6, 19 / 60);
    expect(formatHours(remaining)).toBe('5h 41m');
  });

  it('does not use logged hours (the old remaining formula)', () => {
    expect(remainingShiftHours(6, 19 / 60)).not.toBe(6);
    expect(remainingShiftHours(6, 0)).toBe(6);
  });

  it('is zero when at-work meets or exceeds expected', () => {
    expect(remainingShiftHours(6, 6)).toBe(0);
    expect(remainingShiftHours(6, 7.5)).toBe(0);
  });
});

describe('findDuplicate task text', () => {
  it('treats bold HTML as the same task as plain text', () => {
    const dup = findDuplicate(
      { date: '2026-11-14', task_description: '<b>Design banner</b>', hours_utilized: 1 },
      [{ date: '2026-11-14', task_description: 'Design banner', hours_utilized: 1 }],
    );
    expect(dup).not.toBeNull();
  });

  it('does not match a different description', () => {
    const dup = findDuplicate(
      { date: '2026-11-14', task_description: '<b>Design banner</b>', hours_utilized: 1 },
      [{ date: '2026-11-14', task_description: 'Write copy', hours_utilized: 1 }],
    );
    expect(dup).toBeNull();
  });
});
