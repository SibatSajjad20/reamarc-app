import { describe, expect, it } from 'vitest';
import { canReviewLeaveRequest } from './leaveRequestAccess';

describe('canReviewLeaveRequest', () => {
  const opsId = 'ops-1';
  const hrId = 'hr-1';

  it('lets Operations review team member and team lead requests', () => {
    expect(canReviewLeaveRequest(opsId, 'operations', { user_id: 'tm-1', user_role: 'team_member' })).toBe(true);
    expect(canReviewLeaveRequest(opsId, 'operations', { user_id: 'tl-1', user_role: 'team_lead' })).toBe(true);
  });

  it('blocks Operations from reviewing their own or HR requests', () => {
    expect(canReviewLeaveRequest(opsId, 'operations', { user_id: opsId, user_role: 'operations' })).toBe(false);
    expect(canReviewLeaveRequest(opsId, 'operations', { user_id: 'hr-1', user_role: 'hr' })).toBe(false);
  });

  it('lets HR review Operations but not their own request', () => {
    expect(canReviewLeaveRequest(hrId, 'hr', { user_id: 'ops-1', user_role: 'operations' })).toBe(true);
    expect(canReviewLeaveRequest(hrId, 'hr', { user_id: hrId, user_role: 'hr' })).toBe(false);
  });
});
