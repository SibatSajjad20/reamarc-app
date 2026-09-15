export function normalizeRole(role?: string | null): string {
  return String(role || '').toLowerCase().trim();
}

export function isAdmin(role?: string | null): boolean {
  const value = normalizeRole(role);
  return value === 'admin' || value === 'super_admin';
}

export function canBroadcast(role?: string | null): boolean {
  const value = normalizeRole(role);
  return isAdmin(value) || value === 'hr';
}

export function canReviewRequests(role?: string | null): boolean {
  const value = normalizeRole(role);
  return value === 'hr' || value === 'admin' || value === 'super_admin' || value === 'operations';
}

export function canAccessCrm(user?: {
  role?: string | null;
  department?: string | null;
  crm_enabled?: boolean | null;
} | null): boolean {
  if (!user) return false;
  if (user.crm_enabled === false) return false;
  const role = normalizeRole(user.role);
  const dept = String(user.department || '').toLowerCase().trim();

  // Admin and Operations have full access
  if (role === 'admin' || role === 'super_admin' || role === 'operations' || dept === 'operations' || dept === 'admin') {
    return true;
  }

  // Only team leads and team members of Sales department
  if (dept === 'sales' && (role === 'team_lead' || role === 'team_member' || role === 'member')) {
    return true;
  }

  return false;
}

export function canAssignCrmLeads(user?: {
  role?: string | null;
  department?: string | null;
  crm_enabled?: boolean | null;
} | null): boolean {
  if (!canAccessCrm(user)) return false;
  const role = normalizeRole(user?.role);
  return role === 'admin' || role === 'super_admin' || role === 'operations' || role === 'team_lead';
}
