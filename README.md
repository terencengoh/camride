# CamRide (demo prototype)

Rides, moto-taxis (benskin) and food delivery for **all ten regions of Cameroon**, paid with **MTN Mobile Money**, **Orange Money** or cash. Bilingual (FR / EN), prices in FCFA (XAF).

**Live demo:** https://terencengoh.github.io/camride/

> Demo mode: payments are simulated and no real money moves. Drivers, restaurants and prices are fictional. Sign-ups, trips and orders are saved only in your browser (localStorage).

## Features
- Real map (Leaflet + OpenStreetMap) with browser geolocation for pickup. It falls back to Douala, or to the region you pick.
- Region selector: all 10 regional capitals (Adamawa, Centre, East, Far North, Littoral, North, Northwest, West, South, Southwest) plus Limbe, Kumba, Kribi, Dschang and Nkongsamba.
- Destination by tapping the map or by place search (Nominatim, explicit search, at most 1 request per second).
- Ride types:
  - CamRide Moto, CamRide Car and CamRide Comfort, with fares from distance and time. Routes come from the OSRM demo server, with a straight-line ×1.3 fallback.
  - Clear demo rate cards.
- Ride flow:
  - Request, then a simulated driver match (name, plate, rating, ETA).
  - The driver moves on the map to your pickup, then the trip runs.
  - Pay, then rate the driver.
- Food delivery:
  - 18 fictional restaurants across all regions, with regional dishes (ndolé, poulet DG, eru, achu, kilichi, okok, taro, koki and more).
  - Cart, delivery fee by distance, and live order tracking with a courier on the map.
- Checkout:
  - MTN MoMo or Orange Money with +237 number validation and operator detection.
  - A simulated "approve on your phone" prompt, then a receipt.
- Join form for riders, drivers, moto riders, couriers and restaurants, saved in localStorage.
- Operator dashboard built from the demo data in your browser.
- Installable PWA (manifest, icons, offline shell).

## Run locally
Any static server works, e.g. `python3 -m http.server`, then open http://localhost:8000.

## Going live
See [GO-LIVE.md](GO-LIVE.md) for company registration, transport and moto-taxi rules, real mobile money APIs and the native-app path, with sources.

---

## Platform code (production app)

The demo above is a static prototype. The real platform is in this repo too, and it is **not** published to Pages:

| Folder | What |
|---|---|
| [`mobile/`](mobile/) | Expo SDK 58 React Native app (TypeScript, Expo Router). Rider (Moto / Car / Comfort) with route polylines and promo codes, food (restaurants, cart, tracking, ratings), driver/courier console with background location, document upload, earnings + payouts, restaurant console with earnings, SOS + share trip, ride history + receipts, support, Terms & Privacy (drafts), push notifications. EN/FR, FCFA. |
| [`admin/`](admin/) | Admin web dashboard (Vite + React + TypeScript, Supabase auth, admin role only): driver/vehicle/document verification, restaurants + menus, trips, orders, payments + refunds, payouts, per-city rate cards, promo codes, users (roles, suspension), SOS + support, ledger + audit log, settings. Also hosts the public `share.html` trip-tracking page. |
| [`supabase/`](supabase/) | Postgres + PostGIS migrations, RLS, pricing, matching scheduler (pg_cron), double-entry ledger with commission, wallets, payouts, refunds, promo codes, notification outbox, SOS/support; Edge Functions and payment adapters (CamPay, Notch Pay, CinetPay — collection and payouts). |
| [`docs/`](docs/) | [ARCHITECTURE.md](docs/ARCHITECTURE.md) (flows, ledger, payments, security, remaining gaps) and [legal/](docs/legal/) (DRAFT Terms + Privacy). |

CI (`.github/workflows/ci.yml`) runs on every push that touches the platform:
- **mobile**: `tsc`, `expo lint`, `expo-doctor`, `expo export` (Android bundle);
- **admin**: `tsc`, `eslint`, `vite build`;
- **functions**: `deno check`, `deno lint`, `deno test` (payments, webhooks, transfers, routing, push, fares);
- **database**: all migrations + seed + RPC/RLS tests on PGlite + PostGIS (ledger, refunds, payouts, matching scheduler, promos, documents, SOS…).

### Setup

Prerequisites: Node 22+, [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), Deno 2, Docker (only for the local Supabase stack), and an Android device/emulator (push notifications and background location need a development build, not Expo Go).

```bash
# 1. Database + functions (your cloud project)
supabase login
supabase link --project-ref <your-project-ref>
#    Dashboard > Database > Extensions: enable pg_cron, pg_net (and Vault, on by default) BEFORE pushing,
#    so the migration can schedule re-matching every 10 s.
supabase db push --include-seed
cp supabase/functions/.env.example supabase/functions/.env     # fill with sandbox keys
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy request-ride match-driver create-order payments-initiate notify payouts-process refunds-process
supabase functions deploy payments-webhook trip-share --no-verify-jwt
#    Then run supabase/sql/schedule_notify.sql in the SQL editor (push delivery every 10 s).

# 2. First admin: create a user with email + password in Dashboard > Authentication, then in the SQL editor:
#    update public.profiles set role = 'admin' where id = '<that user id>';

# 3. Admin dashboard
cd admin && cp .env.example .env.local && npm ci && npm run dev     # build: npm run build -> admin/dist (static)

# 4. App
cd mobile && cp .env.example .env && npm ci        # postinstall decodes the icon/splash PNGs
npx expo start
npm i -g eas-cli && eas login && eas init           # sets the EAS projectId
eas build -p android --profile development          # dev client (push + background location)
eas build -p android --profile preview              # installable APK
eas build -p android --profile production           # AAB for Play Store
```

