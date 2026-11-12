import { describe, expect, it } from 'vitest';
import { userCan } from '../usePermissions';

describe('userCan company modules', () => {
  it('admin with sales+active_clients cannot see attendance or tasks', () => {
    const user = {
      role: 'admin',
      is_active: true,
      company_modules: ['sales', 'active_clients'],
      permissions: { modules: { attendance: true, tasks: true, sales: true }, levels: {} },
    };
    expect(userCan(user, 'attendance', 'own')).toBe(false);
    expect(userCan(user, 'tasks', 'own')).toBe(false);
    expect(userCan(user, 'sales', 'own')).toBe(true);
    expect(userCan(user, 'active_clients', 'view')).toBe(true);
  });

  it('null company_modules keeps admin attendance', () => {
    const user = { role: 'admin', is_active: true, company_modules: null };
    expect(userCan(user, 'attendance', 'own')).toBe(true);
    expect(userCan(user, 'tasks', 'own')).toBe(true);
  });
});
