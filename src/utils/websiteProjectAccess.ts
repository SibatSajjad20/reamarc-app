import type { WebsiteProject, WebsiteTask } from '../types/websiteProject';

const ALLOWED_DEPARTMENTS = new Set([
  'website',
  'web development',
  'software development',
  'software',
  'content',
  'creative',
  'design',
  'content and creative',
  'content & creative',
]);

const WEBSITE_LEAD_DEPARTMENTS = new Set([
  'website',
  'web development',
  'software development',
  'software',
]);

export interface AccessUser {
  id?: string;
  role?: string;
  department?: string;
  departments?: string[];
  is_active?: boolean;
}

function roleOf(value?: string | null): string {
  return (value || '').toLowerCase().trim();
}

export function parseUserDepartments(user?: AccessUser | null): string[] {
  if (!user) return [];
  const rawList: string[] = [];
  if (Array.isArray(user.departments)) {
    rawList.push(...user.departments);
  }
  if (typeof user.department === 'string' && user.department) {
    const split = user.department
      .split(/[,;/]|\band\b|&/i)
      .map((s) => s.trim())
      .filter(Boolean);
    rawList.push(...split);
  }
  const normalized = new Set<string>();
  for (const item of rawList) {
    const cleaned = item.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned) {
      normalized.add(cleaned);
      if (cleaned === 'content and creative' || cleaned === 'content & creative') {
        normalized.add('content');
        normalized.add('creative');
      }
    }
  }
  return Array.from(normalized);
}

export function canAccessWebsitePipeline(user?: AccessUser | null): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user.role);
  if (role === 'admin' || role === 'superadmin' || role === 'operations') return true;
  if (role === 'client') return false;
  const depts = parseUserDepartments(user);
  if ((role === 'team_lead' || role === 'lead') && depts.some((d) => WEBSITE_LEAD_DEPARTMENTS.has(d))) {
    return true;
  }
  return depts.some((d) => ALLOWED_DEPARTMENTS.has(d));
}

export function canManageWebsiteProject(
  user?: AccessUser | null,
  project?: WebsiteProject | null,
): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user.role);
  if (role === 'admin' || role === 'superadmin' || role === 'operations') return true;
  if (role === 'team_lead' || role === 'lead') {
    const depts = parseUserDepartments(user);
    if (depts.some((d) => WEBSITE_LEAD_DEPARTMENTS.has(d))) return true;
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
