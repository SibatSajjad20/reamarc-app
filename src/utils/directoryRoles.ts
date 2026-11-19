import type { UserRole } from '../types/auth';

export const DIRECTORY_ROLES: { id: UserRole; label: string; description: string }[] = [
  { id: 'team_member', label: 'Team member', description: 'Records own tasks and daily logs' },
  { id: 'team_lead', label: 'Team lead', description: 'Leads a department and reviews team logs' },
  { id: 'hr', label: 'HR', description: 'All departments, logs and compliance' },
  { id: 'operations', label: 'Operations', description: 'Company-wide view-only access, plus won-deal and HR approvals' },
  { id: 'client', label: 'Client', description: 'Client portal and approvals only' },
];

/** Roles HR may create or assign. HR never creates HR, Operations, or Admin. */
export const HR_ASSIGNABLE_ROLES: readonly UserRole[] = ['team_member', 'team_lead', 'client'];

/**
 * Roles that can be assigned from Team directory.
 * - Admin is never offered.
 * - HR only gets Team member, Team lead (and Client when requested).
 * - Operations is Admin-only.
 */
export function assignableDirectoryRoles(
  actorRole?: UserRole | string | null,
  opts?: { includeClient?: boolean },
): typeof DIRECTORY_ROLES {
  const includeClient = Boolean(opts?.includeClient);
  const actor = String(actorRole || '').toLowerCase();
  return DIRECTORY_ROLES.filter((r) => {
    if (r.id === 'admin') return false;
    if (r.id === 'client' && !includeClient) return false;
    if (actor === 'hr' && !HR_ASSIGNABLE_ROLES.includes(r.id)) return false;
    if (r.id === 'operations' && actor !== 'admin') return false;
    return true;
  });
}
