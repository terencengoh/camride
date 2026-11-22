// Fare rule shared by the Edge Functions. Mirrors public.fare_quote() in
// supabase/migrations/20261122000002_functions.sql; both are tested against
// supabase/tests/fare_fixtures.json so they cannot drift silently.

export interface RateCard {
  base_xaf: number;
  per_km_xaf: number;
  per_min_xaf: number;
  minimum_xaf: number;
  max_distance_km?: number | null;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Round FCFA half-up to the nearest 50 (coins below 50 FCFA are rarely used). */
export function roundXaf(amount: number): number {
  return Math.floor(amount / 50 + 0.5) * 50;
}

export function computeFare(card: RateCard, distanceKm: number, durationMin: number): number {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMin) || distanceKm < 0 || durationMin < 0) {
    throw new RangeError("distance and duration must be non-negative numbers");
  }
  const raw = card.base_xaf + card.per_km_xaf * distanceKm + card.per_min_xaf * durationMin;
  return roundXaf(Math.max(card.minimum_xaf, raw));
}

const EARTH_RADIUS_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(x));
}

/** Same estimate as public.estimate_route(): straight line x1.3, 22 km/h, minimum 2 minutes. */
export function estimateRoute(a: LatLng, b: LatLng): { distanceKm: number; durationMin: number } {
  const km = haversineKm(a, b) * 1.3;
  return { distanceKm: Math.round(km * 100) / 100, durationMin: Math.round(Math.max(2, (km / 22) * 60) * 10) / 10 };
}

export function inCameroon(p: LatLng): boolean {
  return p.lat >= 1.6 && p.lat <= 13.1 && p.lng >= 8.4 && p.lng <= 16.25;
}
