import { describe, expect, it } from 'vitest';
import type { Task } from '@/types/task';
import { nextOccurrence, projectedRecurrenceDates, seriesOccupiedDates } from './taskRecurrence';

const monthly: Task = {
  id: 'tsk1',
  serial: 'T-0001',
  title: 'Monthly content',
  status: 'todo',
  priority: 'medium',
  due_date: '2026-11-17',
  recurrence: { freq: 'monthly', interval: 1, until: '2027-12-31' },
};

describe('taskRecurrence', () => {
  it('steps monthly to the same day next month and stops after until', () => {
    expect(nextOccurrence('2026-11-17', monthly.recurrence)).toBe('2026-12-17');
    expect(nextOccurrence('2026-12-17', monthly.recurrence)).toBe('2027-01-17');
    expect(nextOccurrence('2027-12-17', monthly.recurrence)).toBe(null);
  });

  it('projects Dec 2026 and Jan 2027 for a Nov 17 monthly series', () => {
    const dec = projectedRecurrenceDates(monthly, '2026-12-01', '2026-12-31', seriesOccupiedDates([monthly], monthly.id));
    expect(dec).toEqual(['2026-12-17']);
    const jan = projectedRecurrenceDates(monthly, '2027-01-01', '2027-01-31', seriesOccupiedDates([monthly], monthly.id));
    expect(jan).toEqual(['2027-01-17']);
  });

  it('does not project a date that already has a spawned instance', () => {
    const instance: Task = {
      ...monthly,
      id: 'tsk2',
      serial: 'T-0002',
      recurrence: null,
      recurrence_source_id: 'tsk1',
      due_date: '2026-12-17',
    };
    const occupied = seriesOccupiedDates([monthly, instance], monthly.id);
    expect(projectedRecurrenceDates(monthly, '2026-12-01', '2026-12-31', occupied)).toEqual([]);
  });

  it('does not project daily dates after until, and does not treat monthly as daily', () => {
    const daily: Task = {
      ...monthly,
      recurrence: { freq: 'daily', interval: 1, until: '2026-11-20' },
    };
    const days = projectedRecurrenceDates(daily, '2026-11-17', '2026-11-30', seriesOccupiedDates([daily], daily.id));
    expect(days).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);
    const monthlyDays = projectedRecurrenceDates(monthly, '2026-11-18', '2026-11-30', seriesOccupiedDates([monthly], monthly.id));
    expect(monthlyDays).toEqual([]);
  });
});
