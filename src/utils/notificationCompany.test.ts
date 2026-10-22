import { describe, it, expect } from 'vitest';
import { shouldSwitchCompanyForPush } from './notificationCompany';

describe('web notification company switch', () => {
  const companies = [{ id: 'comp_a' }, { id: 'comp_b' }];

  it('returns the push company when it differs and the user belongs to it', () => {
    expect(shouldSwitchCompanyForPush('comp_a', { company_id: 'comp_b' }, companies)).toBe('comp_b');
  });

  it('does not switch for the current company or an unknown company', () => {
    expect(shouldSwitchCompanyForPush('comp_a', { company_id: 'comp_a' }, companies)).toBeNull();
    expect(shouldSwitchCompanyForPush('comp_a', { company_id: 'comp_z' }, companies)).toBeNull();
  });
});
