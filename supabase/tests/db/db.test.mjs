// Runs the real migrations + seed in PGlite (WASM Postgres + PostGIS) with minimal Supabase stubs
// (auth schema, auth.uid()/auth.role(), anon/authenticated/service_role roles), then exercises
// pricing, nearest-driver search, the trip lifecycle RPCs and key RLS rules.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
let db;

const RIDER = "11111111-1111-4111-8111-111111111111";
const RIDER2 = "22222222-2222-4222-8222-222222222222";
const DRIVER = "33333333-3333-4333-8333-333333333333";

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); select set_config('request.jwt.claim.role', 'authenticated', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`); }
}

before(async () => {
  db = await PGlite.create({ extensions: { postgis } });
  await db.exec(`
    create schema if not exists extensions;
    create schema auth;
    create table auth.users (id uuid primary key, phone text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  `);
  const migrations = readdirSync(new URL("migrations/", root)).filter((f) => f.endsWith(".sql")).sort();
  for (const m of migrations) await db.exec(read(`migrations/${m}`));
  await db.exec(read("seed.sql"));
  // Supabase grants these by default.
  await db.exec(`
    grant usage on schema public, extensions, auth to anon, authenticated, service_role;
    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
    grant select on all tables in schema public to anon;
    revoke update on public.profiles from authenticated;
    grant update (full_name, role, city_id, lang) on public.profiles to authenticated;
    grant execute on all functions in schema public, auth, extensions to anon, authenticated, service_role;
    revoke execute on function public.nearest_available_drivers(double precision, double precision, public.vehicle_type, boolean, integer, integer, uuid[]) from anon, authenticated;
  `);
  await db.exec(`insert into auth.users (id, phone) values ('${RIDER}', '237677000001'), ('${RIDER2}', '237699000002'), ('${DRIVER}', '237652000003');`);
});

after(async () => { await db?.close(); });

test("seed: 10 regions, each with a capital city, plus extra cities", async () => {
  const r = await db.query(`select count(*)::int n, count(capital_city_id)::int caps from public.regions`);
  assert.deepEqual(r.rows[0], { n: 10, caps: 10 });
  const c = await db.query(`select count(*)::int n from public.cities`);
  assert.equal(c.rows[0].n, 15);
});

test("SQL fare_quote matches shared fixtures", async () => {
  const fx = JSON.parse(read("tests/fare_fixtures.json"));
  for (const c of fx.cases) {
    const { rows } = await db.query(`select public.fare_quote($1, $2, $3) as fare`, [c.key, c.distance_km, c.duration_min]);
    assert.equal(rows[0].fare, c.expected, JSON.stringify(c));
  }
});

test("quote_trip returns a quote per ride type and rejects points outside Cameroon", async () => {
  const { rows } = await db.query(`select * from public.quote_trip(4.0511, 9.7679, 4.0900, 9.7400) order by fare_xaf`);
  assert.deepEqual(rows.map((r) => r.vehicle_type), ["moto", "car", "comfort"]);
  assert.ok(rows.every((r) => r.fare_xaf % 50 === 0));
  await assert.rejects(db.query(`select * from public.quote_trip(32.7, -96.8, 4.09, 9.74)`), /Cameroon/);
});

test("driver registration, verification gate, location and nearest search", async () => {
  await as(DRIVER, () => db.query(`select public.register_driver('moto', 'Nanfang 125', 'lt 123 ab', null, false)`));
  await assert.rejects(as(DRIVER, () => db.query(`select public.set_driver_status('available')`)), /not verified/);
  await db.query(`update public.drivers set documents_verified = true where id = $1`, [DRIVER]);
  await as(DRIVER, async () => {
    await db.query(`select public.set_driver_status('available')`);
    await db.query(`select public.update_my_location(4.0530, 9.7690, 90)`);
  });
  const { rows } = await db.query(`select * from public.nearest_available_drivers(4.0511, 9.7679, 'moto')`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].driver_id, DRIVER);
  assert.ok(rows[0].distance_m > 100 && rows[0].distance_m < 400, `distance ${rows[0].distance_m}`);
  const none = await db.query(`select * from public.nearest_available_drivers(4.0511, 9.7679, 'car')`);
  assert.equal(none.rows.length, 0);
  await assert.rejects(as(RIDER, () => db.query(`select * from public.nearest_available_drivers(4.0511, 9.7679, 'moto')`)), /permission denied/);
});

test("trip lifecycle via RPCs, cash settlement, rating, and RLS isolation", async () => {
  const ins = await db.query(`
    insert into public.trips (rider_id, vehicle_type, status, pickup, pickup_lat, pickup_lng, dropoff, dropoff_lat, dropoff_lng,
      distance_km, duration_min, fare_xaf, payment_method, offered_driver_id, offer_expires_at)
    values ($1, 'moto', 'offered', public.make_point(4.0511, 9.7679), 4.0511, 9.7679, public.make_point(4.09, 9.74), 4.09, 9.74,
      6.2, 16.9, 1100, 'cash', $2, now() + interval '30 seconds') returning id`, [RIDER, DRIVER]);
  const tripId = ins.rows[0].id;

  // Another rider cannot see it; the rider and offered driver can.
  assert.equal((await as(RIDER2, () => db.query(`select id from public.trips where id = $1`, [tripId]))).rows.length, 0);
  assert.equal((await as(RIDER, () => db.query(`select id from public.trips where id = $1`, [tripId]))).rows.length, 1);
  assert.equal((await as(DRIVER, () => db.query(`select id from public.trips where id = $1`, [tripId]))).rows.length, 1);
  // Clients cannot write trips directly.
  await as(RIDER, () => db.query(`update public.trips set fare_xaf = 1 where id = $1`, [tripId]));
  assert.equal((await db.query(`select fare_xaf from public.trips where id = $1`, [tripId])).rows[0].fare_xaf, 1100);

  await assert.rejects(as(RIDER2, () => db.query(`select public.accept_trip($1)`, [tripId])), /offer not available/);
  await as(DRIVER, async () => {
    await db.query(`select public.accept_trip($1)`, [tripId]);
    await assert.rejects(db.query(`select public.advance_trip($1, 'completed')`, [tripId]), /invalid transition/);
    await db.query(`select public.advance_trip($1, 'arrived')`, [tripId]);
    await db.query(`select public.advance_trip($1, 'in_progress')`, [tripId]);
  });
  // Rider sees the assigned driver's live position while on the trip.
  const pos = await as(RIDER, () => db.query(`select lat, lng from public.drivers where id = $1`, [DRIVER]));
  assert.equal(pos.rows.length, 1);
  assert.equal((await as(RIDER2, () => db.query(`select lat from public.drivers where id = $1`, [DRIVER]))).rows.length, 0);

  await as(DRIVER, () => db.query(`select public.advance_trip($1, 'completed')`, [tripId]));
  const t = (await db.query(`select status, payment_status from public.trips where id = $1`, [tripId])).rows[0];
  assert.deepEqual(t, { status: "completed", payment_status: "paid" });
  const pay = (await db.query(`select method, status, amount_xaf from public.payments where trip_id = $1`, [tripId])).rows;
  assert.deepEqual(pay, [{ method: "cash", status: "successful", amount_xaf: 1100 }]);
  assert.equal((await db.query(`select status from public.drivers where id = $1`, [DRIVER])).rows[0].status, "available");

  await as(RIDER, () => db.query(`select public.rate_trip($1, 4::smallint, 'ok')`, [tripId]));
  await assert.rejects(as(RIDER, () => db.query(`select public.rate_trip($1, 5::smallint)`, [tripId])), /duplicate key/);
  const d = (await db.query(`select rating_avg::float8 avg, rating_count from public.drivers where id = $1`, [DRIVER])).rows[0];
  assert.deepEqual(d, { avg: 4, rating_count: 1 });
});

test("profiles: users cannot make themselves admin; webhook_events hidden from clients", async () => {
  await assert.rejects(as(RIDER, () => db.query(`update public.profiles set role = 'admin' where id = $1`, [RIDER])), /cannot grant admin/);
  await as(RIDER, () => db.query(`update public.profiles set full_name = 'Test Rider' where id = $1`, [RIDER]));
  assert.equal((await db.query(`select full_name from public.profiles where id = $1`, [RIDER])).rows[0].full_name, "Test Rider");
  await db.query(`insert into public.webhook_events (provider, event_id, payload) values ('campay', 'x', '{}')`);
  assert.equal((await as(RIDER, () => db.query(`select * from public.webhook_events`))).rows.length, 0);
  await assert.rejects(db.query(`insert into public.webhook_events (provider, event_id, payload) values ('campay', 'x', '{}')`), /duplicate key/);
});

test("restaurants_near and delivery fee", async () => {
  const { rows } = await db.query(`select name, distance_km::float8 km, delivery_fee_xaf from public.restaurants_near(4.0511, 9.7679)`);
  assert.ok(rows.length >= 1);
  assert.match(rows[0].name, /Ndolé/);
  assert.ok(rows[0].delivery_fee_xaf >= 500 && rows[0].delivery_fee_xaf % 50 === 0);
});
