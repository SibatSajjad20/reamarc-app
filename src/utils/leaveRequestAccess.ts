import type { UserRole } from '../types/auth';
import type { AttendanceRequest } from '../types/attendance';

const STAFF_ROLES = new Set(['team_member', 'member', 'team_lead']);

const REVIEWABLE_BY_ROLE: Record<string, Set<string>> = {
  hr: new Set(STAFF_ROLES),
  operations: new Set(STAFF_ROLES),
  admin: new Set([...STAFF_ROLES, 'hr', 'operations', 'admin', 'client']),
};

function normalizeRole(role?: string | null): string {
  const value = (role || 'team_member').trim().toLowerCase();
  return value === 'member' ? 'team_member' : value || 'team_member';
}

export function canReviewLeaveRequest(
  reviewerId: string | undefined,
  reviewerRole: UserRole | string | undefined,
  request: Pick<AttendanceRequest, 'user_id' | 'user_role'>,
): boolean {
  if (reviewerId && request.user_id && reviewerId === request.user_id) return false;
  const allowed = REVIEWABLE_BY_ROLE[normalizeRole(reviewerRole)];
  if (!allowed) return false;
  return allowed.has(normalizeRole(request.user_role));
}

export function canEditLeaveStatus(
  actorId: string | undefined,
  actorRole: UserRole | string | undefined,
  request: Pick<AttendanceRequest, 'user_id' | 'user_role'>,
): boolean {
  return canReviewLeaveRequest(actorId, actorRole, request);
}

export function canDeleteLeaveRequest(
  actorId: string | undefined,
  actorRole: UserRole | string | undefined,
  request: Pick<AttendanceRequest, 'user_id' | 'status'>,
): boolean {
  if ((request.status || '').toLowerCase() !== 'pending') return false;
  if (normalizeRole(actorRole) === 'admin') return true;
  return Boolean(actorId && request.user_id && actorId === request.user_id);
}

export function reviewScopeHint(
  reviewerId: string | undefined,
  reviewerRole: UserRole | string | undefined,
  request: Pick<AttendanceRequest, 'user_id' | 'user_role'>,
): string | null {
  if (reviewerId && request.user_id && reviewerId === request.user_id) {
    return 'Your request — awaiting Admin / Reviewer';
  }
  const role = normalizeRole(reviewerRole);
  const applicant = normalizeRole(request.user_role);
  if (role === 'hr' && (applicant === 'hr' || applicant === 'operations' || applicant === 'admin')) {
    return 'Needs Admin review';
  }
  if (role === 'operations' && (applicant === 'hr' || applicant === 'operations' || applicant === 'admin')) {
    return 'Needs Admin review';
  }
  return null;
}
