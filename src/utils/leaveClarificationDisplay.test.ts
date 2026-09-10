import {
  isClarifiedPending,
  requestActivityAt,
  requestReasonPreview,
} from './leaveClarificationDisplay';
import type { AttendanceRequest } from '../types/attendance';

const base = {
  id: 'leave_1',
  user_id: 'u1',
  user_name: 'Hikmat Ullah',
  department: 'Software Development',
  request_type: 'regularization',
  start_date: '2026-09-01',
  end_date: '2026-09-01',
  reason: 't',
  status: 'pending',
  created_at: '2026-09-02T10:27:00+00:00',
} as AttendanceRequest;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const waiting: AttendanceRequest = {
  ...base,
  status: 'needs_info',
  clarification_prompt: 'reason not clear',
};

const replied: AttendanceRequest = {
  ...base,
  status: 'pending',
  clarification_prompt: 'reason not clear',
  clarification_response: 'i missed that, in start i did not really followed',
  clarification_submitted_at: '2026-09-09T08:34:00+00:00',
  updated_at: '2026-09-09T08:34:00+00:00',
};

const staleReplyWhileWaiting: AttendanceRequest = {
  ...base,
  status: 'needs_info',
  clarification_prompt: 'please add more detail',
  clarification_response: 'old reply that should not win the list',
};

assert(!isClarifiedPending(waiting), 'needs_info is not clarified-pending');
assert(isClarifiedPending(replied), 'pending + reply is clarified-pending');
assert(!isClarifiedPending(staleReplyWhileWaiting), 'stale reply during needs_info is not clarified');

assert(requestReasonPreview(waiting) === 't', 'waiting list shows original reason');
assert(
  requestReasonPreview(replied) === 'i missed that, in start i did not really followed',
  'replied list shows the new reason',
);
assert(
  requestReasonPreview(staleReplyWhileWaiting) === 't',
  'second ask-info still shows original reason on the list',
);

const olderPending: AttendanceRequest = {
  ...base,
  id: 'leave_old',
  created_at: '2026-09-01T09:00:00+00:00',
};
assert(
  requestActivityAt(replied) > requestActivityAt(olderPending),
  'clarified request sorts above an older untouched pending request',
);

const sorted = [olderPending, replied, waiting].sort((a, b) =>
  requestActivityAt(b).localeCompare(requestActivityAt(a)),
);
assert(sorted[0].id === 'leave_1', 'clarified request is first after activity sort');

console.log('leaveClarificationDisplay tests passed');
