# CamRide backend (Supabase)

- `migrations/`: schema (PostGIS), functions/RPCs, RLS. Apply with `supabase db push` (cloud) or `supabase start` / `supabase db reset` (local).
- `seed.sql`: 10 regions, 15 cities, rate cards, 10 `[DEMO]` restaurants with menus.
- `functions/`: Edge Functions (Deno) plus `_shared/` (fare, phone, crypto, payments adapters, webhook processing, matching).
- `tests/`: `fare_fixtures.json` (shared by the TS and SQL tests) and `db/` (migrations + seed + RPC/RLS tests on PGlite + PostGIS).

```bash
cd functions && deno task check && deno lint && deno task test
cd tests/db && npm ci && npm test
```

See ../docs/ARCHITECTURE.md and the root README for setup, env vars and deployment.
