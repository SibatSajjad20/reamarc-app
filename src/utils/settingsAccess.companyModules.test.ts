import { describe, expect, it } from 'vitest';
import { getVisibleSettingsSections, settingsSectionCompanyModule } from './settingsAccess';

const dvAdmin = {
  role: 'admin',
  company_modules: ['sales', 'active_clients'],
};

const rmAdmin = {
  role: 'admin',
  company_modules: null,
};

describe('settingsAccess company modules', () => {
  it('DataViz admin keeps account, access and sales settings only', () => {
    const slugs = getVisibleSettingsSections(dvAdmin).map((s) => s.slug);
    expect(slugs).toContain('profile');
    expect(slugs).toContain('access');
    expect(slugs).toContain('lead-sources');
    expect(slugs).not.toContain('attendance-shifts');
    expect(slugs).not.toContain('daily-log-fields');
    expect(slugs).not.toContain('ad-accounts');
  });

  it('Reamarc admin keeps attendance settings', () => {
    const slugs = getVisibleSettingsSections(rmAdmin).map((s) => s.slug);
    expect(slugs).toContain('attendance-shifts');
    expect(slugs).toContain('access');
  });

  it('maps settings slugs to company modules', () => {
    expect(settingsSectionCompanyModule('attendance-shifts')).toBe('attendance');
    expect(settingsSectionCompanyModule('holidays')).toBe('attendance');
    expect(settingsSectionCompanyModule('daily-log-fields')).toBe('daily_log');
    expect(settingsSectionCompanyModule('ad-accounts')).toBe('ads');
    expect(settingsSectionCompanyModule('content-calendar-fields')).toBe('content_calendar');
    expect(settingsSectionCompanyModule('access')).toBeNull();
    expect(settingsSectionCompanyModule('profile')).toBeNull();
  });
});
