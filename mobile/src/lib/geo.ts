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
