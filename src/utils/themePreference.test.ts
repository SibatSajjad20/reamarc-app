import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
} from './themePreference';

describe('themePreference', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.body.className = '';
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads only light|dark|system and treats anything else as unset', () => {
    expect(readThemePreference()).toBeNull();
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readThemePreference()).toBe('light');
    localStorage.setItem(THEME_STORAGE_KEY, 'nope');
    expect(readThemePreference()).toBeNull();
  });

  it('falls back to system preference only when nothing valid is saved', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    expect(resolveTheme(null)).toBe('dark');
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('persistThemePreference writes localStorage and applies classes immediately', () => {
    persistThemePreference('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('applyResolvedTheme toggles html/body classes', () => {
    applyResolvedTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(true);
    applyResolvedTheme('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(false);
  });
});
