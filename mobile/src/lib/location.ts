import * as Location from "expo-location";
import { DEFAULT_PLACE, inCameroon } from "./places";
import type { LatLng } from "./types";

export type LocateResult = { point: LatLng; source: "gps" | "fallback"; reason?: "denied" | "outside" | "error" };

/** Device position if permitted and inside Cameroon; otherwise Douala (or the given fallback). */
export async function locate(fallback: LatLng = DEFAULT_PLACE): Promise<LocateResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return { point: fallback, source: "fallback", reason: "denied" };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (!inCameroon(p.lat, p.lng)) return { point: fallback, source: "fallback", reason: "outside" };
    return { point: p, source: "gps" };
  } catch {
    return { point: fallback, source: "fallback", reason: "error" };
  }
}

/** Free on-device geocoding (Android/iOS system geocoder), biased to Cameroon. */
export async function geocode(query: string): Promise<LatLng | null> {
  const results = await Location.geocodeAsync(`${query}, Cameroun`);
  const hit = results.find((r) => inCameroon(r.latitude, r.longitude));
  return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
}
