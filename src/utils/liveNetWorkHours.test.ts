import { describe, expect, it } from 'vitest';
import { provisionalNetWorkMinutes } from './liveNetWorkHours';

describe('provisionalNetWorkMinutes', () => {
  it('clips early evening-shift clock-in to 14:00 on a normal day', () => {
    expect(
      provisionalNetWorkMinutes({
        checkIn: '11:23',
        checkOut: '14:41',
        shiftStart: '14:00',
        shiftEnd: '20:00',
        breakDurationMinutes: 0,
      })
    ).toBe(41);
  });

  it('counts from actual check-in on a relaxed day', () => {
    expect(
      provisionalNetWorkMinutes({
        checkIn: '11:23',
        checkOut: '14:41',
        shiftStart: '14:00',
        shiftEnd: '20:00',
        breakDurationMinutes: 0,
        countFromActualCheckIn: true,
      })
    ).toBe(3 * 60 + 18);
  });
});
