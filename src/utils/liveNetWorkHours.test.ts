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

  it('cricket Saturday afternoon shift: 12:00–16:21 is 4h21m when counting from check-in', () => {
    expect(
      provisionalNetWorkMinutes({
        checkIn: '12:00',
        checkOut: '16:21',
        shiftStart: '14:00',
        shiftEnd: '20:00',
        breakDurationMinutes: 0,
        countFromActualCheckIn: true,
      })
    ).toBe(4 * 60 + 21);
  });

  it('same session clamps to 14:00 without the relaxed flag', () => {
    expect(
      provisionalNetWorkMinutes({
        checkIn: '12:00',
        checkOut: '16:21',
        shiftStart: '14:00',
        shiftEnd: '20:00',
        breakDurationMinutes: 0,
      })
    ).toBe(2 * 60 + 21);
  });