Tests: `cd supabase/functions && deno check */index.ts tests/*.ts && deno lint && deno test --allow-read tests/`, `cd supabase/tests/db && npm ci && npm test`, `cd mobile && npx tsc --noEmit && npx expo lint`, `cd admin && npm run typecheck && npm run lint && npm run build`.

Locally, `supabase/config.toml` enables test OTP numbers (`+237677000001`, `+237699000002`, code `123456`).

**App icon / splash:** the artwork is generated by `mobile/scripts/gen-icons.py` and committed as base64 (`mobile/assets/*.png.b64`, because this repo is updated through a text-only API). `mobile/scripts/decode-assets.js` writes the PNGs on `npm install` and whenever `app.config.ts` is loaded (`expo start`, `expo export`, `expo prebuild`, EAS Build), so no manual step is needed. The PNGs themselves are gitignored.

### Environment variables

| Where | Variable | Notes |
|---|---|---|
| `mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public; RLS protects the data. |
| `mobile/.env` | `EXPO_PUBLIC_SHARE_URL` | URL of `share.html` on the admin site (trip sharing). |
| `mobile/.env` / EAS env | `GOOGLE_MAPS_ANDROID_API_KEY`, `EAS_PROJECT_ID` | Read by `app.config.ts` at build time. Restrict the Maps key to `cm.camride.app` + your SHA-1. |
| `admin/.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Public; admin rights come from `profiles.role = 'admin'`. |
| Edge Function secrets | `PAYMENT_PROVIDER`, `PAYOUT_PROVIDER` | `campay` (default), `notchpay` or `cinetpay`. |
| Edge Function secrets | `CAMPAY_BASE_URL`, `CAMPAY_USERNAME`, `CAMPAY_PASSWORD`, `CAMPAY_WEBHOOK_KEY` | CamPay app (collection + withdraw). |
| Edge Function secrets | `NOTCHPAY_BASE_URL`, `NOTCHPAY_PUBLIC_KEY`, `NOTCHPAY_PRIVATE_KEY`, `NOTCHPAY_WEBHOOK_HASH` | Private key only for transfers (requires IP whitelisting). |
| Edge Function secrets | `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CINETPAY_SECRET_KEY`, `CINETPAY_NOTIFY_URL`, `CINETPAY_RETURN_URL`, `CINETPAY_TRANSFER_PASSWORD`, `CINETPAY_TRANSFER_NOTIFY_URL` | Checkout + transfer API. |
| Edge Function secrets | `ROUTING_URL`, `ROUTING_DURATION_FACTOR` | OSRM base URL (e.g. `https://osrm.example.cm`); empty = straight line × 1.3. |
| Edge Function secrets | `EXPO_ACCESS_TOKEN` | Optional (Expo push security). |
| Vault (SQL) | `project_url`, `service_role_key` | Used by `schedule_notify.sql`; stored encrypted. |
| (automatic) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Injected by Supabase. Never put the service role key in the app or admin. |

No real keys are committed; every `.env.example` contains placeholders only.

### Accounts and setup needed to run it for real

1. **Supabase project** (Pro plan recommended for production backups). Auth → Phone: enable it and connect an **SMS provider** (Twilio, MessageBird, Vonage or Textlocal; paid per SMS). Auth → Email: keep it on for admin logins. Enable **pg_cron** and **pg_net**.
2. **Mobile-money merchant account(s)** — at least one of **CamPay**, **Notch Pay**, **CinetPay** (business documents: RCCM, NIU). Ask for **withdrawals/transfers (payouts) to be enabled**, set the webhook URL `https://<ref>.supabase.co/functions/v1/payments-webhook?provider=<name>`, and put the keys in Edge Function secrets. **Notch Pay transfers** need a whitelisted IP: Supabase Edge Functions have no fixed IP, so route them through a small **static-IP proxy** (or use CamPay / CinetPay for payouts). Keep a funded payout balance.
3. **Google Cloud**: Maps SDK for Android + restricted key (billing enabled; free monthly allowance).
4. **Expo / EAS** account: `eas init` (projectId) and **FCM credentials** — create a **Firebase** project, add the Android app `cm.camride.app`, upload the FCM V1 service-account key with `eas credentials`. (iOS later: Apple Developer Program, US$99/yr, APNs key.)
5. **Google Play Console** (one-time US$25). Background location needs the Play **location permissions declaration** + a short video; also complete the Data safety form.
6. **OSRM routing server** (self-hosted with the Cameroon OSM extract, or a hosted provider) → `ROUTING_URL`. The public OSRM demo server must not be used in production.
7. **Static hosting** for `admin/dist` (Netlify, Cloudflare Pages, Vercel…) — it also serves `share.html` for trip sharing. Add its URL to Supabase Auth → URL configuration.
8. **First admin user** (email + password in Supabase Auth, then the SQL above).
9. **Lawyer review** of the draft Terms & Privacy ([docs/legal/](docs/legal/)) and the **personal-data formalities** with the authority created by Law No. 2024/017 (declarations/authorisations, cross-border transfer rules — Supabase region choice).

See [GO-LIVE.md](GO-LIVE.md) for the legal and transport requirements in Cameroon.
