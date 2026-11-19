import type { AdminMember } from '../types/admin';

export type CreateMemberResult = AdminMember | { created?: false; code?: string; message?: string } | null | undefined;

/**
 * True only when POST /admin/members actually returned a created member.
 * The API can answer 2xx without creating anyone (e.g. the neutral response for an
 * email that can't be used in this company), so a 2xx alone is never "success".
 */
export function isCreatedMember(res: CreateMemberResult): res is AdminMember {
  if (!res || typeof res !== 'object') return false;
  if ((res as { created?: unknown }).created === false) return false;
  const id = (res as { id?: unknown }).id;
  return typeof id === 'string' && id.trim().length > 0;
}

export const MEMBER_NOT_CREATED_FALLBACK =
  'No account was created. Check the details and try again, or use a different email address.';

/** Message to show when the create call returned without creating a member. */
export function notCreatedMessage(res: CreateMemberResult): string {
  const msg = res && typeof res === 'object' ? (res as { message?: unknown }).message : undefined;
  return typeof msg === 'string' && msg.trim() ? msg.trim() : MEMBER_NOT_CREATED_FALLBACK;
}
