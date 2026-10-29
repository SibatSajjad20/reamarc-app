/** Browser-local theme preference. Survives logout; never clear on sign-out. */
export const THEME_STORAGE_KEY = 'reamarc-theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ThemeMode = 'light' | 'dark';

export function readThemePreference(): ThemePreference | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
  } catch {
    return null;
  }
}

/** System preference only when nothing valid is saved (or saved value is 'system'). */
export function resolveTheme(pref: ThemePreference | null): ThemeMode {
  if (pref === 'dark') return 'dark';
  if (pref === 'light') return 'light';
  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

export function applyResolvedTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
  if (document.body) {
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(theme);
  }
}

/** Persist + apply immediately (before paint/react effects) so logout reload keeps the choice. */
export function persistThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage blocked */
  }
  applyResolvedTheme(resolveTheme(pref));
}
