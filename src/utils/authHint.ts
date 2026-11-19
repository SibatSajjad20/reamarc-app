/**
 * Non-secret "signed in / signed out" hint, set by the server next to the
 * HttpOnly session cookies (see backend auth `_set_auth_cookies`). It never
 * grants anything: it only lets the app skip a refresh round trip that is
 * certain to fail after an explicit sign-out, and preload the login screen.
 */
export const AUTH_HINT_COOKIE = 'wl_auth_hint';

export type AuthHint = 'signed-in' | 'signed-out' | null;

export function readAuthHint(cookieString?: string): AuthHint {
  const raw = cookieString ?? (typeof document !== 'undefined' ? document.cookie : '');
  if (!raw) return null;
  let sawOut = false;
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== AUTH_HINT_COOKIE) continue;
    const value = rest.join('=').trim();
    // Any "1" (e.g. a Domain cookie next to an old host-only one) means signed in.
    if (value === '1') return 'signed-in';
    if (value === '0') sawOut = true;
  }
  return sawOut ? 'signed-out' : null;
}
