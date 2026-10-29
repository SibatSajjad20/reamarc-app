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

/**
 * Exact host-slug match only (lowercase). Display names are NOT used —
 * long names like "DataViz Technologies" must not drive subdomains.
 */
export function companyMatchesHostSlug(
  company: { slug?: string | null } | null | undefined,
  hostSlug: string,
): boolean {
  const want = String(hostSlug || '').trim().toLowerCase();
  const slug = String(company?.slug || '').trim().toLowerCase();
  return Boolean(want && slug && slug === want);
}

/** Apex URL to send unknown company subdomains to (path/search/hash optional). */
export function unknownWorklaneSubdomainApexUrl(
  hostname: string | null | undefined,
  pathname = '/',
  search = '',
  hash = '',
): string | null {
  const slug = companySlugFromHost(hostname);
  if (!slug) return null;
  const path = pathname && pathname !== '/' ? pathname : '';
  return `https://${WORKLANE_BASE_DOMAIN}${path}${search || ''}${hash || ''}`;
}

/**
 * If this page is on `<slug>.oneworklane.com` and no company owns that slug,
 * redirect to apex (keeps path/search/hash). Fail-open on network/API errors.
 * www/api never enter this path (companySlugFromHost returns null).
 */
export async function redirectUnknownWorklaneSubdomain(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const slug = companySlugFromHost(window.location.hostname);
  if (!slug) return false;
  const apex = unknownWorklaneSubdomainApexUrl(
    window.location.hostname,
    window.location.pathname,
    window.location.search,
    window.location.hash,
  );
  if (!apex) return false;
  try {
    // Same-origin on Worklane (Vercel rewrite); omit credentials — public probe.
    const res = await fetchImpl(
      `/api/v1/public/company-slug-exists?slug=${encodeURIComponent(slug)}`,
      { method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { exists?: boolean };
    if (data && data.exists === false) {
      window.location.replace(apex);
      return true;
    }
  } catch {
    // fail open
  }
  return false;
}

/** Build https://<slug>.oneworklane.com + path (null if slug empty / reserved). */
export function companySubdomainUrl(
  companySlug: string | null | undefined,
  pathname = '/',
  search = '',
  hash = '',
): string | null {
  const slug = String(companySlug || '').trim().toLowerCase();
  if (!slug || RESERVED.has(slug) || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return null;
  }
  const path = pathname && pathname !== '/' ? pathname : '';
  return `https://${slug}.${WORKLANE_BASE_DOMAIN}${path}${search || ''}${hash || ''}`;
}

/**
 * On Worklane hosts only: if the active company has a slug and the browser is
 * not already on that subdomain, return the URL to navigate to (full page).
 * Apex → company subdomain after login; company switch → new subdomain.
 * No slug → null (stay on apex). Non-Worklane (vercel.app) → null.
 */
export function worklaneCompanyHostRedirectUrl(
  hostname: string | null | undefined,
  companySlug: string | null | undefined,
  pathname = '/',
  search = '',
  hash = '',
): string | null {
  if (!isWorklaneHost(hostname)) return null;
  const target = companySubdomainUrl(companySlug, pathname, search, hash);
  if (!target) return null; // no slug — stay put (apex or current)
  const current = companySlugFromHost(hostname);
  const want = String(companySlug || '').trim().toLowerCase();
  if (current && current === want) return null; // already on correct subdomain
  return target;
}

