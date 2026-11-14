import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatMinutes,
  formatSignedMinutes,
  formatPercentage,
  getVarianceTone,
  getCoverageTone,
  pktTodayIso,
  pktWeekBounds,
  pktMonthBounds,
  shiftDateRange,
  type UnifiedVarianceData,
} from './logVariance.ts';
import {
  makeLogVarianceCacheKey,
  getCachedLogVariance,
  setCachedLogVariance,
  invalidateLogVarianceCache,
  isLogVarianceCacheStale,
  clearDailyLogCaches,
  type CacheEntry,
} from './dailyLogCache.ts';

describe('log variance formatting and tones', () => {
  it('formats minutes into h m strings', () => {
    assert.equal(formatMinutes(0), '0m');
    assert.equal(formatMinutes(45), '45m');
    assert.equal(formatMinutes(480), '8h');
    assert.equal(formatMinutes(489), '8h 09m');
    assert.equal(formatMinutes(null), '—');
    assert.equal(formatMinutes(undefined), '—');
  });

  it('formats signed minutes with explicit signs', () => {
    assert.equal(formatSignedMinutes(0), '0m');
    assert.equal(formatSignedMinutes(90), '+1h 30m');
    assert.equal(formatSignedMinutes(-45), '-45m');
    assert.equal(formatSignedMinutes(null), '—');
  });

  it('formats percentage with decimals', () => {
    assert.equal(formatPercentage(95.4, 0), '95%');
    assert.equal(formatPercentage(87.1, 1), '87.1%');
    assert.equal(formatPercentage(null), '—');
  });

  it('evaluates variance tone according to §4.6 rules', () => {
    // Single day (daysPresent = 1)
    assert.equal(getVarianceTone(-45, 1), 'info'); // logged > worked by >30m
    assert.equal(getVarianceTone(-25, 1), 'success'); // within ±30m
    assert.equal(getVarianceTone(0, 1), 'success');
    assert.equal(getVarianceTone(20, 1), 'success');
    assert.equal(getVarianceTone(45, 1), 'warning'); // 31-60m unlogged
    assert.equal(getVarianceTone(60, 1), 'warning');
    assert.equal(getVarianceTone(90, 1), 'danger'); // >60m unlogged

    // Multi-day average: 80 mins over 2 present days = 40m/day -> warning
    assert.equal(getVarianceTone(80, 2), 'warning');
    // Multi-day average: 140 mins over 2 present days = 70m/day -> danger
    assert.equal(getVarianceTone(140, 2), 'danger');
  });

  it('evaluates coverage tone', () => {
    assert.equal(getCoverageTone(96), 'success');
    assert.equal(getCoverageTone(95), 'success');
    assert.equal(getCoverageTone(85), 'warning');
    assert.equal(getCoverageTone(75), 'danger');
    assert.equal(getCoverageTone(null), 'neutral');
  });
});

