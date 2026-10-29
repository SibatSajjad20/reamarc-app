import { describe, expect, it } from 'vitest';
import {
  WORKLANE_API_BASE,
  companySlugFromHost,
  isWorklaneHost,
  publicApiOrigin,
  publicAppOrigin,
  publicInvoiceUrl,
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
    // Non-Worklane hosts keep the current page origin (jsdom default in tests).
    expect(publicApiOrigin('reamarc-app.vercel.app')).not.toBe('https://api.oneworklane.com');
  });
});
