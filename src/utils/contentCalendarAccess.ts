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

function departmentOf(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canAccessContentCalendar(user?: {
  role?: string;
  department?: string;
  is_active?: boolean;
} | null): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user.role);
  if (role === 'admin') return true;
  return TEAM_ROLES.has(role) && ALLOWED_DEPARTMENTS.has(departmentOf(user.department));
}
