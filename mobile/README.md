# CamRide mobile (Expo SDK 58)

```bash
cp .env.example .env   # fill Supabase URL + anon key, Google Maps Android key
npm ci
npx expo start
npx tsc --noEmit && npx expo lint
eas build -p android --profile preview
```

Routes (`src/app`):
- `sign-in` (phone OTP), `onboarding` (name, role, city, vehicle)
- `rider/` tabs: ride, food, activity, account
- `trip/[id]`, `restaurant/[id]`, `checkout`, `order/[id]`
- `driver` (driver/courier console), `partner` (restaurant console)

Shared code lives in `src/lib` (Supabase client, i18n EN/FR, FCFA formatting, places, realtime hooks, API wrappers) and `src/components`.

`react-native-maps` needs a custom native build for the Android Google Maps key (EAS build or `npx expo run:android`). Expo Go can be used for quick UI work.
