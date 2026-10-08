/**
 * Role display names for shell and user profile blocks (§8.3).
 * Keeps existing badgeStyles.getRoleLabel untouched for other callers.
 */
export function getRoleDisplayName(role?: string): string {
  if (!role) return 'Team member';
  switch (role.toLowerCase()) {
    case 'admin':
    case 'super administrator':
      return 'Admin';
    case 'hr':
    case 'hr manager':
      return 'HR';
    case 'operations':
    case 'operations lead':
      return 'Operations';
    case 'team_lead':
    case 'team lead':
      return 'Team lead';
    case 'team_member':
    case 'team member':
      return 'Team member';
    case 'client':
      return 'Client';
    default:
      return role;
  }
}
