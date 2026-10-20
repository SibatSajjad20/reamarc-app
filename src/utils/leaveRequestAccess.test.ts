import { describe, it } from 'vitest';
import { canReviewLeaveRequest } from './leaveRequestAccess';

describe('leaveRequestAccess', () => {
  it('runs leaveRequestAccess test suite', () => {

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const opsId = 'ops-1';

assert(
  canReviewLeaveRequest(opsId, 'operations', { user_id: 'tm-1', user_role: 'team_member' }),
  'Operations must be able to review a team member request',
);
assert(
  canReviewLeaveRequest(opsId, 'operations', { user_id: 'tl-1', user_role: 'team_lead' }),
  'Operations must be able to review a team lead request',
);
assert(
  !canReviewLeaveRequest(opsId, 'operations', { user_id: opsId, user_role: 'operations' }),
  'Operations must NOT review their own request',
);
assert(
  !canReviewLeaveRequest(opsId, 'operations', { user_id: 'hr-1', user_role: 'hr' }),
  'Operations must NOT review an HR request',
);

console.log('All leaveRequestAccess tests passed successfully!');
  });
});
