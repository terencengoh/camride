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
const DRIVER2 = "44444444-4444-4444-8444-444444444444";
const ADMIN = "55555555-5555-4555-8555-555555555555";
const OWNER = "66666666-6666-4666-8666-666666666666";

async function asService(fn) {
  await db.exec(`set role service_role; select set_config('request.jwt.claim.role', 'service_role', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.role', '', false);`); }
}

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
    -- Supabase's default privileges: API roles get table + function access unless a migration revokes it.
    grant usage on schema public, extensions, auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth, extensions to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
  `);
  const migrations = readdirSync(new URL("migrations/", root)).filter((f) => f.endsWith(".sql")).sort();
  for (const m of migrations) await db.exec(read(`migrations/${m}`));
  await db.exec(read("seed.sql"));
  await db.exec(`insert into auth.users (id, phone) values ('${RIDER}', '237677000001'), ('${RIDER2}', '237699000002'), ('${DRIVER}', '237652000003'), ('${DRIVER2}', '237677000004'), ('${ADMIN}', '237677000005'), ('${OWNER}', '237699000006');`);
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

// ---------------------------------------------------------------------------------------------
// Platform: admin, documents, notifications, promos, ledger, refunds, payouts, matching scheduler
// ---------------------------------------------------------------------------------------------
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const balance = async (kind, owner = null, restaurant = null) =>
  Number((await one(`select coalesce(-sum(e.amount_xaf), 0)::int b from public.ledger_entries e join public.ledger_accounts a on a.id = e.account_id
    where a.kind = $1 and a.owner_id is not distinct from $2 and a.restaurant_id is not distinct from $3`, [kind, owner, restaurant])).b);
const insertTrip = async (fields) => {
  const f = { rider: RIDER, driver: null, status: "requested", fare: 2000, discount: 0, method: "mtn", ...fields };
  return (await one(`insert into public.trips (rider_id, driver_id, vehicle_type, status, pickup, pickup_lat, pickup_lng, dropoff, dropoff_lat, dropoff_lng,
      distance_km, duration_min, fare_xaf, discount_xaf, payment_method)
    values ($1, $2, 'moto', $3, public.make_point(4.0511, 9.7679), 4.0511, 9.7679, public.make_point(4.09, 9.74), 4.09, 9.74, 6.2, 16.9, $4, $5, $6) returning id`,
    [f.rider, f.driver, f.status, f.fare, f.discount, f.method])).id;
};

test("admin role is granted only by service role; admin RPCs reject other users", async () => {
  await asService(() => db.query(`update public.profiles set role = 'admin' where id = $1`, [ADMIN]));
  assert.equal((await one(`select role from public.profiles where id = $1`, [ADMIN])).role, "admin");
  await assert.rejects(as(RIDER, () => db.query(`select public.admin_set_suspended($1, true, 'x')`, [RIDER2])), /admin only/);
  await as(ADMIN, () => db.query(`select public.admin_set_suspended($1, true, 'fraud')`, [RIDER2]));
  assert.equal((await one(`select suspended from public.profiles where id = $1`, [RIDER2])).suspended, true);
  await as(ADMIN, () => db.query(`select public.admin_set_suspended($1, false)`, [RIDER2]));
  assert.ok(Number((await one(`select count(*)::int n from public.admin_audit where admin_id = $1`, [ADMIN])).n) >= 2);
  assert.equal((await as(RIDER, () => db.query(`select * from public.admin_audit`))).rows.length, 0);
});

test("per-city rate cards override the default rate card", async () => {
  const def = (await one(`select public.fare_quote('moto', 5, 10, 'douala') f`)).f;
  await as(ADMIN, () => db.query(`insert into public.city_rate_cards (city_id, key, base_xaf, per_km_xaf, per_min_xaf, minimum_xaf) values ('douala', 'moto', 200, 120, 10, 300)`));
  await assert.rejects(as(RIDER, () => db.query(`insert into public.city_rate_cards (city_id, key, base_xaf, per_km_xaf, minimum_xaf) values ('yaounde', 'moto', 1, 1, 1)`)), /row-level security/);
  const city = (await one(`select public.fare_quote('moto', 5, 10, 'douala') f`)).f;
  const other = (await one(`select public.fare_quote('moto', 5, 10, 'yaounde') f`)).f;
  assert.equal(def, other);
  assert.equal(city, 900); // 200 + 5*120 + 10*10
  await db.query(`delete from public.city_rate_cards`);
});

test("driver documents: own folder only, review is admin-only, all approved -> verified", async () => {
  await as(DRIVER2, () => db.query(`select public.register_driver('moto', 'Haojue 125', 'ce 456 cd', 'red', true)`));
  await assert.rejects(as(DRIVER2, () => db.query(`insert into public.driver_documents (driver_id, doc_type, storage_path) values ($1, 'id_card', $2)`,
    [DRIVER2, `${DRIVER}/id.jpg`])), /own_folder/);
  for (const t of ["id_card", "driving_licence", "profile_photo"]) {
    await as(DRIVER2, () => db.query(`insert into public.driver_documents (driver_id, doc_type, storage_path, status) values ($1, $2, $3, 'approved')`,
      [DRIVER2, t, `${DRIVER2}/${t}.jpg`]));
  }
  const st = await as(DRIVER2, () => db.query(`select doc_type, required, status from public.driver_document_status() order by doc_type`));
  assert.ok(st.rows.every((r) => r.required && r.status === "pending"), JSON.stringify(st.rows)); // client cannot self-approve
  await assert.rejects(as(ADMIN, () => db.query(`select public.admin_set_driver_verified($1, true)`, [DRIVER2])), /not approved/);
  const docs = (await db.query(`select id from public.driver_documents where driver_id = $1`, [DRIVER2])).rows;
  for (const d of docs) await as(ADMIN, () => db.query(`select public.admin_review_document($1, true)`, [d.id]));
  assert.equal((await one(`select documents_verified from public.drivers where id = $1`, [DRIVER2])).documents_verified, true);
  assert.equal((await one(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'driver_verified'`, [DRIVER2])).n, 1);
  await as(DRIVER2, async () => {
    await db.query(`select public.set_driver_status('available')`);
    await db.query(`select public.update_my_location(4.0560, 9.7720, 0)`);
  });
});

