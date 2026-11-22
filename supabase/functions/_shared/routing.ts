// Road routing for fares and route lines. Uses an OSRM server when ROUTING_URL is set
// (self-hosted osrm-backend with Cameroon OSM data, or a hosted OSRM-compatible API), and falls
// back to the straight-line estimate (haversine x1.3 at 22 km/h) when it is unset or fails.
//   GET {ROUTING_URL}/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=polyline6
//   -> { code: "Ok", routes: [{ distance (m), duration (s), geometry (polyline6) }] }
// Note: the public demo server router.project-osrm.org is not for production use.
import { estimateRoute, type LatLng } from "./fare.ts";

export interface Route {
  distanceKm: number;
  durationMin: number;
  /** Encoded polyline, precision 6 (Google polyline algorithm with 1e6). */
  polyline: string;
  source: "osrm" | "estimate";
}

export interface RoutingOptions {
  url?: string | null;
  /** Multiplies OSRM durations (car profile) to reflect Cameroonian traffic; default 1.25. */
  durationFactor?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined; // no env permission (tests)
  }
}

export function encodePolyline(points: LatLng[], precision = 6): string {
  const f = 10 ** precision;
  let lastLat = 0, lastLng = 0, out = "";
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * f), lng = Math.round(p.lng * f);
    enc(lat - lastLat);
    enc(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out;
}

export function decodePolyline(s: string, precision = 6): LatLng[] {
  const f = 10 ** precision;
  const pts: LatLng[] = [];
  let i = 0, lat = 0, lng = 0;
  const next = () => {
    let result = 0, shift = 0, b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    lat += next();
    lng += next();
    pts.push({ lat: lat / f, lng: lng / f });
  }
  return pts;
}

export function estimatedRoute(a: LatLng, b: LatLng): Route {
  const e = estimateRoute(a, b);
  return { ...e, polyline: encodePolyline([a, b]), source: "estimate" };
}

export async function getRoute(a: LatLng, b: LatLng, opts: RoutingOptions = {}): Promise<Route> {
  const url = (opts.url ?? env("ROUTING_URL") ?? "").replace(/\/+$/, "");
  if (!url) return estimatedRoute(a, b);
  const factor = opts.durationFactor ?? Number(env("ROUTING_DURATION_FACTOR") ?? 1.25);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 4000);
  try {
    const res = await (opts.fetchFn ?? fetch)(
      `${url}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=polyline6`,
      { signal: ctrl.signal },
    );
    const body = await res.json();
    const r = body?.routes?.[0];
    if (!res.ok || body?.code !== "Ok" || !r || !Number.isFinite(r.distance) || !Number.isFinite(r.duration)) throw new Error(`OSRM ${body?.code ?? res.status}`);
    return {
      distanceKm: Math.round((r.distance / 1000) * 100) / 100,
      durationMin: Math.round(Math.max(2, (r.duration / 60) * factor) * 10) / 10,
      polyline: String(r.geometry ?? encodePolyline([a, b])),
      source: "osrm",
    };
  } catch (e) {
    console.warn("routing fallback to estimate:", (e as Error).message);
    return estimatedRoute(a, b);
  } finally {
    clearTimeout(timer);
  }
}
