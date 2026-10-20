const STAFF_ROLES = new Set(['team_member', 'member', 'team_lead']);

function normalizeRole(role?: string | null): string {
  const value = (role || 'team_member').trim().toLowerCase();
  if (value === 'member') return 'team_member';
  if (value === 'ops' || value === 'operation') return 'operations';
  return value || 'team_member';
}

export const OWN_ATTENDANCE_TOOLTIP = 'Your own attendance is changed by Admin';

export function canChangeAttendance(
  actorId: string | undefined,
  actorRole: string | undefined,
  targetUserId: string | undefined,
): boolean {
  if (!actorId || !targetUserId) return false;
  if (String(actorId) === String(targetUserId)) return false;
  const role = normalizeRole(actorRole);
  if (role === 'operations') return false;
  return role === 'hr' || role === 'admin';
}

export function canReviewAttendanceRequest(
  reviewerId: string | undefined,
  reviewerRole: string | undefined,
  request: { user_id?: string; user_role?: string },
): boolean {
  if (reviewerId && request.user_id && String(reviewerId) === String(request.user_id)) return false;
  const role = normalizeRole(reviewerRole);
  const applicant = normalizeRole(request.user_role);
  if (role === 'operations') return STAFF_ROLES.has(applicant);
  if (role === 'hr' || role === 'admin') {
    return STAFF_ROLES.has(applicant) || ['hr', 'operations', 'admin', 'client'].includes(applicant);
  }
  return false;
}
