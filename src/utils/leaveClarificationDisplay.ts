import type { AttendanceRequest } from '../types/attendance';

export function isClarifiedPending(
  req: Pick<AttendanceRequest, 'status' | 'clarification_response'>,
): boolean {
  return req.status === 'pending' && Boolean(req.clarification_response?.trim());
}

export function requestActivityAt(req: AttendanceRequest): string {
  return req.clarification_submitted_at || req.updated_at || req.created_at || '';
}

export function requestReasonPreview(req: AttendanceRequest): string {
  return isClarifiedPending(req) ? String(req.clarification_response).trim() : req.reason;
}
