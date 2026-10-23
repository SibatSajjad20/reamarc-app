import { describe, it, expect } from 'vitest';
import { changedFields } from '../ContentCalendarModal';

describe('changedFields (two members editing one item)', () => {
  const opened = { id: 'cc1', content_concept: 'Concept 3', cta: 'Old CTA', tags: ['a'] } as any;

  it('sends only the fields this person changed', () => {
    const out = changedFields(opened, { ...opened, cta: 'CTA by B' });
    expect(out).toEqual({ id: 'cc1', cta: 'CTA by B' });
  });

  it('does not resend a stale value for a field a teammate just changed', () => {
    const out = changedFields(opened, { ...opened, cta: 'CTA by B' });
    expect('content_concept' in out).toBe(false);
  });

  it('compares arrays by value and skips undefined', () => {
    const out = changedFields(opened, { ...opened, tags: ['a'], final_asset_link: undefined } as any);
    expect(out).toEqual({ id: 'cc1' });
  });
});
