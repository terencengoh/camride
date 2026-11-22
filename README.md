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

## Platform code (production starter)

The demo above is a static prototype. The real app is in this repo too, and it is **not** published to Pages:

| Folder | What |
|---|---|
| [`mobile/`](mobile/) | Expo SDK 58 React Native app (TypeScript, Expo Router). Rider (Moto / Car / Comfort), food (restaurants, cart, tracking), driver/courier console, restaurant console. EN/FR, FCFA, 10 regions + 5 extra cities, Supabase phone OTP + Realtime, react-native-maps. |
| [`supabase/`](supabase/) | Postgres + PostGIS migrations, RLS, fare and nearest-driver RPCs, seed data, Edge Functions (`request-ride`, `match-driver`, `create-order`, `payments-initiate`, `payments-webhook`), and payment adapters (CamPay, Notch Pay, CinetPay stub). |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How it fits together: flows, payments, security, known gaps. |

CI (`.github/workflows/ci.yml`) typechecks and lints the app, then checks, lints and tests the Edge Functions. It also runs the migrations, seed and RPC tests on PGlite + PostGIS.

### Setup

Prerequisites: Node 20+, [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), Deno 2 (for function tests), Docker (only for the local Supabase stack), and the Expo Go app or an Android emulator.

```bash
# 1. Database + functions (local)
supabase start                       # local stack (Docker); applies migrations + seed.sql
cp supabase/functions/.env.example supabase/functions/.env   # fill sandbox keys
supabase functions serve --env-file supabase/functions/.env

# 2. Database + functions (your cloud project)
supabase login
supabase link --project-ref <your-project-ref>
supabase db push --include-seed      # applies supabase/migrations + seed.sql (regions, cities, rate cards, [DEMO] restaurants)
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy request-ride match-driver create-order payments-initiate
supabase functions deploy payments-webhook --no-verify-jwt

# 3. App
cd mobile
cp .env.example .env                 # EXPO_PUBLIC_SUPABASE_URL / ANON_KEY, GOOGLE_MAPS_ANDROID_API_KEY
npm ci
npx expo start                       # scan the QR code with Expo Go
# Android build (EAS)
npm i -g eas-cli && eas login && eas init
eas env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --environment preview --visibility sensitive
eas build -p android --profile preview      # installable APK
eas build -p android --profile production   # AAB for Play Store
```

Tests: `cd supabase/functions && deno task check && deno lint && deno task test`, `cd supabase/tests/db && npm ci && npm test`, `cd mobile && npx tsc --noEmit && npx expo lint`.

Locally, `supabase/config.toml` enables test OTP numbers (`+237677000001`, `+237699000002`, code `123456`), so you can sign in without an SMS provider.

### Environment variables

| Where | Variable | Notes |
|---|---|---|
| `mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public; RLS protects the data. |
| `mobile/.env` / EAS env | `GOOGLE_MAPS_ANDROID_API_KEY` | Read by `app.config.ts` at build time. Restrict to package `cm.camride.app` + your signing SHA-1. |
| Edge Function secrets | `PAYMENT_PROVIDER` | `campay` (default), `notchpay`, or `cinetpay` (stub). |
| Edge Function secrets | `CAMPAY_BASE_URL`, `CAMPAY_USERNAME`, `CAMPAY_PASSWORD`, `CAMPAY_WEBHOOK_KEY` | From the CamPay app dashboard. |
| Edge Function secrets | `NOTCHPAY_BASE_URL`, `NOTCHPAY_PUBLIC_KEY`, `NOTCHPAY_WEBHOOK_HASH` | From the Notch Pay dashboard. |
| (automatic) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Injected into Edge Functions by Supabase. Never put the service role key in the app. |

No real keys are committed; both `.env.example` files contain placeholders only.

### Accounts needed to run it for real

1. **Supabase project** (free tier is fine to start). Then, in Auth → Phone:
   - enable phone sign-in;
   - connect an **SMS provider** (Twilio, MessageBird, Vonage or Textlocal) for OTP. This is paid per SMS.
2. **Payment merchant account** with **CamPay** or **Notch Pay**. Both need business documents (RCCM, NIU). Then:
   - create an app/API key;
   - set the webhook URL to `https://<project-ref>.supabase.co/functions/v1/payments-webhook?provider=campay` (or `?provider=notchpay`);
   - put the keys in Edge Function secrets.
3. **Google Cloud** project with the **Maps SDK for Android** enabled and a restricted API key. Billing must be enabled; there is a monthly free allowance.
4. **Expo / EAS** account (free tier) for cloud builds.
5. **Google Play Console** developer account (one-time US$25) to publish the Android app.
6. Approve drivers: set `vehicles.verified` and `drivers.documents_verified` in the Supabase dashboard. There is no admin UI yet.

See [GO-LIVE.md](GO-LIVE.md) for the legal and transport requirements in Cameroon.
