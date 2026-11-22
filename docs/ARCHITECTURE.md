# CamRide platform: architecture

This is the production starter that sits next to the static demo (the demo is the repo root and is the only thing published to GitHub Pages).

```
mobile/      Expo (SDK 58) React Native app, TypeScript, Expo Router (routes in src/app)
supabase/    Postgres + PostGIS schema, RLS, RPCs, seed, Edge Functions (Deno), tests
docs/        This file
.github/     pages.yml (demo only) and ci.yml (typecheck, lint, tests)
```

## Components

| Layer | Tech | Responsibility |
|---|---|---|
| App | Expo / React Native, react-native-maps, expo-location, supabase-js | Rider, food customer, driver/courier and restaurant flows. EN/FR, FCFA. No secrets except the public anon key. |
| Auth | Supabase Auth, phone OTP | `signInWithOtp({ phone })` then `verifyOtp({ phone, token, type: "sms" })`. A trigger creates the `profiles` row. |
| Data | Postgres 17 + PostGIS (`extensions` schema) | Tables, RLS, pricing in SQL, nearest-driver search (`ST_DWithin` + `<->` on `geography`). |
| Realtime | Supabase Realtime `postgres_changes` | Apps subscribe to their own `trips`, `orders`, `payments`, and to the driver row they are allowed to see. Realtime applies RLS. |
| Server logic | Supabase Edge Functions (Deno) | Anything that must not be trusted to the client: quotes, ride requests, order totals, matching, payments. |
| Payments | CamPay / Notch Pay adapters (CinetPay stub) | Mobile-money collection (MTN MoMo, Orange Money) via a push/USSD prompt; signed webhooks settle payments. |

## Data model (supabase/migrations)

- `regions` (10) and `cities` (15: the 10 regional capitals + Limbe, Kribi, Kumba, Dschang, Nkongsamba), each city with a `geography` centre.
- `rate_cards`: `moto`, `car`, `comfort`, `delivery` (base, per km, per minute, minimum, max distance).
- `profiles` (1:1 with `auth.users`; role: rider, driver, courier, restaurant, admin), `vehicles`, `drivers` (status, `location geography` + plain `lat/lng` for Realtime payloads, `documents_verified`, rating).
- `trips` (pickup/dropoff, server-side fare, offer state, payment method/status).
- `restaurants`, `menu_items`, `orders`, `order_items`.
- `payments` (one target: trip **or** order; unique `(provider, provider_ref)`), `webhook_events` (unique `(provider, event_id)`, no client access), `ratings`.

## Pricing

`fare = max(minimum, base + per_km x km + per_min x min)`, rounded to the nearest 50 FCFA. The same formula is implemented in SQL (`fare_quote`) and TypeScript (`_shared/fare.ts`), and both are tested against `supabase/tests/fare_fixtures.json`. Distance is currently straight line x 1.3 at 22 km/h (`estimate_route`); swap in a routing API (OSRM self-hosted, Google Routes, Mapbox) for production. Prices are always computed server-side; the client never sends a price.

Seed rate cards (FCFA): Moto 150 + 100/km + 10/min, min 300. Car 500 + 250/km + 20/min, min 1,000. Comfort 1,000 + 400/km + 30/min, min 2,000. Delivery 300 + 150/km, min 500. These are placeholders; set real prices with your drivers and check local rules.

## Flows

**Ride**
1. App calls `request-ride` with `quote_only: true` and shows Moto / Car / Comfort quotes.
2. `request-ride` (real request) recomputes the quote, refuses a second active trip, inserts the trip and calls matching.
3. Matching (`_shared/matching.ts`) calls the `nearest_available_drivers` RPC (service role only) within 5 km for that vehicle type, excluding drivers who declined, and offers the trip for 30 s (`offered_driver_id`, `offer_expires_at`).
4. Driver app sees the offer through Realtime, then calls `accept_trip` or `decline_trip`. `advance_trip` moves accepted, arrived, in_progress, completed. Completing a cash trip records a cash payment.
5. While searching, the rider app calls `match-driver` every 15 s; after 5 minutes the trip becomes `no_drivers`.
6. Mobile money: rider opens the pay sheet, `payments-initiate` sends the prompt, the webhook settles it, and the app sees `payments.status` change through Realtime. Then `rate_trip`.

