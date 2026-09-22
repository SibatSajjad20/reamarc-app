import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chunkUtf8,
  decideStartupSession,
  joinChunks,
  parseCachedUser,
  userFromAccessToken,
  type CachedAuthUser,
} from './sessionCodec.ts';

function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${body}.sig`;
}

const cached: CachedAuthUser = {
  id: 'user-1',
  email: 'a@reamarc.com',
  name: 'Ayesha',
  role: 'team_member',
};

describe('session persistence policy', () => {
  it('restores a cached user when revalidation cannot reach the server', () => {
    const decision = decideStartupSession({
      accessToken: 'token',
      cachedUser: cached,
      revalidateError: 'transient',
    });
    assert.equal(decision.keepTokens, true);
    assert.deepEqual(decision.user, cached);
  });

  it('restores identity from the access token when no profile cache exists', () => {
    const token = jwt({ sub: 'user-1', email: 'a@reamarc.com', name: 'Ayesha', role: 'hr', type: 'access' });
    const decision = decideStartupSession({
      accessToken: token,
      cachedUser: null,
      revalidateError: 'transient',
    });
    assert.equal(decision.keepTokens, true);
    assert.equal(decision.user?.email, 'a@reamarc.com');
    assert.equal(decision.user?.role, 'hr');
  });

  it('drops the session only when the server rejects it', () => {
    const decision = decideStartupSession({
      accessToken: 'token',
      cachedUser: cached,
      revalidateError: 'auth',
    });
    assert.equal(decision.keepTokens, false);
    assert.equal(decision.user, null);
  });

  it('keeps the server profile after a successful revalidation', () => {
    const server = { ...cached, name: 'Ayesha Khan' };
    const decision = decideStartupSession({
      accessToken: 'token',
      cachedUser: cached,
      revalidateError: 'none',
      serverUser: server,
    });
    assert.equal(decision.keepTokens, true);
    assert.equal(decision.user?.name, 'Ayesha Khan');
  });

  it('stays signed out when nothing was stored', () => {
    const decision = decideStartupSession({
      accessToken: null,
      cachedUser: null,
      revalidateError: 'transient',
    });
    assert.equal(decision.keepTokens, true);
    assert.equal(decision.user, null);
  });
});

describe('token chunking', () => {
  it('round-trips a value larger than one secure-store slot, including multibyte characters', () => {
    const value = `${'a'.repeat(2500)}نام${'b'.repeat(800)}`;
    const parts = chunkUtf8(value, 1200);
    assert.ok(parts.length > 1);
    for (const part of parts) {
      assert.ok(Buffer.byteLength(part, 'utf8') <= 1200);
    }
    assert.equal(joinChunks(parts), value);
  });
});

describe('cached profile', () => {
  it('reads a stored profile and ignores a broken payload', () => {
    assert.equal(parseCachedUser(JSON.stringify(cached))?.id, 'user-1');
    assert.equal(parseCachedUser('{'), null);
    assert.equal(parseCachedUser(JSON.stringify({ email: 'a@reamarc.com' })), null);
  });

  it('ignores a token that is not an access token', () => {
    assert.equal(userFromAccessToken('not-a-jwt'), null);
    assert.equal(userFromAccessToken(jwt({ sub: 'u', email: 'a@reamarc.com', type: 'refresh' })), null);
  });
});
