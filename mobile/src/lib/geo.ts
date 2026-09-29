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

export type GpsFixClass = 'in_range' | 'out_of_range' | 'coarse';

export function classifyGpsFix(
  distanceMeters: number,
  accuracyMeters: number | null | undefined,
  radiusMeters: number,
): GpsFixClass {
  const radius = Number(radiusMeters) || 150;
  const cap = Math.max(radius, 500);
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters) || accuracyMeters > cap) {
    return 'coarse';
  }
  if (distanceMeters - accuracyMeters > radius) return 'out_of_range';
  if (distanceMeters <= radius) return 'in_range';
  return 'coarse';
}

export type PunchFix = {
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
  quality: GpsFixClass;
};

export type PunchGpsFields = {
  latitude?: number;
  longitude?: number;
  accuracy_meters?: number;
  gps_captured_at?: string;
};

/**
 * A live sample is good enough to stop waiting once it sits inside the fence
 * with a satellite-scale accuracy. Looser network guesses keep watching so a
 * later GPS update can replace them.
 */
export function shouldAcceptLiveSample(quality: GpsFixClass, accuracyMeters: number): boolean {
  return quality === 'in_range' && Number.isFinite(accuracyMeters) && accuracyMeters <= 150;
}

/**
 * Do not upload a tight out-of-range pin while the device is already on the
 * office network. That pin is usually a Wi-Fi-database miss. The server would
 * store it as the punch location and, on older builds, reject the punch.
 * Off the office network the same pin is sent so a real away-from-office fix
 * is rejected.
 */
export function gpsFieldsForPunch(fix: PunchFix | null, officeNetworkVerified: boolean): PunchGpsFields {
  if (!fix) return {};
  if (fix.quality === 'out_of_range' && officeNetworkVerified) return {};
  return {
    latitude: fix.lat,
    longitude: fix.lng,
    accuracy_meters: fix.accuracy,
    gps_captured_at: fix.capturedAt,
  };
}
