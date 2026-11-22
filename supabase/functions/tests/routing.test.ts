import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { decodePolyline, encodePolyline, getRoute } from "../_shared/routing.ts";
import { estimateRoute } from "../_shared/fare.ts";
import { fakeFetch } from "./helpers.ts";

const A = { lat: 4.0511, lng: 9.7679 }; // Douala
const B = { lat: 4.09, lng: 9.74 };

Deno.test("polyline6 round-trips (Google algorithm, 1e6 precision)", () => {
  const pts = [A, { lat: 4.06, lng: 9.75 }, B, { lat: -1.5, lng: -0.25 }];
  const back = decodePolyline(encodePolyline(pts));
  assertEquals(back.length, pts.length);
  back.forEach((p, i) => {
    assertAlmostEquals(p.lat, pts[i].lat, 1e-6);
    assertAlmostEquals(p.lng, pts[i].lng, 1e-6);
  });
  // Known vector from the polyline spec (precision 5): (38.5,-120.2),(40.7,-120.95),(43.252,-126.453)
  assertEquals(encodePolyline([{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }], 5), "_p~iF~ps|U_ulLnnqC_mqNvxq`@");
});

Deno.test("no ROUTING_URL -> haversine x1.3 estimate with a straight line", async () => {
  const r = await getRoute(A, B, { url: "" });
  assertEquals(r.source, "estimate");
  assertEquals(decodePolyline(r.polyline).length, 2);
  assertEquals(r.distanceKm, estimateRoute(A, B).distanceKm);
  assertAlmostEquals(r.distanceKm, 6.91, 0.05);
});

Deno.test("OSRM route: distance, duration x factor, polyline6 geometry and request format", async () => {
  const geometry = encodePolyline([A, { lat: 4.07, lng: 9.76 }, B]);
  const f = fakeFetch([[/route\/v1\/driving/, () => ({ body: { code: "Ok", routes: [{ distance: 7420.5, duration: 900, geometry }] } })]]);
  const r = await getRoute(A, B, { url: "https://osrm.example/", durationFactor: 1.2, fetchFn: f.fetch });
  assertEquals(r, { distanceKm: 7.42, durationMin: 18, polyline: geometry, source: "osrm" });
  assertEquals(f.calls[0].url, "https://osrm.example/route/v1/driving/9.7679,4.0511;9.74,4.09?overview=full&geometries=polyline6");
});

Deno.test("OSRM errors fall back to the estimate", async () => {
  const f = fakeFetch([[/route/, () => ({ status: 400, body: { code: "NoRoute" } })]]);
  const r = await getRoute(A, B, { url: "https://osrm.example", fetchFn: f.fetch });
  assertEquals(r.source, "estimate");
});
