import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { computeFare, estimateRoute, haversineKm, inCameroon, type RateCard, roundXaf } from "../_shared/fare.ts";

const fixtures = JSON.parse(await Deno.readTextFile(new URL("../../tests/fare_fixtures.json", import.meta.url))) as {
  rate_cards: Record<string, RateCard>;
  cases: { key: string; distance_km: number; duration_min: number; expected: number }[];
};

Deno.test("fare fixtures (shared with the SQL fare_quote test)", () => {
  for (const c of fixtures.cases) {
    assertEquals(computeFare(fixtures.rate_cards[c.key], c.distance_km, c.duration_min), c.expected, JSON.stringify(c));
  }
});

Deno.test("roundXaf rounds half up to 50", () => {
  assertEquals(roundXaf(1524), 1500);
  assertEquals(roundXaf(1525), 1550);
  assertEquals(roundXaf(1574.9), 1550);
  assertEquals(roundXaf(0), 0);
});

Deno.test("computeFare rejects negative or NaN inputs", () => {
  assertThrows(() => computeFare(fixtures.rate_cards.car, -1, 0), RangeError);
  assertThrows(() => computeFare(fixtures.rate_cards.car, Number.NaN, 0), RangeError);
});

Deno.test("haversine Douala -> Yaoundé is about 200 km", () => {
  const km = haversineKm({ lat: 4.0511, lng: 9.7679 }, { lat: 3.848, lng: 11.5021 });
  assertEquals(Math.round(km / 10), 19); // ~193 km
});

Deno.test("estimateRoute applies x1.3 road factor and 2-minute minimum", () => {
  const r = estimateRoute({ lat: 4.0511, lng: 9.7679 }, { lat: 4.0511, lng: 9.7679 });
  assertEquals(r, { distanceKm: 0, durationMin: 2 });
});

Deno.test("inCameroon bounds", () => {
  assertEquals(inCameroon({ lat: 4.05, lng: 9.77 }), true); // Douala
  assertEquals(inCameroon({ lat: 10.6, lng: 14.32 }), true); // Maroua
  assertEquals(inCameroon({ lat: 32.78, lng: -96.8 }), false); // Dallas
});
