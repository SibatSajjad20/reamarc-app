import type { WebsiteProject, WebsiteTask } from '../types/websiteProject';

export interface AccessUser {
  id?: string;
  role?: string;
  department?: string;
  departments?: string[];
  is_active?: boolean;
  permissions?: any;
}

function roleOf(value?: string | null): string {
  return (value || '').toLowerCase().trim();
}

const WEBSITE_LEVEL_RANK: Record<string, number> = {
  none: 0,
  view: 1,
  assigned: 2,
  manage: 3,
};

/**
 * Resolve the website pipeline level from /auth/me permissions.
 *
 * Current payload: modules.website is a boolean switch; levels/summary.website is the level string.
 * Older payloads used modules.website as { [department]: level }.
 */
export function websitePermissionLevel(user?: AccessUser | null): string {
  if (!user?.permissions) return 'none';

  const fromLevels = user.permissions.levels?.website ?? user.permissions.summary?.website;
  if (typeof fromLevels === 'string' && fromLevels) {
    return fromLevels;
  }

  const mod = user.permissions.modules?.website;
  if (typeof mod === 'object' && mod) {
    let best = 'none';
    for (const lvl of Object.values(mod)) {
      if (typeof lvl !== 'string') continue;
      if ((WEBSITE_LEVEL_RANK[lvl] ?? -1) > (WEBSITE_LEVEL_RANK[best] ?? -1)) {
        best = lvl;
      }
    }
    return best;
  }

  return 'none';
}

function websiteLevelGte(current: string, target: string): boolean {
  return (WEBSITE_LEVEL_RANK[current] ?? -1) >= (WEBSITE_LEVEL_RANK[target] ?? 0);
}

export function canAccessWebsitePipeline(user?: AccessUser | null): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user.role);
  if (role === 'admin' || role === 'superadmin') return true;
  if (role === 'client' || role === 'hr') return false;
  if (role === 'operations') return true;

  if (user.permissions) {
    if (websiteLevelGte(websitePermissionLevel(user), 'view')) return true;
    // Boolean module switch alone is not enough without a level; keep explicit none.
    return false;
  }

  return false;
}

export function canManageWebsiteProject(
  user?: AccessUser | null,
  project?: WebsiteProject | null,
): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user.role);
  if (role === 'admin' || role === 'superadmin') return true;
  if (role === 'client' || role === 'hr' || role === 'operations' || user.permissions?.view_only) return false;

  // Matches backend is_website_lead / can_manage_project: website level "manage".
  if (websiteLevelGte(websitePermissionLevel(user), 'manage')) {
    return true;
  }

  if (project && user.id && project.manager_id && String(user.id) === String(project.manager_id)) {
    return true;
  }
  return false;
}

/** Matches backend can_create_project: admin or website team lead with manage access. */
export function canCreateWebsiteProject(user?: AccessUser | null): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user.role);
  if (role === 'admin' || role === 'superadmin') return true;
  if (role === 'client' || role === 'hr' || role === 'operations' || user.permissions?.view_only) {
    return false;
  }
  if (role !== 'team_lead' && role !== 'lead') return false;
  return websiteLevelGte(websitePermissionLevel(user), 'manage');
}

export function canEditWebsiteTask(
  user?: AccessUser | null,
  project?: WebsiteProject | null,
  task?: WebsiteTask | null,
): boolean {
  if (!user || user.is_active === false) return false;
  if (roleOf(user.role) === 'operations' || user.permissions?.view_only) return false;
  if (canManageWebsiteProject(user, project)) return true;
  if (task && user.id && task.assignee_id && String(user.id) === String(task.assignee_id)) {
    return true;
  }
  return false;
}
