import { useEffect, useState } from 'react';
import { companySlugFromHost, isWorklaneHost } from '../utils/worklaneHost';

/** reamarc-app.vercel.app (and any non-Worklane host) keeps Reamarc login branding. */
export const PLATFORM_LOGIN_BRAND = {
  displayName: 'Reamarc',
  logoUrl: null as string | null,
  accentColor: '#4F46E5',
} as const;

/** Apex / www oneworklane.com — product login branding (not a company tenant). */
export const WORKLANE_LOGIN_BRAND = {
  displayName: 'oneworklane',
  /** Chip wordmark reads on both light and dark login backgrounds. */
  logoUrl: '/oneworklane-wordmark-chip.png' as string | null,
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

/** Apex/www Worklane → oneworklane; vercel.app / other → Reamarc. */
export function platformLoginBrandForHost(hostname: string | null | undefined): {
  displayName: string;
  logoUrl: string | null;
  accentColor: string;
} {
  if (isWorklaneHost(hostname) && !companySlugFromHost(hostname)) {
    return {
      displayName: WORKLANE_LOGIN_BRAND.displayName,
      logoUrl: WORKLANE_LOGIN_BRAND.logoUrl,
      accentColor: WORKLANE_LOGIN_BRAND.accentColor,
    };
  }
  return {
    displayName: PLATFORM_LOGIN_BRAND.displayName,
    logoUrl: PLATFORM_LOGIN_BRAND.logoUrl,
    accentColor: PLATFORM_LOGIN_BRAND.accentColor,
  };
}

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Apex/www Worklane → oneworklane branding immediately.
 * vercel.app → Reamarc branding immediately.
 * `<slug>.oneworklane.com` → loading skeleton, then company branding (never flash Reamarc).
 */
export function useHostLoginBranding(
  hostname: string | null | undefined = typeof window !== 'undefined' ? window.location.hostname : null,
  fetchImpl: typeof fetch = fetch,
): HostLoginBrandingState {
  const slug = companySlugFromHost(hostname);
  const needsTenant = Boolean(isWorklaneHost(hostname) && slug);
  const platform = platformLoginBrandForHost(hostname);

  const [state, setState] = useState<HostLoginBrandingState>(() =>
    needsTenant
      ? { status: 'loading', displayName: null, logoUrl: null, accentColor: null }
      : {
          status: 'platform',
          displayName: platform.displayName,
          logoUrl: platform.logoUrl,
          accentColor: platform.accentColor,
        },
  );

  useEffect(() => {
    if (!needsTenant || !slug) {
      const p = platformLoginBrandForHost(hostname);
      setState({
        status: 'platform',
        displayName: p.displayName,
        logoUrl: p.logoUrl,
        accentColor: p.accentColor,
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
  }, [needsTenant, slug, fetchImpl, hostname]);

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
    document.title = 'Worklane';
    iconLinks.forEach((el) => {
      el.href = '/worklane-mark.png';
    });
  } else {
    document.title = `Sign in · ${opts.displayName}`;
  }

  if (opts.logoUrl && !opts.loading) {
    // Prefer W mark for tab icon when the "logo" is a wide wordmark chip.
    const isWordmark = /oneworklane-wordmark/i.test(opts.logoUrl);
    const href = isWordmark ? '/worklane-mark.png' : opts.logoUrl;
    iconLinks.forEach((el) => {
      el.href = href;
    });
    if (iconLinks.length === 0) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = href;
      document.head.appendChild(link);
    }
  } else if (!opts.loading && !opts.logoUrl) {
    iconLinks.forEach((el) => {
      el.href = '/worklane-mark.png';
    });
  }

  return () => {
    document.title = prevTitle;
    iconLinks.forEach((el, i) => {
      if (prevHrefs[i]) el.href = prevHrefs[i];
    });
  };
}
