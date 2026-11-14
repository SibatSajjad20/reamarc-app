import type { UserRole } from '../types/auth';

export const DIRECTORY_ROLES: { id: UserRole; label: string; description: string }[] = [
  { id: 'team_member', label: 'Team member', description: 'Records own tasks and daily logs' },
  { id: 'team_lead', label: 'Team lead', description: 'Leads a department and reviews team logs' },
  { id: 'hr', label: 'HR', description: 'All departments, logs and compliance' },
  { id: 'operations', label: 'Operations', description: 'Company-wide view-only access, plus won-deal and HR approvals' },
  { id: 'client', label: 'Client', description: 'Client portal and approvals only' },
];

/** Roles that can be assigned from Team directory. Admin is never offered. */
export function assignableDirectoryRoles(
  actorRole?: UserRole | string | null,
  opts?: { includeClient?: boolean },
): typeof DIRECTORY_ROLES {
  const includeClient = Boolean(opts?.includeClient);
  return DIRECTORY_ROLES.filter((r) => {
    if (r.id === 'admin') return false;
    if (r.id === 'client' && !includeClient) return false;
    if (r.id === 'operations' && actorRole !== 'admin') return false;
    return true;
  });
}
