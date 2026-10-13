/**
 * CRM access helpers - thin wrapper over permissions payload from /auth/me.
 */

export function canAccessCrm(user?: {
  role?: string;
  department?: string;
  crm_enabled?: boolean;
  permissions?: any;
} | null): boolean {
  if (!user) return false;
  if (user.crm_enabled === false) return false;
  const role = (user.role || '').toLowerCase().trim();

  if (role === 'admin') return true;
  if (role === 'client' || role === 'hr' || role === 'operations') return false;

  if (user.permissions) {
    const summary = user.permissions.summary?.sales;
    if (summary && summary !== 'none') return true;
    const mod = user.permissions.modules?.sales;
    if (mod && Object.values(mod).some((lvl) => lvl && lvl !== 'none')) {
      return true;
    }
    return false;
  }

  return false;
}

export function canAssignCrmLeads(user?: {
  role?: string;
  department?: string;
  crm_enabled?: boolean;
  permissions?: any;
} | null): boolean {
  if (!canAccessCrm(user)) return false;
  const role = (user?.role || '').toLowerCase().trim();
  if (role === 'admin') return true;

  if (user?.permissions) {
    const summary = user.permissions.summary?.sales;
    if (summary === 'department' || summary === 'all') return role === 'team_lead' || role === 'lead';
    const mod = user.permissions.modules?.sales;
    if (mod) {
      const salesLvl = mod['Sales'] || mod['sales'];
      if (salesLvl === 'department' || salesLvl === 'all') return role === 'team_lead' || role === 'lead';
    }
  }

  return false;
}
