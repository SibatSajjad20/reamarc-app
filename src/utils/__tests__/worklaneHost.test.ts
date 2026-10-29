import { describe, expect, it } from 'vitest';
import {
  WORKLANE_API_BASE,
  companyMatchesHostSlug,
  companySlugFromHost,
  companySubdomainUrl,
  companySwitchNavigationUrl,
  isWorklaneHost,
  publicApiOrigin,
  publicAppOrigin,
  publicInvoiceUrl,
  resolveWorklaneHostAction,
  unknownWorklaneSubdomainApexUrl,
  worklaneCompanyHostRedirectUrl,
} from '../worklaneHost';

describe('worklaneHost', () => {
  it('detects Worklane hosts strictly', () => {
    expect(isWorklaneHost('oneworklane.com')).toBe(true);
    expect(isWorklaneHost('www.oneworklane.com')).toBe(true);
    expect(isWorklaneHost('dataviz.oneworklane.com')).toBe(true);
    expect(isWorklaneHost('evil-oneworklane.com')).toBe(false);
    expect(isWorklaneHost('a.b.oneworklane.com')).toBe(false);
    expect(isWorklaneHost('reamarc-app.vercel.app')).toBe(false);
  });

  it('parses company slug from subdomain', () => {
    expect(companySlugFromHost('dataviz.oneworklane.com')).toBe('dataviz');
    expect(companySlugFromHost('www.oneworklane.com')).toBeNull();
    expect(companySlugFromHost('api.oneworklane.com')).toBeNull();
    expect(companySlugFromHost('oneworklane.com')).toBeNull();
    expect(companySlugFromHost('evil-oneworklane.com')).toBeNull();
    expect(companySlugFromHost('reamarc-app.vercel.app')).toBeNull();
  });

  it('exposes the Worklane API base', () => {
    expect(WORKLANE_API_BASE).toBe('https://api.oneworklane.com/api/v1');
  });

  it('builds canonical public invoice URLs on Worklane hosts', () => {
    expect(publicApiOrigin('dataviz.oneworklane.com')).toBe('https://api.oneworklane.com');
    expect(publicAppOrigin('dataviz.oneworklane.com')).toBe('https://oneworklane.com');
    expect(publicInvoiceUrl('inv_tok_x', 'dataviz.oneworklane.com')).toBe(
      'https://api.oneworklane.com/api/v1/finance/public/invoice/inv_tok_x',
    );
    expect(publicApiOrigin('reamarc-app.vercel.app')).not.toBe('https://api.oneworklane.com');
  });
});

describe('companyMatchesHostSlug (exact slug only)', () => {
  it('matches only when company.slug equals host slug (lowercase)', () => {
    expect(companyMatchesHostSlug({ slug: 'reamarc' }, 'reamarc')).toBe(true);
    expect(companyMatchesHostSlug({ slug: 'dataviz' }, 'dataviz')).toBe(true);
    expect(companyMatchesHostSlug({ slug: 'DataViz' }, 'dataviz')).toBe(true);
  });

  it('does NOT match long display names (DataViz Technologies)', () => {
    expect(
      companyMatchesHostSlug(
        { slug: '', name: 'DataViz Technologies', display_name: 'DataViz Technologies' } as any,
        'dataviz',
      ),
    ).toBe(false);
    expect(companyMatchesHostSlug({ name: 'DataViz' } as any, 'dataviz')).toBe(false);
    expect(companyMatchesHostSlug({ slug: '', name: 'DataViz' } as any, 'dataviz')).toBe(false);
  });

  it('does not fuzzy-match hyphenated slug to collapsed host', () => {
    expect(companyMatchesHostSlug({ slug: 'data-viz' }, 'dataviz')).toBe(false);
  });

  it('does not false-positive Reamarc for dataviz host', () => {
    expect(companyMatchesHostSlug({ slug: 'reamarc', name: 'Reamarc' } as any, 'dataviz')).toBe(false);
  });
});

