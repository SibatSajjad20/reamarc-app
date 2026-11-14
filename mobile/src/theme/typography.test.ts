import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APP_FONT, appTypeStyle, displayWeight, fontFamilyFor } from './typography.ts';

describe('mobile typography', () => {
  it('caps heavy weights at semibold so copy is not extra-bold', () => {
    assert.equal(displayWeight('400'), 400);
    assert.equal(displayWeight('500'), 500);
    assert.equal(displayWeight('600'), 600);
    assert.equal(displayWeight('700'), 600);
    assert.equal(displayWeight('800'), 600);
    assert.equal(displayWeight('bold'), 600);
  });

  it('uses the same Geist files on every platform', () => {
    assert.equal(fontFamilyFor('400'), APP_FONT.regular);
    assert.equal(fontFamilyFor('500'), APP_FONT.medium);
    assert.equal(fontFamilyFor('700'), APP_FONT.semibold);
  });

  it('drops numeric fontWeight so Android does not fake-bold Regular', () => {
    const style = appTypeStyle({ fontSize: 15, fontWeight: '700', color: '#111' });
    assert.equal(style.fontFamily, APP_FONT.semibold);
    assert.equal(style.fontWeight, undefined);
    assert.equal(style.fontSize, 15);
  });

  it('keeps icon font families so Ionicons are not replaced with Geist', () => {
    const style = appTypeStyle({ fontFamily: 'ionicons', fontSize: 18, color: '#111' });
    assert.equal(style.fontFamily, 'ionicons');
  });
});