describe('PKT date helpers', () => {
  it('returns valid PKT date string', () => {
    const today = pktTodayIso();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('computes Mon-Sat week bounds in PKT', () => {
    // 2026-11-04 is Wednesday -> week is 2026-11-02 to 2026-11-07
    const ref = new Date('2026-11-04T12:00:00Z');
    const { start, end } = pktWeekBounds(ref);
    assert.equal(start, '2026-11-02');
    assert.equal(end, '2026-11-07');
  });

  it('computes month bounds in PKT', () => {
    const ref = new Date('2026-11-15T12:00:00Z');
    const { start, end } = pktMonthBounds(ref);
    assert.equal(start, '2026-11-01');
    assert.equal(end, '2026-11-30');
  });

  it('shifts date range by duration', () => {
    const { start, end } = shiftDateRange('2026-11-01', '2026-11-10', 1);
    assert.equal(start, '2026-11-11');
    assert.equal(end, '2026-11-20');

    const prev = shiftDateRange('2026-11-11', '2026-11-20', -1);
    assert.equal(prev.start, '2026-11-01');
    assert.equal(prev.end, '2026-11-10');
  });
});

describe('log variance cache policy', () => {
  const sampleData: UnifiedVarianceData = {
    summary: {
      days_present: 5,
      days_absent: 1,
      days_scheduled: 6,
      worked: 2400,
      logged: 2200,
      variance: 200,
      coverage_pct: 91.7,
      avg_logged_per_present_day: 440,
      avg_worked_per_present_day: 480,
      days_no_log: 0,
      days_under_target: 1,
      days_outside_hours: 0,
      submission_pct: 100,
    },
    range: {
      start: '2026-11-01',
      end: '2026-11-10',
      today_included: false,
      today: '2026-11-11',
    },
  };

  it('creates key as user|start|end', () => {
    assert.equal(makeLogVarianceCacheKey('u123', '2026-11-01', '2026-11-10'), 'u123|2026-11-01|2026-11-10');
    assert.equal(makeLogVarianceCacheKey('', '2026-11-01', '2026-11-10'), '|2026-11-01|2026-11-10');
  });

  it('stores and retrieves cached log variance data', () => {
    clearDailyLogCaches();
    setCachedLogVariance('u1', '2026-11-01', '2026-11-10', sampleData);
    const cached = getCachedLogVariance('u1', '2026-11-01', '2026-11-10');
    assert.ok(cached);
    assert.equal(cached.data.summary.worked, 2400);
  });

  it('enforces TTL: 5 min for today-included, 30 min for past range', () => {
    const pastEntry: CacheEntry<UnifiedVarianceData> = {
      data: sampleData,
      fetchedAt: Date.now() - 20 * 60 * 1000, // 20 min ago
    };
    // Past range (TTL 30 min): 20 min is still fresh
    assert.equal(isLogVarianceCacheStale(pastEntry, '2026-11-01', '2026-11-10', '2026-11-11'), false);

    // After 35 min: stale
    const oldPastEntry: CacheEntry<UnifiedVarianceData> = {
      data: sampleData,
      fetchedAt: Date.now() - 35 * 60 * 1000,
    };
    assert.equal(isLogVarianceCacheStale(oldPastEntry, '2026-11-01', '2026-11-10', '2026-11-11'), true);

    // Range including today (TTL 5 min)
    const todayData: UnifiedVarianceData = {
      ...sampleData,
      range: {
        start: '2026-11-01',
        end: '2026-11-11',
        today_included: true,
        today: '2026-11-11',
      },
    };
    const freshTodayEntry: CacheEntry<UnifiedVarianceData> = {
      data: todayData,
      fetchedAt: Date.now() - 3 * 60 * 1000, // 3 min ago
    };
    assert.equal(isLogVarianceCacheStale(freshTodayEntry, '2026-11-01', '2026-11-11', '2026-11-11'), false);

    const staleTodayEntry: CacheEntry<UnifiedVarianceData> = {
      data: todayData,
      fetchedAt: Date.now() - 6 * 60 * 1000, // 6 min ago
    };
    assert.equal(isLogVarianceCacheStale(staleTodayEntry, '2026-11-01', '2026-11-11', '2026-11-11'), true);
  });

  it('invalidates cache cleanly on log mutations', () => {
    setCachedLogVariance('u1', '2026-11-01', '2026-11-10', sampleData);
    assert.ok(getCachedLogVariance('u1', '2026-11-01', '2026-11-10'));

    invalidateLogVarianceCache();
    assert.equal(getCachedLogVariance('u1', '2026-11-01', '2026-11-10'), undefined);
  });

  it('fetchLogVariance captures today_live from res.summary.today_live and attaches days', async () => {
    const { fetchLogVariance } = await import('./logVariance.ts');
    const mockCaller = async <T>(_endpoint: string): Promise<T> => {
      return {
        user: { user_id: 'u1', name: 'Sibat', role: 'team_member' },
        summary: {
          worked: 0,
          logged: 0,
          variance: 0,
          days_present: 0,
          days_absent: 0,
          days_scheduled: 1,
          coverage_pct: null,
          avg_logged_per_present_day: null,
          avg_worked_per_present_day: null,
          days_no_log: 0,
          days_under_target: 0,
          days_outside_hours: 0,
          submission_pct: null,
          today_live: { worked: 157, logged: 160 },
        },
        days: [
          {
            date: '2026-11-14',
            status: 'live',
            status_label: 'Live',
            check_in: '14:19',
            check_out: null,
            worked: 157,
            pending_ot: 0,
            expected: 360,
            logged: 160,
            variance: -3,
            coverage_pct: null,
            tone: 'neutral',
            flags: ['live', 'NOT IN TOTALS YET'],
            entries_count: 4,
            compare_ready: false,
          },
        ],
        range: {
          start: '2026-11-14',
          end: '2026-11-14',
          today_included: true,
          today: '2026-11-14',
        },
      } as unknown as T;
    };

    const res = await fetchLogVariance('2026-11-14', '2026-11-14', 'u1', mockCaller);
    assert.ok(res.today_live, 'today_live should be extracted');
    assert.equal(res.today_live?.worked, 157);
    assert.equal(res.today_live?.logged, 160);
    assert.equal(res.days?.length, 1);
    assert.equal(res.days?.[0].status, 'live');
  });
});
