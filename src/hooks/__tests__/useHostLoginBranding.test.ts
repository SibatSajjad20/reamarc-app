import { describe, expect, it } from 'vitest';
import {
  PLATFORM_LOGIN_BRAND,
  WORKLANE_LOGIN_BRAND,
  platformLoginBrandForHost,
  shouldLoadHostLoginBranding,
} from '../useHostLoginBranding';

describe('shouldLoadHostLoginBranding', () => {
  it('loads only on company Worklane subdomains', () => {
    expect(shouldLoadHostLoginBranding('dataviz.oneworklane.com')).toBe(true);
    expect(shouldLoadHostLoginBranding('reamarc.oneworklane.com')).toBe(true);
    expect(shouldLoadHostLoginBranding('oneworklane.com')).toBe(false);
    expect(shouldLoadHostLoginBranding('www.oneworklane.com')).toBe(false);
    expect(shouldLoadHostLoginBranding('api.oneworklane.com')).toBe(false);
    expect(shouldLoadHostLoginBranding('reamarc-app.vercel.app')).toBe(false);
  });
});

describe('platformLoginBrandForHost', () => {
  it('uses oneworklane branding on apex and www', () => {
    expect(platformLoginBrandForHost('oneworklane.com').displayName).toBe('oneworklane');
    expect(platformLoginBrandForHost('www.oneworklane.com').displayName).toBe('oneworklane');
    expect(platformLoginBrandForHost('oneworklane.com').logoUrl).toBe(WORKLANE_LOGIN_BRAND.logoUrl);
  });

  it('keeps Reamarc on vercel.app', () => {
    expect(platformLoginBrandForHost('reamarc-app.vercel.app')).toEqual({
      displayName: PLATFORM_LOGIN_BRAND.displayName,
      logoUrl: PLATFORM_LOGIN_BRAND.logoUrl,
      accentColor: PLATFORM_LOGIN_BRAND.accentColor,
    });
  });
});