test("push tokens and notification outbox are private to each user", async () => {
  await assert.rejects(as(RIDER, () => db.query(`select public.register_push_token('not-a-token')`)), /invalid Expo push token/);
  await as(RIDER, () => db.query(`select public.register_push_token('ExponentPushToken[abc123]', 'android')`));
  assert.equal((await as(RIDER, () => db.query(`select * from public.push_tokens`))).rows.length, 1);
  assert.equal((await as(RIDER2, () => db.query(`select * from public.push_tokens`))).rows.length, 0);
  await assert.rejects(as(RIDER, () => db.query(`select public.notify_user($1, 'x', 'a', 'b', 'c', 'd')`, [RIDER2])), /permission denied/);
  await as(RIDER, () => db.query(`update public.profiles set lang = 'en' where id = $1`, [RIDER]));
});

test("promo codes: quote, cap, per-user limit; clients cannot redeem directly", async () => {
  assert.equal((await as(RIDER, () => one(`select public.check_promo('bienvenue', 'ride', 2000) d`))).d, 400);
  assert.equal((await as(RIDER, () => one(`select public.check_promo('BIENVENUE', 'food', 8000) d`))).d, 1000);
  await assert.rejects(as(RIDER, () => db.query(`select public.check_promo('BIENVENUE', 'ride', 300)`)), /minimum/);
  await assert.rejects(as(RIDER, () => db.query(`select public.check_promo('NOPE', 'ride', 3000)`)), /invalid promo/);
  await assert.rejects(as(RIDER, () => db.query(`select public.redeem_promo('BIENVENUE', $1, 'ride', 3000)`, [RIDER])), /permission denied/);
  assert.equal((await as(RIDER, () => db.query(`select * from public.promo_codes`))).rows.length, 0);
});

