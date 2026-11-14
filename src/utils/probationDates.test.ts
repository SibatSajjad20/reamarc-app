import { describe, expect, it } from 'vitest';
import { defaultProbationEnd } from './probationDates';

describe('defaultProbationEnd', () => {
  it('adds three months to the joining date', () => {
    expect(defaultProbationEnd('2026-11-03')).toBe('2027-02-03');
  });

  it('returns empty for invalid dates', () => {
    expect(defaultProbationEnd('')).toBe('');
    expect(defaultProbationEnd('not-a-date')).toBe('');
  });
});
