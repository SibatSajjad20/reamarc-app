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

export interface RoleUserLike {
  role?: string | null;
  department?: string | null;
  crm_enabled?: boolean | null;
  permissions?: {
    summary?: { [key: string]: string | undefined; sales?: string };
    capabilities?: { approve_won_deal?: boolean };
    view_only?: boolean;
    tracked?: { attendance?: boolean; daily_log?: boolean };
    modules?: { attendance?: boolean; daily_log?: boolean; [key: string]: boolean | undefined };
    [key: string]: any;
  } | null;
  tracked?: { attendance?: boolean; daily_log?: boolean };
  access_settings?: any;
  [key: string]: any;
}

export function canAccessCrm(user?: RoleUserLike | null): boolean {
  if (!user) return false;
  if (user.crm_enabled === false) return false;
  const role = normalizeRole(user.role);
  if (role === 'admin' || role === 'super_admin') return true;
  if (role === 'client' || role === 'hr') return false;
  if (role === 'operations') return true;
  const sales = user.permissions?.summary?.sales;
  if (sales != null) {
    return sales !== 'none';
  }
  return false;
}

export function canApproveWonDeals(user?: RoleUserLike | null): boolean {
  if (normalizeRole(user?.role) === 'operations' || Boolean(user?.permissions?.capabilities?.approve_won_deal)) {
    return true;
  }
  return false;
}

export function canSeeWonDealApprovals(user?: RoleUserLike | null): boolean {
  return canApproveWonDeals(user);
}

export function canReopenCrmLeads(user?: RoleUserLike | null): boolean {
  if (!canAccessCrm(user)) return false;
  const role = normalizeRole(user?.role);
  if (role === 'operations' || user?.permissions?.view_only) return false;
  return role === 'admin' || role === 'super_admin';
}

export function canAssignCrmLeads(user?: RoleUserLike | null): boolean {
  if (!canAccessCrm(user)) return false;
  const role = normalizeRole(user?.role);
  if (role === 'operations' || user?.permissions?.view_only) return false;
  return role === 'admin' || role === 'super_admin' || role === 'team_lead';
}

export function isAttendanceTracked(user?: any): boolean {
  if (!user) return false;
  if (user.permissions?.tracked?.attendance !== undefined) {
    return Boolean(user.permissions.tracked.attendance);
  }
  if (user.tracked?.attendance !== undefined) {
    return Boolean(user.tracked.attendance);
  }
  if (user.access_settings?.tracked?.attendance !== undefined) {
    return Boolean(user.access_settings.tracked.attendance);
  }
  const role = normalizeRole(user.role);
  return role !== 'admin' && role !== 'super_admin' && role !== 'client';
}

export function isDailyLogTracked(user?: any): boolean {
  if (!user) return false;
  if (user.permissions?.tracked?.daily_log !== undefined) {
    return Boolean(user.permissions.tracked.daily_log);
  }
  if (user.tracked?.daily_log !== undefined) {
    return Boolean(user.tracked.daily_log);
  }
  if (user.access_settings?.tracked?.daily_log !== undefined) {
    return Boolean(user.access_settings.tracked.daily_log);
  }
  const role = normalizeRole(user.role);
  return role !== 'admin' && role !== 'super_admin' && role !== 'client' && role !== 'operations';
}

export function canAccessAttendance(user?: any): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (role === 'client') return false;
  if (role === 'admin' || role === 'super_admin' || role === 'hr' || role === 'operations') return true;
  if (user.permissions?.modules?.attendance !== undefined) {
    return Boolean(user.permissions.modules.attendance);
  }
  return true;
}

export function canAccessDailyLog(user?: any): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (role === 'client') return false;
  if (role === 'admin' || role === 'super_admin' || role === 'hr') return true;
  if (user.permissions?.modules?.daily_log !== undefined) {
    return Boolean(user.permissions.modules.daily_log);
  }
  return role !== 'operations';
}