test("ledger: cash trip settled with commission owed by the driver; ledger is balanced and append-only", async () => {
  // The cash trip from the lifecycle test: fare 1100, commission 15% = 165, driver kept the cash.
  assert.equal(await balance("driver_wallet", DRIVER), -165);
  assert.equal(await balance("platform_revenue"), 165);
  const s = await one(`select coalesce(sum(amount_xaf), 0)::int s from public.ledger_entries`);
  assert.equal(s.s, 0);
  await assert.rejects(db.query(`select public.ledger_post('adjustment', jsonb_build_array(public.entry(public.acct('adjustments'), 10)))`), /unbalanced/);
  await assert.rejects(db.query(`update public.ledger_entries set amount_xaf = 1`), /append-only/);
  await assert.rejects(db.query(`delete from public.ledger_transactions`), /append-only/);
  await assert.rejects(as(DRIVER, () => db.query(`select public.settle_trip(gen_random_uuid())`)), /permission denied/);
  assert.equal((await as(DRIVER, () => db.query(`select * from public.ledger_entries`))).rows.length, 0);
});

let mmTrip, mmPayment;
test("ledger: mobile money trip with promo -> payment received, settlement, notifications", async () => {
  await db.query(`update public.platform_settings set value = 15 where key = 'commission_ride_pct'`);
  mmTrip = await insertTrip({ driver: DRIVER, status: "completed", fare: 5000, discount: 200, method: "mtn" });
  mmPayment = (await one(`insert into public.payments (payer_id, trip_id, amount_xaf, method, provider, phone, status)
    values ($1, $2, 4800, 'mtn', 'campay', '237677777777', 'pending') returning id`, [RIDER, mmTrip])).id;
  await asService(async () => {
    await db.query(`update public.payments set status = 'successful', provider_ref = 'cp-1' where id = $1`, [mmPayment]);
    await db.query(`update public.trips set payment_status = 'paid' where id = $1`, [mmTrip]);
    await db.query(`update public.trips set payment_status = 'paid' where id = $1`, [mmTrip]); // idempotent
  });
  assert.equal((await one(`select count(*)::int n from public.ledger_transactions where trip_id = $1 and kind = 'trip_settlement'`, [mmTrip])).n, 1);
  assert.equal(await balance("driver_wallet", DRIVER), -165 + 4250);          // fare 5000 - 750 commission
  assert.equal(await balance("platform_revenue"), 165 + 750);
  assert.equal(await balance("platform_promotions"), -200);                   // debit: promo cost
  assert.equal(await balance("customer_deposits"), 0);
  assert.equal(await balance("psp_clearing"), -4800);                         // debit: money held at the PSP
  const n = (await db.query(`select kind, title from public.notifications where user_id = $1 and kind = 'payment_result'`, [RIDER])).rows;
  assert.deepEqual(n, [{ kind: "payment_result", title: "Payment received" }]); // rider switched to English
  const w = await as(DRIVER, () => db.query(`select kind, balance_xaf::int b from public.my_wallets()`));
  assert.deepEqual(w.rows, [{ kind: "driver_wallet", b: 4085 }]);
  const acctId = (await one(`select id from public.ledger_accounts where owner_id = $1`, [DRIVER])).id;
  const stmt = await as(DRIVER, () => db.query(`select kind, amount_xaf::int a from public.my_ledger($1)`, [acctId]));
  assert.deepEqual(stmt.rows.map((r) => r.a), [4250, -165]);
});

