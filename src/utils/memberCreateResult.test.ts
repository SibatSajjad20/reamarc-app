import { describe, expect, it } from 'vitest';
import { isCreatedMember, MEMBER_NOT_CREATED_FALLBACK, notCreatedMessage } from './memberCreateResult';

describe('isCreatedMember', () => {
  it('is true only for a returned member with an id', () => {
    expect(isCreatedMember({ id: 'usr_1', full_name: 'A', email: 'a@x.com' } as any)).toBe(true);
  });

  it('is false for the neutral not-created response', () => {
    const res = { created: false as const, code: 'MEMBER_NOT_CREATED', message: 'No account was created.' };
    expect(isCreatedMember(res)).toBe(false);
    expect(notCreatedMessage(res)).toBe('No account was created.');
  });

  it('is false for the legacy message-only response, empty bodies, and blank ids', () => {
    expect(isCreatedMember({ message: "If this person can be added, they'll get an email" } as any)).toBe(false);
    expect(isCreatedMember(undefined)).toBe(false);
    expect(isCreatedMember(null)).toBe(false);
    expect(isCreatedMember({ id: '' } as any)).toBe(false);
    expect(notCreatedMessage(undefined)).toBe(MEMBER_NOT_CREATED_FALLBACK);
  });
});
