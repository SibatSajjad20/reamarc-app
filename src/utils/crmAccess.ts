export function canAccessCrm(user?: {
  role?: string;
  department?: string;
  crm_enabled?: boolean;
} | null): boolean {
  if (!user) return false;
  if (user.crm_enabled === false) return false;
  const role = (user.role || '').toLowerCase().trim();
  const dept = (user.department || '').toLowerCase().trim();

  // Admin and Operations have full access
  if (role === 'admin' || role === 'operations' || dept === 'operations' || dept === 'admin') {
    return true;
  }

  // Only team leads and team members of Sales department
  if (dept === 'sales' && (role === 'team_lead' || role === 'team_member' || role === 'member')) {
    return true;
  }

  return false;
}

export function canAssignCrmLeads(user?: {
  role?: string;
  department?: string;
  crm_enabled?: boolean;
} | null): boolean {
  if (!canAccessCrm(user)) return false;
  const role = (user?.role || '').toLowerCase().trim();
  return role === 'admin' || role === 'operations' || role === 'team_lead';
}

