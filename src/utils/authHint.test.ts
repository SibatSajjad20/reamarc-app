import { describe, expect, it } from 'vitest';
import { readAuthHint } from './authHint';

describe('readAuthHint', () => {
  it('is null when the cookie is missing', () => {
    expect(readAuthHint('')).toBeNull();
    expect(readAuthHint('other=1; foo=bar')).toBeNull();
  });
  it('reads signed in / signed out', () => {
    expect(readAuthHint('a=b; wl_auth_hint=1')).toBe('signed-in');
    expect(readAuthHint('wl_auth_hint=0; a=b')).toBe('signed-out');
  });
  it('any signed-in copy wins over a stale signed-out copy', () => {
    expect(readAuthHint('wl_auth_hint=0; wl_auth_hint=1')).toBe('signed-in');
  });
  it('ignores look-alike names and junk values', () => {
    expect(readAuthHint('xwl_auth_hint=0; wl_auth_hint_x=0')).toBeNull();
    expect(readAuthHint('wl_auth_hint=maybe')).toBeNull();
  });
});
