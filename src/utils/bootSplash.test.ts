import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeBootSplash, resetBootSplashGuardForTests } from './bootSplash';

describe('removeBootSplash', () => {
  beforeEach(() => {
    resetBootSplashGuardForTests();
    document.body.innerHTML =
      '<div id="boot-splash" aria-busy="true"><img class="boot-mark" /></div><div id="root"></div>';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    resetBootSplashGuardForTests();
  });

  it('fades once then removes the splash; second call is a no-op', () => {
    removeBootSplash();
    const el = document.getElementById('boot-splash');
    expect(el).toBeTruthy();
    expect(el!.classList.contains('boot-splash-hide')).toBe(true);
    expect(el!.getAttribute('aria-busy')).toBe('false');
    removeBootSplash(); // no-op
    vi.advanceTimersByTime(200);
    expect(document.getElementById('boot-splash')).toBeNull();
  });
});
