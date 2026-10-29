import { useEffect, useState } from 'react';
import { companySlugFromHost, isWorklaneHost } from '../utils/worklaneHost';

export const PLATFORM_LOGIN_BRAND = {
  displayName: 'Reamarc',
  logoUrl: null as string | null,
  accentColor: '#4F46E5',
} as const;

export type HostLoginBrandingState =
  | { status: 'platform'; displayName: string; logoUrl: string | null; accentColor: string }
  | { status: 'loading'; displayName: null; logoUrl: null; accentColor: null }
  | { status: 'company'; displayName: string; logoUrl: string | null; accentColor: string }
  | { status: 'fallback'; displayName: string; logoUrl: null; accentColor: string };

export type PublicCompanyBrandingResponse = {
  exists: boolean;
  display_name?: string | null;
  logo_url?: string | null;
  accent_color?: string | null;
};

/** Whether this host should load tenant login branding (company subdomain only). */
export function shouldLoadHostLoginBranding(hostname: string | null | undefined): boolean {
  return Boolean(isWorklaneHost(hostname) && companySlugFromHost(hostname));
}

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Apex + vercel.app → platform Reamarc branding immediately.
 * `<slug>.oneworklane.com` → loading skeleton, then company branding (never flash Reamarc).
 */
export function useHostLoginBranding(
  hostname: string | null | undefined = typeof window !== 'undefined' ? window.location.hostname : null,
  fetchImpl: typeof fetch = fetch,
): HostLoginBrandingState {
  const slug = companySlugFromHost(hostname);
  const needsTenant = Boolean(isWorklaneHost(hostname) && slug);

  const [state, setState] = useState<HostLoginBrandingState>(() =>
    needsTenant
      ? { status: 'loading', displayName: null, logoUrl: null, accentColor: null }
      : {
          status: 'platform',
          displayName: PLATFORM_LOGIN_BRAND.displayName,
          logoUrl: PLATFORM_LOGIN_BRAND.logoUrl,
          accentColor: PLATFORM_LOGIN_BRAND.accentColor,
        },
  );

  useEffect(() => {
    if (!needsTenant || !slug) {
      setState({
        status: 'platform',
        displayName: PLATFORM_LOGIN_BRAND.displayName,
        logoUrl: PLATFORM_LOGIN_BRAND.logoUrl,
        accentColor: PLATFORM_LOGIN_BRAND.accentColor,
      });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', displayName: null, logoUrl: null, accentColor: null });

    void (async () => {
      try {
        const res = await fetchImpl(
          `/api/v1/public/company-branding?slug=${encodeURIComponent(slug)}`,
          { method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' } },
        );
        if (!res.ok) throw new Error(`branding ${res.status}`);
        const data = (await res.json()) as PublicCompanyBrandingResponse;
        if (cancelled) return;
        if (!data.exists) {
          // Unknown slug — main.tsx also redirects; stay neutral with slug label.
          setState({
            status: 'fallback',
            displayName: titleCaseSlug(slug),
            logoUrl: null,
            accentColor: PLATFORM_LOGIN_BRAND.accentColor,
          });
          return;
        }
        setState({
          status: 'company',
          displayName: (data.display_name || titleCaseSlug(slug)).trim() || titleCaseSlug(slug),
          logoUrl: data.logo_url || null,
          accentColor: data.accent_color || PLATFORM_LOGIN_BRAND.accentColor,
        });
      } catch {
        if (cancelled) return;
        // Never flash Reamarc on a company subdomain.
        setState({
          status: 'fallback',
          displayName: titleCaseSlug(slug),
          logoUrl: null,
          accentColor: PLATFORM_LOGIN_BRAND.accentColor,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [needsTenant, slug, fetchImpl]);

  return state;
}

/** Apply document title + favicon for the login surface. */
export function applyLoginDocumentBrand(opts: {
  displayName: string | null;
  logoUrl: string | null;
  loading?: boolean;
}): () => void {
  if (typeof document === 'undefined') return () => {};
  const prevTitle = document.title;
  const iconLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>("link[rel*='icon'], link[rel='apple-touch-icon']"),
  );
  const prevHrefs = iconLinks.map((el) => el.href);

  if (opts.loading || !opts.displayName) {
    document.title = 'Sign in';
  } else {
    document.title = `Sign in · ${opts.displayName}`;
  }

  if (opts.logoUrl && !opts.loading) {
    iconLinks.forEach((el) => {
      el.href = opts.logoUrl!;
    });
    // Ensure at least one icon link exists
    if (iconLinks.length === 0) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = opts.logoUrl;
      document.head.appendChild(link);
    }
  }

  return () => {
    document.title = prevTitle;
    iconLinks.forEach((el, i) => {
      if (prevHrefs[i]) el.href = prevHrefs[i];
    });
  };
}
