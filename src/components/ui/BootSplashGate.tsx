import { useEffect } from 'react';
import { removeBootSplash } from '../../utils/bootSplash';
import { LoadingScreen } from './LoadingScreen';

/**
 * Put this next to a lazy first screen, inside the same <Suspense>. React commits
 * the two together, so the HTML #boot-splash is removed only once that screen's
 * chunk has arrived and it is on screen. No blank frame between loader and screen.
 */
export function RemoveBootSplashOnMount() {
  useEffect(() => {
    removeBootSplash();
  }, []);
  return null;
}

function bootSplashVisible(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById('boot-splash');
  return Boolean(el && !el.classList.contains('boot-splash-hide'));
}

/**
 * Suspense fallback for first screens. While the HTML splash is still up it
 * renders nothing (the splash already covers the page). If the splash is gone
 * (e.g. the session expired later), it shows the full-screen loader instead of
 * a blank page.
 */
export function BootFallback() {
  if (bootSplashVisible()) return null;
  return <LoadingScreen fullScreen />;
}
