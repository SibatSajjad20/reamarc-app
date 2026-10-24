import { describe, expect, it } from 'vitest';
import { isRelaxedDay, relaxedDayApplies } from './relaxedDay';

describe('relaxedDayApplies', () => {
  it('includes office staff and skips WFH plus named people', () => {
    expect(isRelaxedDay('relaxed_day')).toBe(true);
    expect(
      relaxedDayApplies({
        excludeUserIds: ['ahmed', 'junaid'],
        excludeWfh: true,
        userId: 'sibat',
        isWfh: false,
      })
    ).toBe(true);
    expect(
      relaxedDayApplies({
        excludeUserIds: ['ahmed', 'junaid'],
        userId: 'ahmed',
        isWfh: false,
      })
    ).toBe(false);
    expect(
      relaxedDayApplies({
        excludeUserIds: ['ahmed'],
        userId: 'wfh-person',
        isWfh: true,
      })
    ).toBe(false);
  });
});
