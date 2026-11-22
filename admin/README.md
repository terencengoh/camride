# CamRide admin dashboard

Vite + React + TypeScript single-page app for CamRide operators. It talks to the same Supabase project as the mobile app with the **public anon key**; admin powers come only from `profiles.role = 'admin'`, enforced by RLS and `security definer` RPCs (every privileged action is written to `admin_audit`).

## Pages
Overview · Drivers & documents (signed URLs, approve/reject, verify driver/vehicle) · Restaurants (create, suspend, menus) · Trips · Orders · Payments (refunds) · Refunds · Payouts (approve & send / reject / check status) · Rate cards (national + per city) · Promo codes · Users (role, suspend) · SOS & support · Ledger & audit (balances, transactions, wallet adjustments) · Settings (commissions, payout minimum, matching radius/TTL).

`share.html` is the public "Share my trip" page (`share.html?t=<token>`). Set the app's `EXPO_PUBLIC_SHARE_URL` to its deployed URL.

## Run
```bash
cp .env.example .env.local     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (public values only)
npm ci
npm run dev                    # http://localhost:5173
npm run typecheck && npm run lint && npm run build   # static output in dist/
```
Deploy `dist/` to any static host (Netlify, Cloudflare Pages, Vercel, S3). It is **not** published by this repo's GitHub Pages workflow.

## First admin
1. Supabase Dashboard → Authentication → Users → *Add user* (email + password). Turn on MFA for admins.
2. SQL editor: `update public.profiles set role = 'admin' where id = '<user uuid>';`
Further admins can be promoted from the Users page.

## Edge Functions used
`payouts-process` and `refunds-process` (admin JWT required) send money through the configured `PAYOUT_PROVIDER`. A transfer left in *processing* is never re-sent automatically — use *Check status*.
