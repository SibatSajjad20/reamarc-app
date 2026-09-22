/** Plain session helpers. No native modules so the keep-or-wipe rules can be tested. */

export type CachedAuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  department?: string | null;
  designation?: string | null;
  crm_enabled?: boolean | null;
};

export type RevalidateError = 'none' | 'auth' | 'transient';

const MAX_CHUNK_BYTES = 1200;

function utf8Size(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code <= 0x7f) return 1;
  if (code <= 0x7ff) return 2;
  if (code <= 0xffff) return 3;
  return 4;
}

/** Split a string so each piece stays under the platform secure-storage size limit. */
export function chunkUtf8(value: string, maxBytes: number = MAX_CHUNK_BYTES): string[] {
  if (!value) return [];
  const limit = Math.max(4, maxBytes);
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of value) {
    const size = utf8Size(char);
    if (current && bytes + size > limit) {
      parts.push(current);
      current = char;
      bytes = size;
    } else {
      current += char;
      bytes += size;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function joinChunks(parts: readonly string[]): string {
  return parts.join('');
}

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = globalThis.atob(normalized + pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function userFromAccessToken(token: string | null | undefined): CachedAuthUser | null {
  if (!token || typeof token !== 'string') return null;
  const segment = token.split('.')[1];
  if (!segment) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(segment)) as Record<string, unknown>;
    if (payload.type && payload.type !== 'access') return null;
    const id = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!id || !email) return null;
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name : email;
    const role = typeof payload.role === 'string' && payload.role.trim() ? payload.role : 'team_member';
    return { id, email, name, role };
  } catch {
    return null;
  }
}

export function parseCachedUser(raw: string | null | undefined): CachedAuthUser | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const id = typeof data.id === 'string' ? data.id : '';
    const email = typeof data.email === 'string' ? data.email : '';
    if (!id || !email) return null;
    const name = typeof data.name === 'string' && data.name.trim() ? data.name : email;
    const role = typeof data.role === 'string' && data.role.trim() ? data.role : 'team_member';
    return {
      id,
      email,
      name,
      role,
      department: typeof data.department === 'string' ? data.department : null,
      designation: typeof data.designation === 'string' ? data.designation : null,
      crm_enabled: typeof data.crm_enabled === 'boolean' ? data.crm_enabled : null,
    };
  } catch {
    return null;
  }
}

/**
 * Cold start must not drop a saved login because the network or keychain blipped.
 * Tokens are removed only when the server rejects the session.
 */
export function decideStartupSession(args: {
  accessToken: string | null;
  cachedUser: CachedAuthUser | null;
  revalidateError: RevalidateError;
  serverUser?: CachedAuthUser | null;
}): { keepTokens: boolean; user: CachedAuthUser | null } {
  if (!args.accessToken) return { keepTokens: true, user: null };
  if (args.revalidateError === 'auth') return { keepTokens: false, user: null };
  if (args.revalidateError === 'none' && args.serverUser) {
    return { keepTokens: true, user: args.serverUser };
  }
  return {
    keepTokens: true,
    user: args.cachedUser ?? userFromAccessToken(args.accessToken),
  };
}
