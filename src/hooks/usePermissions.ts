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

function levelGte(module: string, current: string | undefined, target: string): boolean {
  if (!current) return false;
  const ranks = MODULE_LEVEL_RANKS[module];
  if (!ranks) return false;
  const cRank = ranks[current] ?? -1;
  const tRank = ranks[target] ?? 0;
  return cRank >= tRank;
}

export function usePermissions() {
  const { user } = useAuth();

  const permissions = useMemo(() => {
    return user?.permissions;
  }, [user]);

  const can = useMemo(() => {
    return (module: string, minLevel: string, department?: string): boolean => {
      if (!user || user.is_active === false) return false;
      const role = String(user.role || '').toLowerCase();
      if (role === 'admin') return true;
      if (role === 'client') return false;

      if (!permissions) {
        // Deny access if permissions payload is not yet loaded (must follow /auth/me)
        return false;
      }

      const modPerms = permissions.modules?.[module];
      if (!modPerms) return false;

      let currentLevel: string | undefined;
      if (department) {
        currentLevel = modPerms[department] || modPerms[department.toLowerCase()];
      } else {
        currentLevel = permissions.summary?.[module];
      }

      if (!currentLevel) {
        currentLevel = permissions.summary?.[module] || 'none';
      }

      return levelGte(module, currentLevel, minLevel);
    };
  }, [user, permissions]);

  const primaryDepartment = useMemo(() => {
    return user?.primary_department || permissions?.primary_department || user?.departments?.[0] || '';
  }, [user, permissions]);

  const departments = useMemo(() => {
    if (user?.departments && user.departments.length > 0) return user.departments;
    if (permissions?.departments && permissions.departments.length > 0) return permissions.departments;
    if (primaryDepartment) return [primaryDepartment];
    return [];
  }, [user, permissions, primaryDepartment]);

  return {
    user,
    permissions,
    can,
    primaryDepartment,
    departments,
    isAdmin: user?.role === 'admin',
    isLead: user?.role === 'team_lead',
    canAccessDailyLog: can('daily_log', 'own'),
    canAccessAttendance: can('attendance', 'own'),
    canAccessContentCalendar: can('content_calendar', 'view'),
    canAccessWebsitePipeline: can('website', 'view'),
    canAccessCrm: can('sales', 'own'),
    canAccessActiveClients: can('active_clients', 'view'),
    canAccessAds: can('ads', 'view'),
    isContentLead: user?.role === 'admin' || can('content_calendar', 'manage', 'content'),
    isCreativeLead: user?.role === 'admin' || can('content_calendar', 'manage', 'creative'),
    isWebsiteLead: user?.role === 'admin' || can('website', 'manage', 'website'),
  };
}
