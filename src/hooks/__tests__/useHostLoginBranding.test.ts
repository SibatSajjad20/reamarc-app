import { describe, expect, it } from 'vitest';
import {
  PLATFORM_LOGIN_BRAND,
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

describe('PLATFORM_LOGIN_BRAND', () => {
  it('keeps Reamarc as apex/vercel default', () => {
    expect(PLATFORM_LOGIN_BRAND.displayName).toBe('Reamarc');
  });
});