**Food**
1. `restaurants_near` lists open restaurants; the menu comes from `menu_items`.
2. `create-order` prices items, delivery fee and total from the DB. Mobile-money orders start as `pending_payment`; cash orders start as `placed`.
3. The restaurant accepts (`restaurant_set_order_status`), which calls `match-driver` with `order_id` to offer the delivery to the nearest courier. Then preparing, then ready.
4. The courier accepts (`accept_delivery`), then `courier_advance_order` moves it to picked_up and delivered (cash settles on delivery).

## Payments

`supabase/functions/_shared/payments/` defines a `PaymentProvider` interface (`initiate`, `verifyWebhook`) and adapters:

- **CamPay** (`campay.ts`). `POST {base}/token/` with app username/password, then `POST {base}/collect/` with `Authorization: Token ...`, `{ amount, currency: "XAF", from: "2376...", description, external_reference }`, which returns `reference`, `ussd_code`, `operator`. The callback (GET query or POST) carries `signature`, a JWT HS256-signed with the app webhook key, which is verified before anything is trusted. Sandbox `https://demo.campay.net/api`, live `https://www.campay.net/api`. Docs: https://documenter.getpostman.com/view/2391374/T1LV8PVA
- **Notch Pay** (`notchpay.ts`). `POST /payments` with `Authorization: <public key>`, `{ amount, currency: "XAF", customer: { phone }, reference }`, then `POST /payments/{reference}` with `{ channel: "cm.mtn" | "cm.orange", data: { phone } }`. Webhooks are verified with `x-notch-signature`, a hex HMAC-SHA256 of the raw body using the webhook hash key. Docs: https://developer.notchpay.co/accept-payments/mobile-money and https://developer.notchpay.co/get-started/webhooks/verify
- **CinetPay** (`cinetpay.ts`): stub only (docs linked in the file; methods OMCM / MTNCM).

The **operator** (MTN vs Orange) is detected from the number prefix (`_shared/phone.ts`) and must match the chosen method. The app never asks for a mobile-money PIN: the customer approves on their own phone (USSD / push).

**Webhook handling** (`_shared/webhook.ts`, `payments-webhook`):
1. Verify the signature, else 401.
2. Insert into `webhook_events` (unique per provider + event id). A duplicate becomes a 200 no-op (idempotent).
3. Find the payment by `(provider, provider_ref)` or our reference.
4. Check the amount, else mark the payment failed.
5. Apply only `pending` to `successful`/`failed` (a conditional update), so a late or replayed event cannot flip a settled payment.
6. Mark the trip paid, or move the order from `pending_payment` to `placed`.

Keys live only in Edge Function secrets (`supabase secrets set`); `.env.example` files contain placeholders.

## Security

- RLS is on for every table. Users see only their own trips/orders/payments. Drivers see offers made to them and the trips they serve. Restaurants see their own orders. Riders can read their assigned driver's position.
- Privileged writes go through `security definer` RPCs that check `auth.uid()` and state transitions. `nearest_available_drivers` can be executed only by the service role.
- Users cannot grant themselves `admin` or mark their own vehicle verified (triggers + column grants).
- Edge Functions use the user's JWT to identify the caller, and the service role only for server-side writes. `payments-webhook` is the only function with `verify_jwt = false`; its authenticity comes from the provider signature.

## Known gaps (starter, not finished product)

- CinetPay adapter is a stub.
- Driver location streams in the foreground only. Background tracking needs `expo-task-manager` + `Location.startLocationUpdatesAsync` and Play Store background-location review.
- Re-matching is client-driven. Add a scheduler (`pg_cron` + `pg_net`, or an external cron) that calls `match-driver` with the service role.
- Straight-line distance x 1.3. Use a routing API for real ETAs and fares.
- No admin UI: approve drivers by setting `vehicles.verified` / `drivers.documents_verified` in the Supabase dashboard.
- No push notifications (Expo Notifications), payouts to drivers/restaurants, refunds, surge pricing, or promo codes.
- App icons and splash screens are not included yet.
- Local verification used PGlite + PostGIS (in Node) instead of `supabase start`, because Docker is not available on the build machine. Run `supabase start` and `supabase db reset` locally before the first deploy.
