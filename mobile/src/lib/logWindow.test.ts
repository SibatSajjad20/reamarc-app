import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canMutateDailyLogEntry, isLogDateExpired, isOwnDailyLogEntry } from './logWindow.ts';

describe('daily log 48 working-hour window', () => {
  it('is still open the next working morning and closed after two working days', () => {
    const logDate = '2026-11-12';
    const morningAfter = new Date(2026, 10, 13, 9, 0, 0);
    const afterWindow = new Date(2026, 10, 16, 10, 0, 0);
    assert.equal(isLogDateExpired(logDate, new Set(), new Set(), '09:30', morningAfter), false);
    assert.equal(isLogDateExpired(logDate, new Set(), new Set(), '09:30', afterWindow), true);
  });

  it('only the author can edit or delete inside the window', () => {
    const entry = { date: '2026-11-13', user_id: 'u1', resource_name: 'Sibat Sajjad' };
    const now = new Date(2026, 10, 13, 16, 0, 0);
    assert.equal(isOwnDailyLogEntry(entry, { id: 'u1', name: 'Sibat Sajjad' }), true);
    assert.equal(canMutateDailyLogEntry(entry, { id: 'u1' }, new Set(), new Set(), now), true);
    assert.equal(canMutateDailyLogEntry(entry, { id: 'other' }, new Set(), new Set(), now), false);
    const expired = new Date(2026, 10, 18, 10, 0, 0);
    assert.equal(canMutateDailyLogEntry(entry, { id: 'u1' }, new Set(), new Set(), expired), false);
  });
});
