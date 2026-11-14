import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveAvatarUri } from './avatarUrl.ts';

describe('avatar urls', () => {
  it('returns null for empty values', () => {
    assert.equal(resolveAvatarUri(null), null);
    assert.equal(resolveAvatarUri('  '), null);
  });

  it('prefixes relative paths with the api host', () => {
    assert.equal(
      resolveAvatarUri('/uploads/a.webp', 40, 'https://api.example.com'),
      'https://api.example.com/uploads/a.webp',
    );
  });

  it('adds a face-crop transform for Cloudinary originals', () => {
    const src = 'https://res.cloudinary.com/da3i4l1st/image/upload/v1/avatars/u1.webp';
    assert.equal(
      resolveAvatarUri(src, 40),
      'https://res.cloudinary.com/da3i4l1st/image/upload/c_fill,g_face,w_80,h_80,f_auto,q_auto/v1/avatars/u1.webp',
    );
  });
});
