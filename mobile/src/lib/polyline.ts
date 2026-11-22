// Decodes the encoded route lines computed server-side (Google polyline algorithm, precision 6 = OSRM polyline6).
import type { LatLng } from "./types";

export function decodePolyline(s: string, precision = 6): LatLng[] {
  const f = 10 ** precision;
  const pts: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
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

/** react-native-maps coordinates for a Polyline. */
export function toCoords(encoded: string | null | undefined): { latitude: number; longitude: number }[] {
  if (!encoded) return [];
  try {
    return decodePolyline(encoded).map((p) => ({ latitude: p.lat, longitude: p.lng }));
  } catch {
    return [];
  }
}
