/**
 * Cross-browser geolocation.
 * Chrome/Edge on desktop often time out when enableHighAccuracy is required
 * (no GPS chip). Opera/Firefox may still return a Wi-Fi fix. We try precise
 * first, then fall back to network / watchPosition so punch-in is not browser-specific.
 */

export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number;
};

const PRECISE: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0,
};

const NETWORK: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15000,
  maximumAge: 30_000,
};

function unsupportedError(): Error {
  return Object.assign(new Error('Geolocation is not supported by your browser.'), { code: 0 });
}

function timeoutError(): Error {
  return Object.assign(new Error('Location request timed out.'), { code: 3 });
}

function requestPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(unsupportedError());
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function watchOnce(options: PositionOptions, maxMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(unsupportedError());
      return;
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      fn();
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => finish(() => resolve(pos)),
      (err) => finish(() => reject(err)),
      { ...options, timeout: maxMs, maximumAge: options.maximumAge }
    );

    const timer = window.setTimeout(() => finish(() => reject(timeoutError())), maxMs);
  });
}

export function geoErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? Number((error as GeolocationPositionError).code)
      : NaN;
  if (code === 1) {
    return 'Location permission denied. Click the lock icon next to the URL, allow Location, then refresh GPS.';
  }
  if (code === 2) {
    return 'Location unavailable. Turn on Location in Windows Settings (Privacy & security → Location) and try again.';
  }
  if (code === 3) {
    return 'Location request timed out. Allow Location for this site, turn on Windows Location Services, then tap refresh.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Unable to capture location coordinates.';
}

export async function getBrowserLocation(): Promise<GeoFix> {
  const toFix = (pos: GeolocationPosition): GeoFix => ({
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  });

  try {
    return toFix(await requestPosition(PRECISE));
  } catch (preciseError) {
    const code =
      typeof preciseError === 'object' && preciseError && 'code' in preciseError
        ? Number((preciseError as GeolocationPositionError).code)
        : NaN;
    if (code === 1) {
      throw preciseError;
    }
  }

  try {
    return toFix(await requestPosition(NETWORK));
  } catch (networkError) {
    const code =
      typeof networkError === 'object' && networkError && 'code' in networkError
        ? Number((networkError as GeolocationPositionError).code)
        : NaN;
    if (code === 1) {
      throw networkError;
    }
  }

  return toFix(await watchOnce(NETWORK, 12000));
}
