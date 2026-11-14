export const COMPANY_MODULE_KEYS = [
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
] as const;

export type CompanyModuleKey = (typeof COMPANY_MODULE_KEYS)[number];

export function normalizeRole(role?: string | null): string {
  return String(role || '').toLowerCase().trim();
}

export function isAdmin(role?: string | null): boolean {
  const value = normalizeRole(role);
  return value === 'admin' || value === 'super_admin';
}

export interface RoleUserLike {
  role?: string | null;
  department?: string | null;
  primary_department?: string | null;
  crm_enabled?: boolean | null;
  company_modules?: string[] | null;
  permissions?: {
    summary?: { [key: string]: string | undefined; sales?: string };
    levels?: { [key: string]: string | undefined };
    capabilities?: { approve_won_deal?: boolean };
    view_only?: boolean;
    tracked?: { attendance?: boolean; daily_log?: boolean };
    modules?: { attendance?: boolean; daily_log?: boolean; [key: string]: boolean | undefined };
    primary_department?: string;
    [key: string]: any;
  } | null;
  tracked?: { attendance?: boolean; daily_log?: boolean };
  effective_access?: { [key: string]: boolean | undefined };
  access_settings?: any;
  [key: string]: any;
}

function userFrom(input?: string | RoleUserLike | null): RoleUserLike | null {
  if (input && typeof input === 'object') return input;
  if (typeof input === 'string') return { role: input };
  return null;
}

function roleFrom(input?: string | RoleUserLike | null): string {
  if (input && typeof input === 'object') return normalizeRole(input.role);
  return normalizeRole(input);
}

/** True when the company has no allow-list, or the key is on that list. Matches web `companyModules.ts`. */
export function isCompanyModuleEnabled(
  user: RoleUserLike | null | undefined,
  key: CompanyModuleKey | string,
): boolean {
  const mods = user?.company_modules;
  if (mods == null) return true;
  return mods.includes(key);
}

export function canBroadcast(roleOrUser?: string | RoleUserLike | null): boolean {
  const user = userFrom(roleOrUser);
  if (!isCompanyModuleEnabled(user, 'attendance')) return false;
  const value = roleFrom(roleOrUser);
  return isAdmin(value) || value === 'hr';
}

export function canReviewRequests(roleOrUser?: string | RoleUserLike | null): boolean {
  const user = userFrom(roleOrUser);
  if (!isCompanyModuleEnabled(user, 'attendance')) return false;
  const value = roleFrom(roleOrUser);
  return value === 'hr' || value === 'admin' || value === 'super_admin' || value === 'operations';
}

export function canAccessCrm(user?: RoleUserLike | null): boolean {
  if (!user) return false;
  if (!isCompanyModuleEnabled(user, 'sales')) return false;
  if (user.crm_enabled === false) return false;
  const role = normalizeRole(user.role);
  if (role === 'admin' || role === 'super_admin') return true;
  if (role === 'client' || role === 'hr') return false;
  if (role === 'operations') return true;
  const salesFlag = moduleFlag(user, 'sales');
  if (salesFlag !== undefined) return salesFlag;
  const sales = user.permissions?.summary?.sales;
  if (sales != null) {
    return sales !== 'none';
  }
  return false;
}

export function canApproveWonDeals(user?: RoleUserLike | null): boolean {
  if (!isCompanyModuleEnabled(user, 'sales')) return false;
  if (normalizeRole(user?.role) === 'operations' || Boolean(user?.permissions?.capabilities?.approve_won_deal)) {
    return true;
  }
  return false;
}

export function canSeeWonDealApprovals(user?: RoleUserLike | null): boolean {
  return canApproveWonDeals(user);
}

export function canReopenCrmLeads(user?: RoleUserLike | null): boolean {
  if (!user || !canAccessCrm(user)) return false;
  const role = normalizeRole(user.role);
  if (role === 'operations' || user?.permissions?.view_only) return false;
  return role === 'admin' || role === 'super_admin';
}

export function canAssignCrmLeads(user?: RoleUserLike | null): boolean {
  if (!user || !canAccessCrm(user)) return false;
  const role = normalizeRole(user.role);
  if (role === 'operations' || user?.permissions?.view_only) return false;
  return role === 'admin' || role === 'super_admin' || role === 'team_lead';
}

export function isAttendanceTracked(user?: any): boolean {
  if (!user) return false;
  if (!isCompanyModuleEnabled(user, 'attendance')) return false;
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
  if (!isCompanyModuleEnabled(user, 'daily_log')) return false;
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
  if (!isCompanyModuleEnabled(user, 'attendance')) return false;
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
  if (!isCompanyModuleEnabled(user, 'daily_log')) return false;
  const role = normalizeRole(user.role);
  if (role === 'client') return false;
  if (role === 'admin' || role === 'super_admin' || role === 'hr') return true;
  if (user.permissions?.modules?.daily_log !== undefined) {
    return Boolean(user.permissions.modules.daily_log);
  }
  return role !== 'operations';
}

