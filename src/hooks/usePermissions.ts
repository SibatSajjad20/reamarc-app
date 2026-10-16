import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';

const MODULE_LEVEL_RANKS: Record<string, Record<string, number>> = {
  daily_log: { none: 0, own: 1, department: 2, all: 3 },
  attendance: { none: 0, own: 1, department: 2, all: 3 },
  exceptions: { none: 0, department: 1, all: 2 },
  content_calendar: { none: 0, view: 1, own_stages: 2, manage: 3 },
  website: { none: 0, view: 1, assigned: 2, manage: 3 },
  sales: { none: 0, own: 1, department: 2, all: 3 },
  active_clients: { none: 0, view: 1, manage: 2 },
  ads: { none: 0, view: 1, manage: 2 },
};

/** Company-wide operations access. Used when /auth/me is missing or incomplete. */
export const OPERATIONS_MODULE_LEVELS: Record<string, string> = {
  daily_log: 'all',
  attendance: 'all',
  exceptions: 'all',
  content_calendar: 'view',
  website: 'view',
  sales: 'all',
  active_clients: 'manage',
  ads: 'view',
};

function levelGte(module: string, current: string | undefined, target: string): boolean {
  if (!current) return false;
  const ranks = MODULE_LEVEL_RANKS[module];
  if (!ranks) return false;
  const cRank = ranks[current] ?? -1;
  const tRank = ranks[target] ?? 0;
  return cRank >= tRank;
}

export function userCan(
  user: { role?: string; is_active?: boolean; permissions?: any } | null | undefined,
  module: string,
  minLevel: string,
  _department?: string,
): boolean {
  if (!user || user.is_active === false) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'admin') return true;
  if (role === 'client') return false;

  // Company-wide view-only directory: every internal login can open it.
  if (module === 'active_clients') {
    if (minLevel === 'view') return true;
    return role === 'operations';
  }

  const permissions = user.permissions;
  if (!permissions) {
    if (role === 'operations') {
      return levelGte(module, OPERATIONS_MODULE_LEVELS[module], minLevel);
    }
    return false;
  }

  // If the module switch is explicitly false, access is denied
  if (permissions.modules && permissions.modules[module] === false) {
    return false;
  }

  const currentLevel = permissions.levels?.[module] ?? permissions.summary?.[module] ?? 'none';
  return levelGte(module, currentLevel, minLevel);
}

export function usePermissions() {
  const { user } = useAuth();

  const permissions = useMemo(() => {
    return user?.permissions;
  }, [user]);

  const can = useMemo(() => {
    return (module: string, minLevel: string, department?: string): boolean =>
      userCan(user, module, minLevel, department);
  }, [user]);

  const primaryDepartment = useMemo(() => {
    return user?.primary_department || permissions?.primary_department || user?.departments?.[0] || '';
  }, [user, permissions]);

  const departments = useMemo(() => {
    if (user?.departments && user.departments.length > 0) return user.departments;
    if (permissions?.departments && permissions.departments.length > 0) return permissions.departments;
    if (primaryDepartment) return [primaryDepartment];
    return [];
  }, [user, permissions, primaryDepartment]);

  const role = String(user?.role || '').toLowerCase();
  const capabilities = permissions?.capabilities || {};
  const tracked = permissions?.tracked || {};
  const modules = permissions?.modules || {};

  return {
    user,
    permissions,
    can,
    primaryDepartment,
    departments,
    isAdmin: role === 'admin',
    isLead: role === 'team_lead',
    canAccessDailyLog: role === 'admin' ? true : Boolean(modules.daily_log && (tracked.daily_log || can('daily_log', 'own'))),
    canAccessAttendance: role === 'admin' ? true : Boolean(modules.attendance && (tracked.attendance || can('attendance', 'own'))),
    isAttendanceTracked: Boolean(tracked.attendance),
    isDailyLogTracked: Boolean(tracked.daily_log),
    canAccessContentCalendar: (modules.content_calendar ?? true) && can('content_calendar', 'view'),
    canAccessWebsitePipeline: (modules.website ?? true) && can('website', 'view'),
    canAccessCrm: (modules.sales ?? true) && can('sales', 'own'),
    isViewOnly: role === 'operations' || Boolean(permissions?.view_only),
    canApproveWonDeal: Boolean(capabilities.approve_won_deal),
    canSeeWonDealApprovals: Boolean(capabilities.approve_won_deal),
    canAccessActiveClients: can('active_clients', 'view'),
    canAccessAds: (modules.ads ?? true) && can('ads', 'view'),
    isContentLead: role === 'admin' || can('content_calendar', 'manage', 'content'),
    isCreativeLead: role === 'admin' || can('content_calendar', 'manage', 'creative'),
    isWebsiteLead: role === 'admin' || can('website', 'manage', 'website'),
  };
}
