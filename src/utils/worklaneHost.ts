/** Worklane (oneworklane.com) host helpers. Strict — no lookalike domains. */

export const WORKLANE_BASE_DOMAIN = 'oneworklane.com';
export const WORKLANE_API_ORIGIN = 'https://api.oneworklane.com';
export const WORKLANE_API_BASE = `${WORKLANE_API_ORIGIN}/api/v1`;

const RESERVED = new Set([
  'www', 'api', 'app', 'mail', 'ftp', 'cdn', 'static', 'admin',
  'status', 'docs', 'support', 'help', 'blog', 'shop',
]);

/** True for oneworklane.com and any single-label *.oneworklane.com host. */
export function isWorklaneHost(hostname: string | null | undefined): boolean {
  const h = String(hostname || '').split(':')[0].trim().toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (h === WORKLANE_BASE_DOMAIN) return true;
  if (!h.endsWith(`.${WORKLANE_BASE_DOMAIN}`)) return false;
  const rest = h.slice(0, -(WORKLANE_BASE_DOMAIN.length + 1));
  return Boolean(rest) && !rest.includes('.');
}

/**
 * Company slug from `<slug>.oneworklane.com`.
 * Null for apex, www, api, reserved labels, multi-label hosts, or non-Worklane hosts.
 */
export function companySlugFromHost(hostname: string | null | undefined): string | null {
  const h = String(hostname || '').split(':')[0].trim().toLowerCase().replace(/\.$/, '');
  if (!h || h === WORKLANE_BASE_DOMAIN) return null;
  const suffix = `.${WORKLANE_BASE_DOMAIN}`;
  if (!h.endsWith(suffix)) return null;
  const rest = h.slice(0, -suffix.length);
  if (!rest || rest.includes('.')) return null;
  if (RESERVED.has(rest)) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(rest)) return null;
  return rest;
}

/** Canonical browser origin for shareable app links (booking, review). */
export function publicAppOrigin(hostname?: string | null): string {
  const host =
    hostname ??
    (typeof window !== 'undefined' ? window.location.hostname : '');
  if (isWorklaneHost(host)) {
    return `https://${WORKLANE_BASE_DOMAIN}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return `https://${WORKLANE_BASE_DOMAIN}`;
}

/**
 * Origin used for public API paths (invoice JSON/PDF). On Worklane this is the
 * API subdomain so links work from any company host; elsewhere same-origin.
 */
export function publicApiOrigin(hostname?: string | null): string {
  const host =
    hostname ??
    (typeof window !== 'undefined' ? window.location.hostname : '');
  if (isWorklaneHost(host)) {
    return WORKLANE_API_ORIGIN;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return WORKLANE_API_ORIGIN;
}

/** Absolute public invoice URL (API JSON/PDF entry). */
export function publicInvoiceUrl(shareToken: string, hostname?: string | null): string {
  const token = String(shareToken || '').trim();
  return `${publicApiOrigin(hostname)}/api/v1/finance/public/invoice/${encodeURIComponent(token)}`;
}

