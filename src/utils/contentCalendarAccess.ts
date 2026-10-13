export interface AccessUser {
  role?: string;
  department?: string;
  departments?: string[];
  is_active?: boolean;
  permissions?: any;
}

function roleOf(value?: string | null): string {
  return (value || '').toLowerCase().trim();
}

export function canAccessContentCalendar(user?: AccessUser | null): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user.role);
  if (role === 'admin' || role === 'superadmin') return true;
  if (role === 'client' || role === 'hr') return false;
  if (role === 'operations') return true;

  if (user.permissions) {
    const summary = user.permissions.summary?.content_calendar;
    if (summary && summary !== 'none') return true;
    const mod = user.permissions.modules?.content_calendar;
    if (mod && Object.values(mod).some((lvl) => lvl && lvl !== 'none')) {
      return true;
    }
    return false;
  }

  return false;
}
