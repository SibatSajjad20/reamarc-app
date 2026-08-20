/**
 * Cross-browser geolocation.
 * Chrome/Edge on Windows often never return a fix (they depend on Windows
 * Location Services). Opera GX uses its own provider and usually succeeds.
 * We race a fast network fix against a precise fix so we do not wait 40s+.
 */

export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number;
};

const NETWORK: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 60_000,
};

const PRECISE: PositionOptions = {
  enableHighAccuracy: true,
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
    if (!window.isSecureContext) {
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

export async function getBrowserLocation(): Promise<GeoFix> {
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (status.state === 'denied') {
        throw Object.assign(new Error('Location permission denied by browser.'), { code: 1 });
      }
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? Number((err as GeolocationPositionError).code) : NaN;
      if (code === 1) throw err;
    }
  }

  try {
    return toFix(
      await Promise.any([requestPosition(NETWORK), requestPosition(PRECISE)])
    );
  } catch (aggregate) {
    if (aggregate instanceof AggregateError && aggregate.errors?.length) {
      const denied = aggregate.errors.find(
        (err) => typeof err === 'object' && err && 'code' in err && Number((err as GeolocationPositionError).code) === 1
      );
      throw denied || aggregate.errors[0] || timeoutError();
    }
    throw aggregate;
  }
}
