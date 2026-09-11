/** Shared department, role, and task-type badge classes. */

export const NEUTRAL_METADATA_BADGE_CLASS =
  'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700';

export function getDeptBadgeClass(_dept?: string): string {
  return NEUTRAL_METADATA_BADGE_CLASS;
}

export function getRoleBadgeClass(_role?: string): string {
  return NEUTRAL_METADATA_BADGE_CLASS;
}

export function getTaskTypeBadgeClass(_taskType?: string): string {
  return NEUTRAL_METADATA_BADGE_CLASS;
}

export function getRoleLabel(role?: string): string {
  if (role === 'admin') return 'Super Administrator';
  if (role === 'hr') return 'HR Manager';
  if (role === 'operations') return 'Operations Lead';
  if (role === 'team_lead') return 'Team Lead';
  if (role === 'client') return 'Client';
  return 'Team Member';
}

export function getInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.trim().substring(0, 2).toUpperCase();
  }
  return 'EM';
}
