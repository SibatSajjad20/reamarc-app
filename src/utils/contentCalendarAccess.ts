const TEAM_ROLES = new Set(['team_lead', 'team_member', 'member']);
const ALLOWED_DEPARTMENTS = new Set([
  'performance marketing',
  'content',
  'creative',
  'content and creative',
  'content & creative',
  'social media',
]);

function roleOf(value?: string | null): string {
  return (value || '').toLowerCase().trim();
}

export interface AccessUser {
  role?: string;
  department?: string;
  departments?: string[];
  is_active?: boolean;
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

export function canAccessContentCalendar(user?: AccessUser | null): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user.role);
  if (role === 'admin' || role === 'superadmin') return true;
  if (!TEAM_ROLES.has(role)) return false;
  const depts = parseUserDepartments(user);
  return depts.some((d) => ALLOWED_DEPARTMENTS.has(d));
}
