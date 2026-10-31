/** Neutral HTML #boot-splash helpers. Kept until auth/public surface is ready. */

const SPLASH_ID = 'boot-splash';
const HIDE_CLASS = 'boot-splash-hide';
const FADE_MS = 180;

let removed = false;

/** Fade out and remove the first-paint splash once. Safe to call repeatedly. */
export function removeBootSplash(): void {
  if (typeof document === 'undefined' || removed) return;
  const el = document.getElementById(SPLASH_ID);
  if (!el) {
    removed = true;
    return;
  }
  removed = true;
  el.classList.add(HIDE_CLASS);
  el.setAttribute('aria-busy', 'false');
  window.setTimeout(() => {
    el.remove();
  }, FADE_MS);
}

/** Test helper — reset the once-guard between Vitest cases. */
export function resetBootSplashGuardForTests(): void {
  removed = false;
}
