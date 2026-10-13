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

export function canAccessWebsitePipeline(user?: AccessUser | null): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user.role);
  if (role === 'admin' || role === 'superadmin') return true;
  if (role === 'client' || role === 'hr' || role === 'operations') return false;

  if (user.permissions) {
    const summary = user.permissions.summary?.website;
    if (summary && summary !== 'none') return true;
    const mod = user.permissions.modules?.website;
    if (mod && Object.values(mod).some((lvl) => lvl && lvl !== 'none')) {
      return true;
    }
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
  if (role === 'client' || role === 'hr' || role === 'operations') return false;

  if (user.permissions?.modules?.website) {
    const mod = user.permissions.modules.website;
    if (Object.values(mod).some((lvl) => lvl === 'manage')) {
      return true;
    }
  }

  if (project && user.id && project.manager_id && String(user.id) === String(project.manager_id)) {
    return true;
  }
  return false;
}

export function canEditWebsiteTask(
  user?: AccessUser | null,
  project?: WebsiteProject | null,
  task?: WebsiteTask | null,
): boolean {
  if (!user || user.is_active === false) return false;
  if (canManageWebsiteProject(user, project)) return true;
  if (task && user.id && task.assignee_id && String(user.id) === String(task.assignee_id)) {
    return true;
  }
  return false;
}
