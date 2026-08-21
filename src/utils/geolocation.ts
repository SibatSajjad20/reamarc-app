/**
 * Cross-browser geolocation.
 * Phones: high-accuracy GPS, requested from a user tap so iOS/Android show
 * the native permission prompt. Desktops: precise first, then network.
 */

export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number;
};

const DESKTOP_PRECISE: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 30000,
  maximumAge: 0,
};

const DESKTOP_NETWORK: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 0,
};

const MOBILE_WATCH: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 45000,
  maximumAge: 0,
};

const MOBILE_TARGET_ACCURACY_M = 80;
const MOBILE_WATCH_MS = 25000;

function unsupportedError(): Error {
  return Object.assign(new Error('Geolocation is not supported by your browser.'), { code: 0 });
}

function timeoutError(): Error {
  return Object.assign(new Error('Location request timed out.'), { code: 3 });
}

export function isLikelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (typeof window !== 'undefined' && navigator.maxTouchPoints > 1) {
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
  }
  return false;
}

function requestPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(new Error('Location requires HTTPS. Open the site with https://, not a raw IP.'));
      return;
    }
    if (!navigator.geolocation) {
      reject(unsupportedError());
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function watchForAccurateFix(maxMs: number, targetAccuracy: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(new Error('Location requires HTTPS. Open the site with https://, not a raw IP.'));
      return;
    }
    if (!navigator.geolocation) {
      reject(unsupportedError());
      return;
    }

    let best: GeolocationPosition | null = null;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      fn();
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) {
          best = pos;
        }
        if (pos.coords.accuracy <= targetAccuracy) {
          finish(() => resolve(pos));
        }
      },
      (err) => finish(() => reject(err)),
      MOBILE_WATCH
    );

    const timer = window.setTimeout(() => {
      const snapshot = best;
      if (snapshot) {
        finish(() => resolve(snapshot));
        return;
      }
      finish(() => reject(timeoutError()));
    }, maxMs);
  });
}

export function geoErrorMessage(error: unknown): string {
  const mobile = isLikelyMobile();
  const code =
    typeof error === 'object' && error && 'code' in error
      ? Number((error as GeolocationPositionError).code)
      : NaN;
  if (code === 1) {
    return mobile
      ? 'Location permission denied. Tap Allow when the phone asks, or enable Location for this site in Chrome/Safari settings.'
      : 'Location permission denied. Click the lock icon next to the URL, allow Location, then refresh.';
  }
  if (code === 2) {
    return mobile
      ? 'Location unavailable. Turn on Location / GPS in phone settings, then tap Allow location.'
      : 'Location unavailable. Chrome/Edge need Windows Location Services (Settings → Privacy → Location).';
  }
  if (code === 3) {
    return mobile
      ? 'Location timed out. Stand near a window, keep the page open, and tap Allow location again.'
      : 'Location timed out. Chrome/Edge need Windows Location on; you can still check in on office Wi-Fi.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Unable to capture location coordinates.';
}

function toFix(pos: GeolocationPosition): GeoFix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

function isDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    Number((error as GeolocationPositionError).code) === 1
  );
}

export async function getBrowserLocation(): Promise<GeoFix> {
  if (isLikelyMobile()) {
    return toFix(await watchForAccurateFix(MOBILE_WATCH_MS, MOBILE_TARGET_ACCURACY_M));
  }

  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (status.state === 'denied') {
        throw Object.assign(new Error('Location permission denied by browser.'), { code: 1 });
      }
    } catch (err) {
      if (isDenied(err)) throw err;
    }
  }

  try {
    return toFix(await requestPosition(DESKTOP_PRECISE));
  } catch (preciseError) {
    if (isDenied(preciseError)) throw preciseError;
  }

  try {
    return toFix(await requestPosition(DESKTOP_NETWORK));
  } catch (networkError) {
    throw networkError instanceof Error ? networkError : timeoutError();
  }
}
