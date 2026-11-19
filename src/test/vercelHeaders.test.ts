import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Rule = { source: string; headers: { key: string; value: string }[] };
const config = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')) as { headers: Rule[] };

/** Last matching rule wins on Vercel for the same header key. */
function cacheControlFor(path: string): string | undefined {
  let value: string | undefined;
  for (const rule of config.headers) {
    if (!new RegExp(`^${rule.source}$`).test(path)) continue;
    const h = rule.headers.find((x) => x.key.toLowerCase() === 'cache-control');
    if (h) value = h.value;
  }
  return value;
}

describe('vercel.json caching', () => {
  it('does not override the API Cache-Control (thumbnails keep their 30-day private cache)', () => {
    expect(cacheControlFor('/api/v1/thumbs/content_calendar/x/a.jpg')).toBeUndefined();
    expect(cacheControlFor('/api/v1/content-calendar/public/review/tok/assets/a1')).toBeUndefined();
    expect(cacheControlFor('/api/v1/auth/me')).toBeUndefined();
  });
  it('keeps no-cache on the app shell and immutable on hashed assets', () => {
    expect(cacheControlFor('/')).toBe('no-cache');
    expect(cacheControlFor('/portal')).toBe('no-cache');
    expect(cacheControlFor('/review/abc')).toBe('no-cache');
    expect(cacheControlFor('/assets/index-abc.js')).toBe('public, max-age=31536000, immutable');
  });
  it('security headers still apply to every path', () => {
    const all = config.headers.find((r) => r.source === '/(.*)')!;
    expect(all.headers.map((h) => h.key)).toEqual(
      expect.arrayContaining(['X-Content-Type-Options', 'Content-Security-Policy', 'X-Frame-Options']),
    );
  });
});