test("refunds: admin only, capped at refundable amount, proportional reversal on success", async () => {
  await assert.rejects(as(RIDER, () => db.query(`select public.admin_create_refund($1, 100, 'test')`, [mmPayment])), /admin only/);
  const cashPay = (await one(`select id from public.payments where method = 'cash' limit 1`)).id;
  await assert.rejects(as(ADMIN, () => db.query(`select public.admin_create_refund($1, 100, 'test')`, [cashPay])), /cash payments/);
  await assert.rejects(as(ADMIN, () => db.query(`select public.admin_create_refund($1, 5000, 'too much')`, [mmPayment])), /exceeds refundable/);
  const r = (await as(ADMIN, () => one(`select (public.admin_create_refund($1, 900, 'late driver')).id`, [mmPayment]))).id;
  await assert.rejects(as(ADMIN, () => db.query(`select public.admin_create_refund($1, 3901, 'second')`, [mmPayment])), /exceeds refundable/);
  await as(ADMIN, () => db.query(`select public.refund_mark_processing($1, 'campay')`, [r]));
  await asService(() => db.query(`select public.refund_set_result($1, 'succeeded', 'cp-wd-1')`, [r]));
  await asService(() => db.query(`select public.refund_set_result($1, 'succeeded', 'cp-wd-1')`, [r])); // idempotent
  // 900/4800 = 18.75% of the settlement reversed: wallet -797, revenue -141, promo -38; PSP pays out 900.
  assert.equal(await balance("driver_wallet", DRIVER), 4085 - 797);
  assert.equal(await balance("platform_revenue"), 915 - 141);
  assert.equal(await balance("platform_promotions"), -200 + 38);
  assert.equal(await balance("psp_clearing"), -4800 + 900);
  assert.equal((await one(`select coalesce(sum(amount_xaf), 0)::int s from public.ledger_entries`)).s, 0);
  assert.equal((await as(RIDER, () => db.query(`select status from public.refunds`))).rows[0].status, "succeeded");
  assert.equal((await as(RIDER2, () => db.query(`select * from public.refunds`))).rows.length, 0);
  // Failed refunds free up the refundable amount again.
  const r2 = (await as(ADMIN, () => one(`select (public.admin_create_refund($1, 3900, 'retry')).id`, [mmPayment]))).id;
  await as(ADMIN, () => db.query(`select public.refund_mark_processing($1, 'campay')`, [r2]));
  await asService(() => db.query(`select public.refund_set_result($1, 'failed', null, 'FAILED')`, [r2]));
  assert.equal(await balance("driver_wallet", DRIVER), 3288);
});

