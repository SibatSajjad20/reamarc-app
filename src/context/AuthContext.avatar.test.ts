import { describe, expect, it } from 'vitest';
import { keepAvatarUrl } from './AuthContext';

const loginUser = {
  id: 'u1',
  email: 'a@t.test',
  name: 'Ada',
  role: 'team_member' as const,
  avatar_url: 'https://res.cloudinary.com/da3i4l1st/image/upload/v1/avatars/u1.webp',
};

describe('keepAvatarUrl', () => {
  it('keeps the previous avatar_url when getMe omits the field', () => {
    const fromMe = { ...loginUser };
    delete (fromMe as { avatar_url?: string | null }).avatar_url;
    expect(fromMe.avatar_url).toBeUndefined();
    expect(keepAvatarUrl(loginUser, fromMe).avatar_url).toBe(loginUser.avatar_url);
  });

  it('does not keep the previous avatar_url when getMe returns null', () => {
    const fromMe = { ...loginUser, avatar_url: null };
    expect(keepAvatarUrl(loginUser, fromMe).avatar_url).toBeNull();
  });

  it('uses the getMe avatar_url when it is present', () => {
    const nextUrl = 'https://res.cloudinary.com/da3i4l1st/image/upload/v2/avatars/u1.webp';
    const fromMe = { ...loginUser, avatar_url: nextUrl };
    expect(keepAvatarUrl(loginUser, fromMe).avatar_url).toBe(nextUrl);
  });
});
