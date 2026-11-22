# CamRide platform: architecture

This is the production platform that sits next to the static demo (the demo is the repo root and is the only thing published to GitHub Pages).

```
mobile/      Expo (SDK 58) React Native app, TypeScript, Expo Router (routes in src/app)
admin/       Admin dashboard (Vite + React + TS) + public share.html trip-tracking page
supabase/    Postgres + PostGIS schema, RLS, RPCs, ledger, scheduler, seed, Edge Functions (Deno), tests
docs/        This file + legal/ (DRAFT Terms and Privacy)
.github/     pages.yml (demo only) and ci.yml (typecheck, lint, build, tests)
```

## Components

| Layer | Tech | Responsibility |
|---|---|---|
| App | Expo / React Native, react-native-maps, expo-location, supabase-js | Rider, food customer, driver/courier and restaurant flows. EN/FR, FCFA. No secrets except the public anon key. |
| Auth | Supabase Auth, phone OTP | `signInWithOtp({ phone })` then `verifyOtp({ phone, token, type: "sms" })`. A trigger creates the `profiles` row. |
| Data | Postgres 17 + PostGIS (`extensions` schema) | Tables, RLS, pricing in SQL, nearest-driver search (`ST_DWithin` + `<->` on `geography`). |
| Realtime | Supabase Realtime `postgres_changes` | Apps subscribe to their own `trips`, `orders`, `payments`, and to the driver row they are allowed to see. Realtime applies RLS. |
| Server logic | Supabase Edge Functions (Deno) | Anything that must not be trusted to the client: quotes, ride requests, order totals, matching, payments. |
| Payments | CamPay / Notch Pay / CinetPay adapters | Mobile-money collection (MTN MoMo, Orange Money) via a push/USSD prompt or hosted checkout; payouts and refunds as transfers; signed webhooks settle both. |
| Scheduler | pg_cron (+ pg_net) | `run_matching()` every 10 s (offers, expiry, re-offers, give-up); `notify` every 10 s when pushes are pending. |
| Push | Expo Notifications + `notify` function | DB triggers write a `notifications` outbox; `notify` claims rows and sends them through the Expo Push API (FCM on Android). |
| Admin | `admin/` (Vite + React) | Same Supabase API with an admin-role JWT; every write is checked by RLS or a `security definer` RPC and audited. |

## Data model (supabase/migrations)

- `regions` (10) and `cities` (15: the 10 regional capitals + Limbe, Kribi, Kumba, Dschang, Nkongsamba), each city with a `geography` centre.
- `rate_cards`: `moto`, `car`, `comfort`, `delivery` (base, per km, per minute, minimum, max distance).
- `profiles` (1:1 with `auth.users`; role: rider, driver, courier, restaurant, admin), `vehicles`, `drivers` (status, `location geography` + plain `lat/lng` for Realtime payloads, `documents_verified`, rating).
- `trips` (pickup/dropoff, server-side fare, offer state, payment method/status).
- `restaurants`, `menu_items`, `orders`, `order_items`.
- `payments` (one target: trip **or** order; unique `(provider, provider_ref)`), `webhook_events` (unique `(provider, event_id)`, no client access), `ratings`.

## Pricing

`fare = max(minimum, base + per_km x km + per_min x min)`, rounded to the nearest 50 FCFA. The same formula is implemented in SQL (`fare_quote`) and TypeScript (`_shared/fare.ts`), and both are tested against `supabase/tests/fare_fixtures.json`. Distance and duration come from OSRM when `ROUTING_URL` is set (`_shared/routing.ts`, `overview=full&geometries=polyline6`; the route polyline is stored on the trip and drawn in the app), otherwise straight line x 1.3 at 22 km/h. Per-city overrides live in `city_rate_cards` (`effective_rate_card`). Prices are always computed server-side; the client never sends a price.

Seed rate cards (FCFA): Moto 150 + 100/km + 10/min, min 300. Car 500 + 250/km + 20/min, min 1,000. Comfort 1,000 + 400/km + 30/min, min 2,000. Delivery 300 + 150/km, min 500. These are placeholders; set real prices with your drivers and check local rules.

## Flows

**Ride**
1. App calls `request-ride` with `quote_only: true` and shows Moto / Car / Comfort quotes.
2. `request-ride` (real request) recomputes the quote, refuses a second active trip, inserts the trip and calls matching.
3. Matching (`offer_trip` in SQL, called right away and then by `run_matching()` every 10 s) picks the nearest available, verified, non-suspended driver within `search_radius_m` who has no live offer and has not declined, and offers the trip for `offer_ttl_seconds` (`offered_driver_id`, `offer_expires_at`). The driver gets a push notification.
4. Driver app sees the offer through Realtime, then calls `accept_trip` or `decline_trip`. `advance_trip` moves accepted, arrived, in_progress, completed. Completing a cash trip records a cash payment.
5. Expired offers are re-offered to the next driver by the scheduler; after `give_up_minutes` the trip becomes `no_drivers` (rider notified). Status changes (driver arriving, started, completed) push to the rider.
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
- **CinetPay** (`cinetpay.ts`). `POST /v2/payment` returns a hosted checkout URL (opened in the in-app browser); notifications are verified with the `x-token` HMAC and confirmed with `/v2/payment/check`. Transfers use the transfer API (login, contact, `money/send/contact`, `transfer/check/money`).

The **operator** (MTN vs Orange) is detected from the number prefix (`_shared/phone.ts`) and must match the chosen method. The app never asks for a mobile-money PIN: the customer approves on their own phone (USSD / push).

