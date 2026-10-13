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
  permissions?: { summary?: { sales?: string } } | null;
} | null): boolean {
  if (!user) return false;
  if (user.crm_enabled === false) return false;
  const sales = user.permissions?.summary?.sales;
  if (sales != null) {
    return sales !== 'none';
  }
  const role = normalizeRole(user.role);
  return role === 'admin' || role === 'super_admin';
}

export function canApproveWonDeals(user?: {
  role?: string | null;
  permissions?: {
    summary?: { sales?: string };
    capabilities?: { approve_won_deal?: boolean };
  } | null;
} | null): boolean {
  return Boolean(user?.permissions?.capabilities?.approve_won_deal);
}

export function canSeeWonDealApprovals(user?: {
  role?: string | null;
  crm_enabled?: boolean | null;
  permissions?: {
    summary?: { sales?: string };
    capabilities?: { approve_won_deal?: boolean };
  } | null;
} | null): boolean {
  return canApproveWonDeals(user) && !canAccessCrm(user);
}

export function canReopenCrmLeads(user?: {
  role?: string | null;
  department?: string | null;
  crm_enabled?: boolean | null;
} | null): boolean {
  if (!canAccessCrm(user)) return false;
  const role = normalizeRole(user?.role);
  const dept = String(user?.department || '').toLowerCase().trim();
  return role === 'admin' || role === 'super_admin' || role === 'operations' || dept === 'operations' || dept === 'admin';
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
