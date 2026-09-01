/** Canonical HQ pin defaults (overridden by /attendance/settings API when available). */
export const OFFICE_LATITUDE = 33.52062764084008;
export const OFFICE_LONGITUDE = 73.09183393441234;
export const OFFICE_MAP_URL = 'https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA';
export const GEOFENCE_RADIUS_METERS = 500;
export const HQ_PIN_ACCURACY_LIMIT_METERS = 50;
export const MAX_GPS_ACCURACY_METERS = 500;

export type GpsFixClass = 'in_range' | 'out_of_range' | 'coarse';

export function gpsAccuracyCap(radiusMeters: number): number {
  return Math.max(Number(radiusMeters) || 150, MAX_GPS_ACCURACY_METERS);
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Coarse / city-level guesses must not count as "out of office".
 * Only a tight fix whose accuracy circle cannot cover HQ is out of range.
 */
export function classifyGpsFix(
  distanceMeters: number,
  accuracyMeters: number | null | undefined,
  radiusMeters: number
): GpsFixClass {
  const radius = Number(radiusMeters) || 150;
  const cap = gpsAccuracyCap(radius);
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters) || accuracyMeters > cap) {
    return 'coarse';
  }
  if (distanceMeters - accuracyMeters > radius) {
    return 'out_of_range';
  }
  if (distanceMeters <= radius) {
    return 'in_range';
  }
  return 'coarse';
}

/** Parse "lat, lng" or a Google Maps URL/share string. */
export function parseOfficeCoordinates(raw: string): { lat: number; lng: number } | null {
  const text = String(raw || '').trim();
  if (!text) return null;

  const atMatch = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return toCoord(atMatch[1], atMatch[2]);
  }

  const bangMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bangMatch) {
    return toCoord(bangMatch[1], bangMatch[2]);
  }

  const qMatch = text.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (qMatch) {
    return toCoord(qMatch[1], qMatch[2]);
  }

  const pairMatch = text.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (pairMatch) {
    return toCoord(pairMatch[1], pairMatch[2]);
  }

  return null;
}

function toCoord(latRaw: string, lngRaw: string): { lat: number; lng: number } | null {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