describe('Worklane subdomain navigation', () => {
  it('builds company subdomain URLs', () => {
    expect(companySubdomainUrl('dataviz', '/dashboard')).toBe(
      'https://dataviz.oneworklane.com/dashboard',
    );
    expect(companySubdomainUrl('dataviz', '/')).toBe('https://dataviz.oneworklane.com');
    expect(companySubdomainUrl('', '/dashboard')).toBeNull();
    expect(companySubdomainUrl('www', '/')).toBeNull();
    expect(companySubdomainUrl('api', '/')).toBeNull();
  });

  it('unknown subdomain apex URL keeps path', () => {
    expect(unknownWorklaneSubdomainApexUrl('hello.oneworklane.com', '/foo', '?x=1')).toBe(
      'https://oneworklane.com/foo?x=1',
    );
    expect(unknownWorklaneSubdomainApexUrl('oneworklane.com', '/foo')).toBeNull();
    expect(unknownWorklaneSubdomainApexUrl('www.oneworklane.com', '/')).toBeNull();
    expect(unknownWorklaneSubdomainApexUrl('api.oneworklane.com', '/')).toBeNull();
  });

  it('apex login redirects to company subdomain; already-there is null', () => {
    expect(
      worklaneCompanyHostRedirectUrl('oneworklane.com', 'dataviz', '/dashboard'),
    ).toBe('https://dataviz.oneworklane.com/dashboard');
    expect(
      worklaneCompanyHostRedirectUrl('dataviz.oneworklane.com', 'dataviz', '/dashboard'),
    ).toBeNull();
    expect(
      worklaneCompanyHostRedirectUrl('reamarc.oneworklane.com', 'dataviz', '/dashboard'),
    ).toBe('https://dataviz.oneworklane.com/dashboard');
  });

  it('no slug stays put; vercel.app never redirects', () => {
    expect(worklaneCompanyHostRedirectUrl('oneworklane.com', '', '/dashboard')).toBeNull();
    expect(worklaneCompanyHostRedirectUrl('oneworklane.com', null, '/dashboard')).toBeNull();
    expect(
      worklaneCompanyHostRedirectUrl('reamarc-app.vercel.app', 'dataviz', '/dashboard'),
    ).toBeNull();
  });
});

describe('resolveWorklaneHostAction (no ping-pong)', () => {
  const reamarc = { id: 'c_reamarc', slug: 'reamarc' };
  const dataviz = { id: 'c_dataviz', slug: 'dataviz' };
  const userOnReamarc = {
    company_id: 'c_reamarc',
    company: { slug: 'reamarc' },
    companies: [reamarc, dataviz],
  };
  const userOnDataviz = {
    company_id: 'c_dataviz',
    company: { slug: 'dataviz' },
    companies: [reamarc, dataviz],
  };

  it('suspends all actions during an in-flight switch/redirect', () => {
    expect(
      resolveWorklaneHostAction('reamarc.oneworklane.com', userOnDataviz, { suspend: true }),
    ).toEqual({ type: 'none' });
    expect(
      resolveWorklaneHostAction('oneworklane.com', userOnDataviz, { suspend: true }),
    ).toEqual({ type: 'none' });
  });

  it('inbound visit to reamarc while active is DataViz: switch once to host company (not a loop)', () => {
    // Host wins for deliberate visits. Outbound switches must set suspend=true instead.
    expect(resolveWorklaneHostAction('reamarc.oneworklane.com', userOnDataviz)).toEqual({
      type: 'switch',
      companyId: 'c_reamarc',
    });
  });

  it('suspended outbound switch never fights the host (the flicker root cause)', () => {
    // Simulate: API already moved active→DataViz but browser still on reamarc during replace().
    expect(
      resolveWorklaneHostAction('reamarc.oneworklane.com', userOnDataviz, { suspend: true }),
    ).toEqual({ type: 'none' });
  });

  it('landing on dataviz while active is Reamarc switches once to DataViz', () => {
    expect(resolveWorklaneHostAction('dataviz.oneworklane.com', userOnReamarc)).toEqual({
      type: 'switch',
      companyId: 'c_dataviz',
    });
  });

  it('apex logged-in redirects once to active company subdomain', () => {
    expect(resolveWorklaneHostAction('oneworklane.com', userOnDataviz, { pathname: '/' })).toEqual({
      type: 'redirect',
      url: 'https://dataviz.oneworklane.com/dashboard',
    });
  });

  it('already on correct subdomain is a no-op', () => {
    expect(resolveWorklaneHostAction('dataviz.oneworklane.com', userOnDataviz)).toEqual({
      type: 'none',
    });
  });

  it('companySwitchNavigationUrl is a single hop to the target host', () => {
    expect(companySwitchNavigationUrl('reamarc.oneworklane.com', 'dataviz', '/dashboard')).toBe(
      'https://dataviz.oneworklane.com/dashboard',
    );
    expect(companySwitchNavigationUrl('dataviz.oneworklane.com', 'dataviz', '/dashboard')).toBeNull();
    expect(companySwitchNavigationUrl('reamarc-app.vercel.app', 'dataviz', '/dashboard')).toBeNull();
  });
});
