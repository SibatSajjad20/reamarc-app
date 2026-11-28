import { describe, expect, it } from 'vitest';
import { findDuplicate, formatHours, parseDurationToHours, remainingLogHours, remainingShiftHours } from './logTimeChecks';

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

describe('remainingLogHours', () => {
  it('subtracts logged hours from time at work (e.g. 4h 20m - 2h = 2h 20m)', () => {
    const remaining = remainingLogHours(4 + 20 / 60, 2);
    expect(formatHours(remaining)).toBe('2h 20m');
  });

  it('equals full at-work time when nothing is logged yet', () => {
    const remaining = remainingLogHours(4 + 19 / 60, 0);
    expect(formatHours(remaining)).toBe('4h 19m');
  });

  it('clamps to zero when logged meets or exceeds at-work time', () => {
    expect(remainingLogHours(4.5, 4.5)).toBe(0);
    expect(remainingLogHours(4.5, 6)).toBe(0);
    expect(remainingLogHours(0, 1)).toBe(0);
  });
});

describe('parseDurationToHours', () => {
  it('parses colon format e.g. 0:30 into 0.5', () => {
    expect(parseDurationToHours('0:30')).toBe(0.5);
    expect(parseDurationToHours('1:15')).toBe(1.25);
    expect(parseDurationToHours('2:45')).toBe(2.75);
  });

  it('parses unit notation e.g. 30m, 1h, 1h 30m', () => {
    expect(parseDurationToHours('30m')).toBe(0.5);
    expect(parseDurationToHours('45 mins')).toBe(0.75);
    expect(parseDurationToHours('1h')).toBe(1.0);
    expect(parseDurationToHours('1h 30m')).toBe(1.5);
    expect(parseDurationToHours('2 hrs')).toBe(2.0);
  });

  it('parses decimals and numeric values', () => {
    expect(parseDurationToHours('1.5')).toBe(1.5);
    expect(parseDurationToHours(2.5)).toBe(2.5);
    expect(parseDurationToHours('0.75')).toBe(0.75);
  });

  it('returns null for invalid inputs or out of range minutes', () => {
    expect(parseDurationToHours('')).toBeNull();
    expect(parseDurationToHours(null)).toBeNull();
    expect(parseDurationToHours(undefined)).toBeNull();
    expect(parseDurationToHours('0:60')).toBeNull();
    expect(parseDurationToHours('invalid')).toBeNull();
    expect(parseDurationToHours(-1)).toBeNull();
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
