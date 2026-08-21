/**
 * Cross-browser geolocation.
 * Prefer a precise reading. Only fall back to a network fix if high-accuracy
 * times out — never let a cached city-level guess win a race.
 */

export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number;
};

const PRECISE: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

const NETWORK: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 0,
};

function unsupportedError(): Error {
  return Object.assign(new Error('Geolocation is not supported by your browser.'), { code: 0 });
}

function timeoutError(): Error {
  return Object.assign(new Error('Location request timed out.'), { code: 3 });
}

function requestPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(new Error('Location requires HTTPS.'));
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
  const code =
    typeof error === 'object' && error && 'code' in error
      ? Number((error as GeolocationPositionError).code)
      : NaN;
  if (code === 1) {
    return 'Location permission denied. Click the lock icon next to the URL, allow Location, then refresh.';
  }
  if (code === 2) {
    return 'Location unavailable. Chrome/Edge need Windows Location Services (Settings → Privacy → Location).';
  }
  if (code === 3) {
    return 'Location timed out. Chrome/Edge need Windows Location on; you can still check in on office Wi-Fi.';
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
  return typeof error === 'object' && error != null && 'code' in error && Number((error as GeolocationPositionError).code) === 1;
}

export async function getBrowserLocation(): Promise<GeoFix> {
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
    return toFix(await requestPosition(PRECISE));
  } catch (preciseError) {
    if (isDenied(preciseError)) throw preciseError;
  }

  try {
    return toFix(await requestPosition(NETWORK));
  } catch (networkError) {
    throw networkError instanceof Error ? networkError : timeoutError();
  }
}