test("payouts: validation, hold, reject/release, approve -> paid, failed -> released", async () => {
  const acct = (await one(`select id from public.ledger_accounts where owner_id = $1`, [DRIVER])).id;
  const req = (amount, phone = "237677777777", method = "mtn", who = DRIVER) =>
    as(who, () => one(`select (public.request_payout($1, $2, $3, $4)).id`, [acct, amount, phone, method]));
  await assert.rejects(req(500), /minimum payout/);
  await assert.rejects(req(5000), /insufficient balance/);
  await assert.rejects(req(2000, "237699999999", "mtn"), /does not match/);
  await assert.rejects(req(2000, "237677777777", "mtn", RIDER), /not your wallet/);
  const p1 = (await req(3000)).id;
  assert.equal(await balance("driver_wallet", DRIVER), 288);
  assert.equal(await balance("payouts_pending"), 3000);
  await assert.rejects(req(1000), /insufficient balance|duplicate key/);
  assert.ok(Number((await one(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'payout_request'`, [ADMIN])).n) >= 1);
  await assert.rejects(as(DRIVER, () => db.query(`select public.admin_review_payout($1, true)`, [p1])), /admin only/);
  await as(ADMIN, () => db.query(`select public.admin_review_payout($1, false, 'name mismatch')`, [p1]));
  assert.equal(await balance("driver_wallet", DRIVER), 3288);

  const p2 = (await req(2000, "237699999999", "orange")).id;
  await as(ADMIN, () => db.query(`select public.admin_review_payout($1, true)`, [p2]));
  await as(ADMIN, () => db.query(`select public.payout_mark_processing($1, 'campay')`, [p2]));
  await asService(() => db.query(`select public.payout_set_result($1, 'paid', 'cp-wd-2')`, [p2]));
  await asService(() => db.query(`select public.payout_set_result($1, 'paid', 'cp-wd-2')`, [p2])); // idempotent
  assert.equal(await balance("driver_wallet", DRIVER), 1288);
  assert.equal(await balance("payouts_pending"), 0);
  assert.equal(await balance("psp_clearing"), -3900 + 2000);

  const p3 = (await req(1000)).id;
  await as(ADMIN, () => db.query(`select public.admin_review_payout($1, true)`, [p3]));
  await as(ADMIN, () => db.query(`select public.payout_mark_processing($1, 'notchpay')`, [p3]));
  await asService(() => db.query(`select public.payout_set_result($1, 'failed', 'np-1', 'failed')`, [p3]));
  assert.equal(await balance("driver_wallet", DRIVER), 1288);
  const mine = await as(DRIVER, () => db.query(`select status from public.payout_requests order by created_at`));
  assert.deepEqual(mine.rows.map((r) => r.status), ["rejected", "paid", "failed"]);
  assert.equal((await as(RIDER, () => db.query(`select * from public.payout_requests`))).rows.length, 0);
  assert.equal((await one(`select coalesce(sum(amount_xaf), 0)::int s from public.ledger_entries`)).s, 0);
});

test("orders: restaurant/courier split, restaurant wallet visible to its owner, restaurant rating", async () => {
  const rest = (await one(`select id from public.restaurants where name like '%Ndolé%'`)).id;
  await db.query(`update public.restaurants set owner_id = $1 where id = $2`, [OWNER, rest]);
  const o = (await one(`insert into public.orders (customer_id, restaurant_id, courier_id, status, delivery_location, delivery_lat, delivery_lng,
      distance_km, subtotal_xaf, delivery_fee_xaf, discount_xaf, total_xaf, payment_method)
    values ($1, $2, $3, 'placed', public.make_point(4.06, 9.78), 4.06, 9.78, 2.1, 5000, 1000, 0, 6000, 'orange') returning id`, [RIDER, rest, DRIVER2])).id;
  assert.equal((await one(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'order_status'`, [OWNER])).n, 1);
  await asService(async () => {
    await db.query(`insert into public.payments (payer_id, order_id, amount_xaf, method, provider, phone, status) values ($1, $2, 6000, 'orange', 'notchpay', '237699999999', 'successful')`, [RIDER, o]);
    await db.query(`update public.orders set payment_status = 'paid', status = 'delivered' where id = $1`, [o]);
  });
  assert.equal(await balance("restaurant_wallet", null, rest), 4400);   // 5000 - 12%
  assert.equal(await balance("driver_wallet", DRIVER2), 850);           // 1000 - 15%
  const w = await as(OWNER, () => db.query(`select kind, balance_xaf::int b from public.my_wallets()`));
  assert.deepEqual(w.rows, [{ kind: "restaurant_wallet", b: 4400 }]);
  assert.equal((await as(RIDER, () => db.query(`select * from public.my_wallets()`))).rows.length, 0);

  await assert.rejects(as(RIDER2, () => db.query(`select public.rate_order($1, 5::smallint)`, [o])), /not your order/);
  await as(RIDER, () => db.query(`select public.rate_order($1, 4::smallint, 5::smallint, 'Délicieux')`, [o]));
  const r = await one(`select rating_avg::float8 a, rating_count n from public.restaurants where id = $1`, [rest]);
  assert.deepEqual(r, { a: 4, n: 1 });
  assert.equal((await as(RIDER2, () => db.query(`select stars from public.restaurant_ratings`))).rows[0].stars, 4);
  // Owners cannot reset their own rating or reactivate.
  await as(OWNER, () => db.query(`update public.restaurants set rating_avg = 5, rating_count = 99 where id = $1`, [rest]));
  assert.equal((await one(`select rating_count n from public.restaurants where id = $1`, [rest])).n, 1);
});

test("matching scheduler: offers nearest, expires and re-offers, then gives up", async () => {
  await assert.rejects(as(RIDER, () => db.query(`select public.run_matching()`)), /permission denied/);
  await db.query(`update public.drivers set status = 'available', location_updated_at = now() where id in ($1, $2)`, [DRIVER, DRIVER2]);
  const trip = await insertTrip({ status: "requested", fare: 1500, method: "cash" });
  const run = () => asService(() => one(`select public.run_matching() r`)).then((x) => x.r);
  let r = await run();
  assert.equal(r.trips_offered, 1);
  let t = await one(`select status, offered_driver_id, declined_driver_ids from public.trips where id = $1`, [trip]);
  assert.equal(t.status, "offered");
  assert.equal(t.offered_driver_id, DRIVER); // DRIVER is closer to the pickup than DRIVER2
  assert.equal((await one(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'ride_offer'`, [DRIVER])).n, 1);
  // Live offer is not re-offered.
  r = await run();
  assert.equal(r.trips_offered, 0);
  // Offer expires -> next nearest driver.
  await db.query(`update public.trips set offer_expires_at = now() - interval '1 second' where id = $1`, [trip]);
  r = await run();
  t = await one(`select status, offered_driver_id, declined_driver_ids from public.trips where id = $1`, [trip]);
  assert.equal(t.offered_driver_id, DRIVER2);
  assert.deepEqual(t.declined_driver_ids, [DRIVER]);
  // Second expiry: nobody left -> back to requested while within give_up_minutes.
  await db.query(`update public.trips set offer_expires_at = now() - interval '1 second' where id = $1`, [trip]);
  r = await run();
  t = await one(`select status, offered_driver_id from public.trips where id = $1`, [trip]);
  assert.deepEqual(t, { status: "requested", offered_driver_id: null });
  // After give_up_minutes -> no_drivers + rider notified.
  await db.query(`update public.trips set created_at = now() - interval '10 minutes' where id = $1`, [trip]);
  r = await run();
  assert.equal(r.trips_gave_up, 1);
  assert.equal((await one(`select status from public.trips where id = $1`, [trip])).status, "no_drivers");
  assert.equal((await one(`select count(*)::int n from public.notifications where user_id = $1 and data->>'trip_id' = $2`, [RIDER, trip])).n, 1);
});

test("matching excludes suspended drivers; suspended drivers cannot go online", async () => {
  await as(ADMIN, () => db.query(`select public.admin_set_suspended($1, true, 'docs expired')`, [DRIVER2]));
  assert.equal((await one(`select status from public.drivers where id = $1`, [DRIVER2])).status, "offline");
  await assert.rejects(as(DRIVER2, () => db.query(`select public.set_driver_status('available')`)), /suspended/);
  await db.query(`update public.drivers set status = 'available', location_updated_at = now() where id = $1`, [DRIVER]);
  const ids = (await db.query(`select driver_id from public.nearest_available_drivers(4.0511, 9.7679)`)).rows.map((r) => r.driver_id);
  assert.deepEqual(ids, [DRIVER]);
  await as(ADMIN, () => db.query(`select public.admin_set_suspended($1, false)`, [DRIVER2]));
});

test("courier re-matching for ready orders", async () => {
  await db.query(`update public.drivers set status = 'available', location_updated_at = now() where id = $1`, [DRIVER2]);
  const rest = (await one(`select id from public.restaurants where name like '%Ndolé%'`)).id;
  const o = (await one(`insert into public.orders (customer_id, restaurant_id, status, delivery_location, delivery_lat, delivery_lng,
      distance_km, subtotal_xaf, delivery_fee_xaf, total_xaf, payment_method)
    values ($1, $2, 'ready', public.make_point(4.06, 9.78), 4.06, 9.78, 2.1, 3000, 700, 3700, 'cash') returning id`, [RIDER2, rest])).id;
  const r = (await asService(() => one(`select public.run_matching() r`))).r;
  assert.equal(r.orders_offered, 1);
  assert.equal((await one(`select offered_courier_id from public.orders where id = $1`, [o])).offered_courier_id, DRIVER2); // only courier
  await db.query(`update public.orders set offer_expires_at = now() - interval '1 second' where id = $1`, [o]);
  await asService(() => db.query(`select public.run_matching()`));
  const after = await one(`select offered_courier_id, declined_courier_ids from public.orders where id = $1`, [o]);
  assert.deepEqual(after, { offered_courier_id: null, declined_courier_ids: [DRIVER2] });
});

test("SOS, support tickets and share links", async () => {
  const trip = await insertTrip({ driver: DRIVER, status: "in_progress", fare: 1200, method: "cash" });
  await assert.rejects(as(RIDER2, () => db.query(`select public.trigger_sos($1)`, [trip])), /not your trip/);
  await as(RIDER, () => db.query(`select public.trigger_sos($1, 4.05, 9.76, 'help')`, [trip]));
  assert.ok(Number((await one(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'sos'`, [ADMIN])).n) >= 1);
  await as(RIDER, () => db.query(`insert into public.support_tickets (user_id, subject, message, status, admin_reply) values ($1, 'Lost phone', 'Left it in the car', 'closed', 'hack')`, [RIDER]));
  const tk = await one(`select id, status, admin_reply from public.support_tickets`);
  assert.deepEqual({ s: tk.status, r: tk.admin_reply }, { s: "open", r: null });
  await as(ADMIN, () => db.query(`update public.support_tickets set admin_reply = 'We contacted the driver', status = 'in_progress' where id = $1`, [tk.id]));
  assert.equal((await one(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'support_reply'`, [RIDER])).n, 1);
  assert.equal((await as(RIDER2, () => db.query(`select * from public.support_tickets`))).rows.length, 0);
  const token = (await one(`select share_token from public.trips where id = $1`, [trip])).share_token;
  const info = (await asService(() => one(`select public.trip_share_info($1) i`, [token]))).i;
  assert.equal(info.status, "in_progress");
  assert.ok(info.driver_position && !("rider_id" in info));
  await db.exec("set role anon");
  try { await assert.rejects(db.query(`select public.trip_share_info($1)`, [token]), /permission denied/); } finally { await db.exec("reset role"); }
});

test("admin dashboard: direct table writes work for admins and are blocked for everyone else", async () => {
  const rest = (await one(`select id from public.restaurants order by name limit 1`)).id;
  const veh = (await one(`select vehicle_id from public.drivers where id = $1`, [DRIVER])).vehicle_id;
  // Non-admins: RLS filters the rows, nothing changes.
  await as(RIDER, async () => {
    await db.query(`update public.restaurants set active = false where id = $1`, [rest]);
    await db.query(`update public.platform_settings set value = 99 where key = 'commission_ride_pct'`);
    await db.query(`update public.vehicles set verified = false where id = $1`, [veh]);
    await assert.rejects(db.query(`insert into public.city_rate_cards (city_id, key, base_xaf, per_km_xaf, minimum_xaf) values ('kribi', 'car', 1, 1, 1)`), /row-level security/);
    assert.equal((await db.query(`select * from public.admin_account_balances where kind = 'platform_revenue'`)).rows.length, 0);
  });
  assert.equal((await one(`select active from public.restaurants where id = $1`, [rest])).active, true);
  assert.equal(Number((await one(`select value from public.platform_settings where key = 'commission_ride_pct'`)).value), 15);
  // Admin: the dashboard's writes go through.
  await as(ADMIN, async () => {
    await db.query(`update public.restaurants set active = false where id = $1`, [rest]);
    await db.query(`update public.menu_items set available = false where restaurant_id = $1`, [rest]);
    await db.query(`update public.vehicles set verified = true where id = $1`, [veh]);
    await db.query(`insert into public.city_rate_cards (city_id, key, base_xaf, per_km_xaf, minimum_xaf) values ('kribi', 'car', 600, 300, 900)`);
    await db.query(`update public.platform_settings set value = 15 where key = 'commission_ride_pct'`);
    await db.query(`update public.sos_events set status = 'resolved', resolved_at = now(), resolved_by = $1`, [ADMIN]);
    await db.query(`insert into public.promo_codes (code, kind, value) values ('ADMINTEST', 'fixed', 200)`);
    assert.ok((await db.query(`select * from public.admin_account_balances where kind = 'platform_revenue'`)).rows.length === 1);
    assert.ok((await db.query(`select id from public.ledger_transactions`)).rows.length > 0);
  });
  assert.equal((await one(`select active from public.restaurants where id = $1`, [rest])).active, false);
  // Owners cannot re-activate a restaurant an admin suspended.
  await db.query(`update public.restaurants set owner_id = $1 where id = $2`, [OWNER, rest]);
  await as(OWNER, () => db.query(`update public.restaurants set active = true, is_open = false where id = $1`, [rest]));
  const r = await one(`select active, is_open from public.restaurants where id = $1`, [rest]);
  assert.deepEqual({ a: r.active, o: r.is_open }, { a: false, o: false });
  assert.equal((await one(`select count(*)::int n from public.sos_events where status = 'open'`)).n, 0);
  await db.query(`update public.restaurants set active = true, is_open = true, owner_id = null where id = $1`, [rest]);
  await db.query(`update public.menu_items set available = true where restaurant_id = $1`, [rest]);
});
