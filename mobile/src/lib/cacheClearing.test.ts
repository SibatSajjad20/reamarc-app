import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  setCachedMatrix,
  getCachedMatrix,
  setCachedPunchToday,
  getCachedPunchToday,
  clearAttendanceCaches,
} from './attendanceCache.ts';
import {
  setCachedWorked,
  getCachedWorked,
  setCachedEmployees,
  getCachedEmployees,
  clearDailyLogCaches,
} from './dailyLogCache.ts';
import {
  setCachedPipeline,
  getCachedPipeline,
  clearCrmCaches,
} from './crmCache.ts';

describe('mobile multi-company cache clearing policy', () => {
  it('clears attendance caches on company switch', () => {
    setCachedMatrix('2026-10-17', { rows: ['alpha-emp'] }, 1);
    setCachedPunchToday({ status: 'present', hours: 7.5 }, null);

    assert.ok(getCachedMatrix('2026-10-17'));
    assert.ok(getCachedPunchToday());

    clearAttendanceCaches();

    assert.equal(getCachedMatrix('2026-10-17'), undefined);
    assert.equal(getCachedPunchToday(), undefined);
  });

  it('clears daily log caches on company switch', () => {
    setCachedWorked('2026-10-01', '2026-10-17', 'user-1', { total: 40, byDate: {} });
    setCachedEmployees([{ id: 'user-1', full_name: 'Alpha Employee' }]);

    assert.ok(getCachedWorked('2026-10-01', '2026-10-17', 'user-1'));
    assert.ok(getCachedEmployees());

    clearDailyLogCaches();

    assert.equal(getCachedWorked('2026-10-01', '2026-10-17', 'user-1'), undefined);
    assert.equal(getCachedEmployees(), undefined);
  });

  it('clears CRM caches on company switch', () => {
    setCachedPipeline({ columns: ['lead-1', 'lead-2'] });

    assert.ok(getCachedPipeline());

    clearCrmCaches();

    assert.equal(getCachedPipeline(), undefined);
  });

  it('guarantees complete isolation when full wipe runs on company switch', () => {
    // Populate across all modules for Company A
    setCachedMatrix('2026-10-17', { data: 'Company A Secret' }, 2);
    setCachedWorked('2026-10-01', '2026-10-17', 'user-a', { total: 35, byDate: {} });
    setCachedPipeline({ leads: ['company-a-client'] });

    // Switch company executes full wipe
    clearAttendanceCaches();
    clearDailyLogCaches();
    clearCrmCaches();

    // Verify zero data from Company A leaks into Company B session
    assert.equal(getCachedMatrix('2026-10-17'), undefined);
    assert.equal(getCachedWorked('2026-10-01', '2026-10-17', 'user-a'), undefined);
    assert.equal(getCachedPipeline(), undefined);
  });
});
