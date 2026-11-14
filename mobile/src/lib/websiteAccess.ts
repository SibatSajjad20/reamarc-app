import type { RoleUserLike } from './roles.ts';
import { normalizeRole } from './roles.ts';

const LEVEL_RANK: Record<string, number> = {
  none: 0,
  view: 1,
  assigned: 2,
  manage: 3,
};

function websitePermissionLevel(user?: RoleUserLike | null): string {
  if (!user?.permissions) return 'none';
  const fromLevels = user.permissions.levels?.website ?? user.permissions.summary?.website;
  if (typeof fromLevels === 'string' && fromLevels) return fromLevels;
  const mod = user.permissions.modules?.website;
  if (typeof mod === 'object' && mod) {
    let best = 'none';
    for (const lvl of Object.values(mod as Record<string, unknown>)) {
      if (typeof lvl !== 'string') continue;
      if ((LEVEL_RANK[lvl] ?? -1) > (LEVEL_RANK[best] ?? -1)) best = lvl;
    }
    return best;
  }
  return 'none';
}

function levelGte(current: string, target: string): boolean {
  return (LEVEL_RANK[current] ?? -1) >= (LEVEL_RANK[target] ?? 0);
}

export type WebsiteProjectLike = { id?: string; manager_id?: string | null };
export type WebsiteTaskLike = { assignee_id?: string | null };

export function canManageWebsiteProject(
  user?: RoleUserLike | null,
  project?: WebsiteProjectLike | null,
): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (role === 'admin' || role === 'super_admin' || role === 'superadmin') return true;
  if (role === 'client' || role === 'hr' || role === 'operations' || user.permissions?.view_only) {
    return false;
  }
  if (levelGte(websitePermissionLevel(user), 'manage')) return true;
  if (project && user.id && project.manager_id && String(user.id) === String(project.manager_id)) {
    return true;
  }
  return false;
}

export function canEditWebsiteTask(
  user?: RoleUserLike | null,
  project?: WebsiteProjectLike | null,
  task?: WebsiteTaskLike | null,
): boolean {
  if (!user) return false;
  if (normalizeRole(user.role) === 'operations' || user.permissions?.view_only) return false;
  if (canManageWebsiteProject(user, project)) return true;
  if (task && user.id && task.assignee_id && String(user.id) === String(task.assignee_id)) {
    return true;
  }
  return false;
}
