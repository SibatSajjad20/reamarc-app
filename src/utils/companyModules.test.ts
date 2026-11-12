import { describe, expect, it } from 'vitest';
import {
  COMPANY_MODULE_KEYS,
  isCompanyModuleEnabled,
  showWonDealClientWorkspaceCta,
} from './companyModules';

describe('companyModules', () => {
  it('treats null/undefined as all enabled', () => {
    expect(isCompanyModuleEnabled(null, 'tasks')).toBe(true);
    expect(isCompanyModuleEnabled({}, 'attendance')).toBe(true);
    expect(isCompanyModuleEnabled({ company_modules: null }, 'dashboard')).toBe(true);
  });

  it('restricts DataViz to sales and active_clients', () => {
    const user = { company_modules: ['sales', 'active_clients'] };
    expect(isCompanyModuleEnabled(user, 'sales')).toBe(true);
    expect(isCompanyModuleEnabled(user, 'active_clients')).toBe(true);
    expect(isCompanyModuleEnabled(user, 'tasks')).toBe(false);
    expect(isCompanyModuleEnabled(user, 'dashboard')).toBe(false);
    expect(isCompanyModuleEnabled(user, 'attendance')).toBe(false);
    expect(showWonDealClientWorkspaceCta(user)).toBe(true);
  });

  it('hides won-deal client workspace CTA when active_clients is off', () => {
    const user = { company_modules: ['sales'] };
    expect(showWonDealClientWorkspaceCta(user)).toBe(false);
  });

  it('lists every registry key', () => {
    expect(COMPANY_MODULE_KEYS).toEqual([
      'dashboard',
      'sales',
      'active_clients',
      'content_calendar',
      'website',
      'ads',
      'attendance',
      'daily_log',
      'finance',
      'tasks',
    ]);
  });
});
