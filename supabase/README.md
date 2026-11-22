# CamRide backend (Supabase)

- `migrations/`: schema (PostGIS), functions/RPCs, RLS, then `…04_platform.sql` (admin, documents + Storage bucket, push outbox, per-city rates, promos, ratings, SOS/support, double-entry ledger, wallets, refunds, payouts, matching scheduler) and `…05_platform_rls.sql`. Apply with `supabase db push`.
- `seed.sql`: 10 regions, 15 cities, rate cards, 10 `[DEMO]` restaurants with menus.
- `functions/`: Edge Functions (Deno) plus `_shared/` (fare, routing/OSRM, phone, crypto, payment adapters with payouts, webhook processing, transfers, push, matching).
  - `request-ride`, `create-order`, `match-driver`, `payments-initiate`: app calls.
  - `payments-webhook`, `trip-share`: public (`--no-verify-jwt`).
  - `notify`: sends pending push notifications (service role; scheduled by `sql/schedule_notify.sql`).
  - `payouts-process`, `refunds-process`: admin dashboard only.
- `sql/schedule_notify.sql`: run once after deploying `notify` (pg_cron + pg_net + Vault).
- `tests/`: `fare_fixtures.json` (shared by TS and SQL tests) and `db/` (migrations + seed + RPC/RLS tests on PGlite + PostGIS).

```bash
cd functions && deno check */index.ts tests/*.ts && deno lint && deno test --allow-read tests/
cd tests/db && npm ci && npm test
```

Matching runs in the database: `run_matching()` every 10 s via pg_cron (enable the extension before `db push`; check with `select * from cron.job`).
First admin: create an email user in Authentication, then `update public.profiles set role = 'admin' where id = '<uuid>';`.

See ../docs/ARCHITECTURE.md and the root README for setup, env vars and deployment.
