/**
 * Cross-browser geolocation.
 * iOS Safari only shows Allow if getCurrentPosition runs in the same turn as a tap.
 * Android Chrome blocks a second prompt in the same moment with
 * "This site can't ask for your permission" — share one in-flight request.
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

const MOBILE_PROMPT: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 60000,
  maximumAge: 0,
};

const CACHE_MS = 20_000;

let inFlight: Promise<GeoFix> | null = null;
let lastFix: { fix: GeoFix; at: number } | null = null;

function unsupportedError(): Error {
  return Object.assign(new Error('Geolocation is not supported by your browser.'), { code: 0 });
}

function timeoutError(): Error {
  return Object.assign(new Error('Location request timed out.'), { code: 3 });
}

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export function isLikelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (typeof window !== 'undefined' && navigator.maxTouchPoints > 0 && window.innerWidth < 1024) {
    return true;
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

export function geoErrorMessage(error: unknown): string {
  const android = isAndroid();
  const mobile = isLikelyMobile();
  const code =
    typeof error === 'object' && error && 'code' in error
      ? Number((error as GeolocationPositionError).code)
      : NaN;
  if (code === 1) {
    if (android) {
      return 'Chrome blocked a second location prompt. Tap the lock icon → Permissions → Location → Allow, turn on Precise location, then tap Allow location once.';
    }
    return mobile
      ? 'Safari blocked location. On iPhone: Settings → Privacy & Security → Location Services → On, then Safari → While Using. In Safari tap aA → Website Settings → Location → Allow, then tap Allow location again.'
      : 'Location permission denied. Click the lock icon next to the URL, allow Location, then refresh.';
  }
  if (code === 2) {
    return mobile
      ? 'Location unavailable. Turn on Location / GPS, then tap Allow location again.'
      : 'Location unavailable. Chrome/Edge need Windows Location Services (Settings → Privacy → Location).';
  }
  if (code === 3) {
    return mobile
      ? 'Location timed out. Keep the page open, stand near a window, and tap Allow location again.'
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

function fetchLocation(): Promise<GeoFix> {
  if (isLikelyMobile()) {
    return requestPosition(MOBILE_PROMPT).then(toFix);
  }

  return (async () => {
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
  })();
}

export function getBrowserLocation(): Promise<GeoFix> {
  if (lastFix && Date.now() - lastFix.at < CACHE_MS) {
    return Promise.resolve(lastFix.fix);
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = fetchLocation()
    .then((fix) => {
      lastFix = { fix, at: Date.now() };
      return fix;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
