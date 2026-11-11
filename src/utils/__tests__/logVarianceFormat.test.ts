import { describe, it, expect } from 'vitest';
import {
  formatMinutes,
  formatSignedMinutes,
  formatPercentage,
  getVarianceTone,
  getCoverageTone,
  getToneBadgeClass,
  getToneTextClass,
} from '../logVarianceFormat';

describe('logVarianceFormat utils', () => {
  describe('formatMinutes', () => {
    it('handles null, undefined and NaN', () => {
      expect(formatMinutes(null)).toBe('—');
      expect(formatMinutes(undefined)).toBe('—');
      expect(formatMinutes(NaN)).toBe('—');
    });

    it('formats 0 minutes as 0m', () => {
      expect(formatMinutes(0)).toBe('0m');
    });

    it('formats minutes under 1h as Xm', () => {
      expect(formatMinutes(45)).toBe('45m');
      expect(formatMinutes(5)).toBe('5m');
    });

    it('formats exact hours as Xh', () => {
      expect(formatMinutes(60)).toBe('1h');
      expect(formatMinutes(480)).toBe('8h');
    });

    it('formats hours and minutes as Xh Ym with 2 digits for minutes', () => {
      expect(formatMinutes(489)).toBe('8h 09m');
      expect(formatMinutes(495)).toBe('8h 15m');
      expect(formatMinutes(75)).toBe('1h 15m');
    });
  });

  describe('formatSignedMinutes', () => {
    it('handles null, undefined and NaN', () => {
      expect(formatSignedMinutes(null)).toBe('—');
      expect(formatSignedMinutes(undefined)).toBe('—');
    });

    it('formats 0 as 0m without sign', () => {
      expect(formatSignedMinutes(0)).toBe('0m');
    });

    it('formats positive numbers with +', () => {
      expect(formatSignedMinutes(45)).toBe('+45m');
      expect(formatSignedMinutes(480)).toBe('+8h');
      expect(formatSignedMinutes(898)).toBe('+14h 58m');
    });

    it('formats negative numbers with -', () => {
      expect(formatSignedMinutes(-50)).toBe('-50m');
      expect(formatSignedMinutes(-480)).toBe('-8h');
      expect(formatSignedMinutes(-65)).toBe('-1h 05m');
    });
  });

  describe('formatPercentage', () => {
    it('handles null, undefined and NaN', () => {
      expect(formatPercentage(null)).toBe('—');
      expect(formatPercentage(undefined)).toBe('—');
    });

    it('formats percentage with default 0 decimals', () => {
      expect(formatPercentage(95.4)).toBe('95%');
      expect(formatPercentage(100)).toBe('100%');
      expect(formatPercentage(0)).toBe('0%');
    });

    it('formats percentage with custom decimal places', () => {
      expect(formatPercentage(95.45, 1)).toBe('95.5%');
      expect(formatPercentage(95.45, 2)).toBe('95.45%');
    });
  });

  describe('getVarianceTone (§4.6 rules)', () => {
    it('returns neutral for invalid inputs', () => {
      expect(getVarianceTone(null)).toBe('neutral');
      expect(getVarianceTone(undefined)).toBe('neutral');
      expect(getVarianceTone(60, 0)).toBe('neutral');
    });

    it('returns info for over-logged time (v < -30)', () => {
      expect(getVarianceTone(-35)).toBe('info');
      expect(getVarianceTone(-120)).toBe('info');
      // When scaled by daysPresent = 2, -70 / 2 = -35 -> info
      expect(getVarianceTone(-70, 2)).toBe('info');
    });

    it('returns success for |v| <= 30', () => {
      expect(getVarianceTone(0)).toBe('success');
      expect(getVarianceTone(30)).toBe('success');
      expect(getVarianceTone(-30)).toBe('success');
      // When scaled by daysPresent = 2, 50 / 2 = 25 -> success
      expect(getVarianceTone(50, 2)).toBe('success');
    });

    it('returns warning for 31 <= v <= 60', () => {
      expect(getVarianceTone(31)).toBe('warning');
      expect(getVarianceTone(60)).toBe('warning');
      // When scaled by daysPresent = 2, 100 / 2 = 50 -> warning
      expect(getVarianceTone(100, 2)).toBe('warning');
    });

    it('returns danger for v > 60', () => {
      expect(getVarianceTone(61)).toBe('danger');
      expect(getVarianceTone(180)).toBe('danger');
      // When scaled by daysPresent = 2, 140 / 2 = 70 -> danger
      expect(getVarianceTone(140, 2)).toBe('danger');
    });
  });

  describe('getCoverageTone', () => {
    it('returns neutral for null / undefined', () => {
      expect(getCoverageTone(null)).toBe('neutral');
      expect(getCoverageTone(undefined)).toBe('neutral');
    });

    it('returns success for coverage >= 95%', () => {
      expect(getCoverageTone(95)).toBe('success');
      expect(getCoverageTone(100)).toBe('success');
      expect(getCoverageTone(120)).toBe('success');
    });

    it('returns warning for 80% <= coverage < 95%', () => {
      expect(getCoverageTone(94.9)).toBe('warning');
      expect(getCoverageTone(80)).toBe('warning');
    });

    it('returns danger for coverage < 80%', () => {
      expect(getCoverageTone(79.9)).toBe('danger');
      expect(getCoverageTone(50)).toBe('danger');
      expect(getCoverageTone(0)).toBe('danger');
    });
  });

  describe('token styling classes', () => {
    it('returns correct theme token classes without raw hex', () => {
      expect(getToneBadgeClass('success')).toContain('bg-success-bg');
      expect(getToneBadgeClass('warning')).toContain('bg-warning-bg');
      expect(getToneBadgeClass('danger')).toContain('bg-danger-bg');
      expect(getToneBadgeClass('info')).toContain('bg-info-bg');

      expect(getToneTextClass('success')).toBe('text-success-fg');
      expect(getToneTextClass('warning')).toBe('text-warning-fg');
      expect(getToneTextClass('danger')).toBe('text-danger-fg');
      expect(getToneTextClass('info')).toBe('text-info-fg');
    });
  });
});
