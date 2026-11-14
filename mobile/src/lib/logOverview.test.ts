import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coveragePercent,
  formatHours,
  formatSignedHours,
  mondayOf,
  monthBounds,
  exceptionInWindow,
  liveShiftFromMatrix,
  personStatus,
  snapshotSearch,
} from './logOverview.ts';

describe('log overview matches web snapshot contract', () => {
  it('formats hours the same way as the web compliance screen', () => {
    assert.equal(formatHours(8), '8h');
    assert.equal(formatHours(1.5), '1h 30m');
    assert.equal(formatHours(0.5), '30m');
    assert.equal(formatSignedHours(0), '0h');
    assert.equal(formatSignedHours(-1.25), '−1h 15m');
    assert.equal(formatSignedHours(2), '+2h');
  });

  it('builds the same snapshot query the web compliance screen uses', () => {
    assert.equal(
      snapshotSearch({ mode: 'today', anchor: '2026-11-12', today: '2026-11-12' }),
      '?date=2026-11-12&range=today',
    );
    assert.equal(
      snapshotSearch({ mode: 'week', anchor: '2026-11-12', today: '2026-11-12' }),
      `?date=${mondayOf('2026-11-12')}&range=week`,
    );
    const month = monthBounds('2026-11-12', '2026-11-12');
    assert.equal(
      snapshotSearch({ mode: 'month', anchor: '2026-11-12', today: '2026-11-12' }),
      `?range=range&start_date=${month.start}&end_date=${month.end}`,
    );
    assert.equal(month.start, '2026-11-01');
    assert.equal(month.end, '2026-11-12');
  });

  it('uses the attendance register to tell an open shift from someone who has not punched', () => {
    const today = { periodEnded: false, includesToday: true };
    assert.equal(
      liveShiftFromMatrix({ user_id: '1', check_in: '09:41', check_out: null, status: 'present', status_badge: 'Present' }),
      'in_shift',
    );
    assert.equal(
      liveShiftFromMatrix({ user_id: '1', punch_in: '10:05', punch_out: '', status: 'late', status_badge: 'Late' }),
      'in_shift',
    );
    assert.equal(
      liveShiftFromMatrix({ user_id: '1', status: 'awaiting_checkin', status_badge: 'Awaiting' }),
      'awaiting',
    );
    assert.equal(
      personStatus(
        { user_id: '1', full_name: 'A', logged: false, worked_hours: 0, logged_hours: 0, gap_hours: 0, due: false, has_checkin: false, has_checkout: true },
        { ...today, live: 'in_shift' },
      ),
      'in_shift',
    );
    assert.equal(
      personStatus(
        { user_id: '1', full_name: 'A', logged: false, worked_hours: 0, logged_hours: 0, gap_hours: 0, due: false },
        { ...today, live: 'awaiting' },
      ),
      'awaiting',
    );
    assert.equal(
      personStatus(
        { user_id: '1', full_name: 'A', logged: false, worked_hours: 8, logged_hours: 0, gap_hours: 8, due: true, has_checkout: true },
        today,
      ),
      'missing',
    );
    assert.equal(
      exceptionInWindow(
        { id: '1', user_id: '1', date: '2026-11-14', full_name: 'A' },
        '2026-11-09',
        '2026-11-14',
        '2026-11-12',
      ),
      false,
    );
    assert.equal(
      exceptionInWindow(
        { id: '1', user_id: '1', date: '2026-11-11', full_name: 'A' },
        '2026-11-09',
        '2026-11-14',
        '2026-11-12',
      ),
      true,
    );
    assert.equal(coveragePercent(4, 8), 50);
    assert.equal(coveragePercent(0, 0), 0);
  });
});