**Webhook handling** (`_shared/webhook.ts`, `payments-webhook`):
1. Verify the signature, else 401.
2. Insert into `webhook_events` (unique per provider + event id). A duplicate becomes a 200 no-op (idempotent).
3. Find the payment by `(provider, provider_ref)` or our reference.
4. Check the amount, else mark the payment failed.
5. Apply only `pending` to `successful`/`failed` (a conditional update), so a late or replayed event cannot flip a settled payment.
6. Mark the trip paid, or move the order from `pending_payment` to `placed`.

Keys live only in Edge Function secrets (`supabase secrets set`); `.env.example` files contain placeholders.

## Ledger, wallets, commission

Double-entry ledger (`ledger_accounts`, `ledger_transactions`, `ledger_entries`): amount > 0 is a debit, < 0 a credit, every transaction sums to zero (deferred constraint trigger) and entries are append-only.

- **Payment received** (mobile money): Dr `psp_clearing`, Cr `customer_deposits`.
- **Trip settled** (on completion): the fare is split into the driver's share and the platform commission (`commission_ride_pct`). For mobile money, `customer_deposits` is debited; promo discounts are funded from `platform_promotions`, so the driver earns on the full fare. For **cash**, the driver already holds the money, so their wallet is debited the commission (balance can go negative = owes CamRide).
- **Order settled** (on delivery): food subtotal to the restaurant wallet minus `commission_food_pct`; delivery fee to the courier minus `commission_delivery_pct`.
- **Refund** (`refunds`, mobile money only): created by an admin (`admin_create_refund`, capped at the refundable amount), sent as a transfer to the payer's number; on success `refund_set_result` posts a proportional reversal of the original split. Cash disputes use `admin_adjust_wallet`.
- **Payouts** (`payout_requests`): a driver/restaurant requests a withdrawal to their own MTN/Orange number (operator must match; minimum `min_payout_xaf`; one open request per wallet). The amount is held (`payouts_pending`) at request; an admin approves in the dashboard, `payouts-process` sends it (CamPay withdraw / Notch Pay transfer / CinetPay transfer); success posts `payout_paid`, failure or rejection releases the hold.
- Transfers are idempotent by reference (`po-<uuid>`, `rf-<uuid>`). Ambiguous provider errors (timeouts, 5xx) leave the transfer `processing` until its status is checked, so nothing is ever paid twice; only definitive refusals mark it failed.

## Notifications

Triggers on trips, orders and payments call `notify_user` (bilingual title/body chosen from `profiles.lang`), which writes `notifications` rows: ride offer, driver arriving/arrived, trip started/completed/cancelled, no driver found, order status changes, delivery offers, payment result, payout/refund result, document review, support replies, SOS (to admins). The app registers its Expo push token (`register_push_token`) after sign-in; the `notify` function sends pending rows in batches through `https://exp.host/--/api/v2/push/send`, marks them `sent`/`failed`, and removes tokens Expo reports as `DeviceNotRegistered`. Rows stuck in `sending` for 5 minutes are retried.

## Driver background location

`mobile/src/lib/backgroundLocation.ts` defines a TaskManager task (registered at app start) that calls `update_my_location` while the driver is online, with an Android foreground-service notification. The driver console shows a prominent disclosure before asking for "Allow all the time" (Play policy); declining keeps foreground-only tracking. Going offline stops the updates.

## Admin dashboard

`admin/` signs in with Supabase email/password and only renders for `profiles.role = 'admin'` (non-suspended). Pages: overview, drivers & documents (signed URLs from the private `driver-documents` bucket, approve/reject, verify), restaurants + menus, trips, orders, payments (+ refunds), refunds, payouts, rate cards (national + per city), promo codes, users (role, suspension), SOS & support, ledger & audit, settings. All writes are enforced server-side (RLS admin policies or `security definer` RPCs with `assert_admin()` + `admin_audit`).

## Security

- RLS is on for every table. Users see only their own trips/orders/payments/wallets. Drivers see offers made to them and the trips they serve. Restaurants see their own orders and wallet. Riders can read their assigned driver's position.
- Privileged writes go through `security definer` RPCs that check `auth.uid()`, roles and state transitions. Internal helpers (ledger posting, settlement, notifications, matching, `nearest_available_drivers`) are not executable by API roles.
- Users cannot grant themselves `admin`, verify themselves, re-activate a suspended restaurant or edit ratings (triggers + column grants). Suspended users cannot request rides, order, pay or go online.
- Driver documents live in a private Storage bucket; drivers can only upload into their own folder; admins read through short-lived signed URLs.
- Edge Functions use the user's JWT to identify the caller and the service role only server-side. Public functions: `payments-webhook` (provider signatures) and `trip-share` (unguessable token, 24 h expiry, no personal data beyond the driver's first name and vehicle).
- Payment keys exist only in Edge Function secrets. The app never asks for a mobile-money PIN.

## Remaining gaps / before launch

- Surge pricing, scheduled rides, multi-stop trips, in-app chat/calls between rider and driver (masked numbers) are not built.
- iOS is configured but untested (needs an Apple Developer account, APNs key and background-location review).
- The admin dashboard has no 2FA of its own: enable MFA for admin accounts in Supabase Auth and restrict who can be promoted.
- Payout/refund transfers are triggered by admins; there is no automatic retry of `processing` transfers (use "Check status"). Provider transfer APIs and webhook payloads should be re-verified in each provider's sandbox before going live.
- Terms & Privacy are **drafts** that need a Cameroonian lawyer's review; data-protection formalities under Law No. 2024/017 are not done.
- Local verification used PGlite + PostGIS (Node) instead of `supabase start` (no Docker on the build machine), so Storage policies, pg_cron, pg_net and Realtime publications were not exercised end to end. Run `supabase start` and `supabase db reset` before the first deploy.