export function canAccessFinance(user?: RoleUserLike | null): boolean {
  if (!user) return false;
  if (!isCompanyModuleEnabled(user, 'finance')) return false;
  const role = normalizeRole(user.role);
  if (role === 'admin' || role === 'super_admin' || role === 'operations') return true;
  const flagged = moduleFlag(user, 'finance');
  if (flagged !== undefined) return flagged;
  return levelAllows(user, 'finance');
}

export function canManageFinance(user?: RoleUserLike | null): boolean {
  if (!user) return false;
  if (!isCompanyModuleEnabled(user, 'finance')) return false;
  const role = normalizeRole(user.role);
  if (role === 'admin' || role === 'super_admin' || role === 'operations') return true;
  return user.permissions?.summary?.finance === 'manage';
}

export function canAccessTasks(user?: RoleUserLike | null): boolean {
  if (!user) return false;
  if (!isCompanyModuleEnabled(user, 'tasks')) return false;
  const role = normalizeRole(user.role);
  if (role === 'client') return false;
  const flagged = moduleFlag(user, 'tasks');
  if (flagged !== undefined) return flagged;
  if (role === 'admin' || role === 'super_admin') return true;
  // Backend default exclusion list is HR + operations unless an admin flips it.
  if (role === 'hr' || role === 'operations') return false;
  return true;
}

const CONTENT_DEPTS = new Set([
  'creative',
  'content',
  'social media',
  'social',
  'performance marketing',
  'content and creative',
  'content & creative',
]);
const WEBSITE_DEPTS = new Set([
  'website',
  'software development',
  'web development',
  'development',
  'software',
  'dev',
]);
const ADS_DEPTS = new Set([
  'seo',
  'performance marketing',
  'performance',
  'performance_marketing',
  'ads',
]);

function primaryDepartment(user?: RoleUserLike | null): string {
  return String(
    user?.primary_department ||
      user?.permissions?.primary_department ||
      user?.department ||
      '',
  )
    .toLowerCase()
    .trim();
}

function moduleFlag(user: RoleUserLike | null | undefined, key: string): boolean | undefined {
  const eff = user?.effective_access;
  if (eff && typeof eff[key] === 'boolean') return eff[key];
  const mod = user?.permissions?.modules?.[key];
  if (typeof mod === 'boolean') return mod;
  if (mod && typeof mod === 'object') {
    return Object.values(mod as Record<string, unknown>).some(
      (value) => Boolean(value) && value !== 'none',
    );
  }
  return undefined;
}

function levelAllows(user: RoleUserLike | null | undefined, key: string): boolean {
  const level = user?.permissions?.levels?.[key] ?? user?.permissions?.summary?.[key];
  return Boolean(level && level !== 'none');
}

export function isHomeReviewer(roleOrUser?: string | RoleUserLike | null): boolean {
  const user = userFrom(roleOrUser);
  if (!isCompanyModuleEnabled(user, 'attendance')) return false;
  const value = roleFrom(roleOrUser);
  return value === 'admin' || value === 'super_admin' || value === 'hr' || value === 'operations';
}

export function shouldShowHomeTab(user?: RoleUserLike | null): boolean {
  if (!user) return false;
  if (!isCompanyModuleEnabled(user, 'attendance')) return false;
  if (isHomeReviewer(user)) return true;
  return isAttendanceTracked(user);
}

export function canAccessContentCalendar(user?: RoleUserLike | null): boolean {
  if (!user) return false;
  if (!isCompanyModuleEnabled(user, 'content_calendar')) return false;
  const flagged = moduleFlag(user, 'content_calendar');
  if (flagged !== undefined) return flagged;
  if (isAdmin(user.role)) return true;
  const cc = user.permissions?.summary?.content_calendar;
  if (cc != null) {
    return cc !== 'none';
  }
  return CONTENT_DEPTS.has(primaryDepartment(user));
}

export function canAccessWebsiteProjects(user?: RoleUserLike | null): boolean {
  if (!user) return false;
  if (!isCompanyModuleEnabled(user, 'website')) return false;
  const flagged = moduleFlag(user, 'website');
  if (flagged !== undefined) return flagged;
  if (isAdmin(user.role)) return true;
  const web = user.permissions?.summary?.website;
  if (web != null) {
    return web !== 'none';
  }
  return WEBSITE_DEPTS.has(primaryDepartment(user));
}

export const canAccessWebsitePipeline = canAccessWebsiteProjects;

export function canAccessAds(user?: RoleUserLike | null): boolean {
  if (!user) return false;
  if (!isCompanyModuleEnabled(user, 'ads')) return false;
  const flagged = moduleFlag(user, 'ads');
  if (flagged !== undefined) return flagged;
  if (isAdmin(user.role)) return true;
  return ADS_DEPTS.has(primaryDepartment(user));
}
