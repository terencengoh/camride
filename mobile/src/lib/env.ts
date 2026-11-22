// Public (bundled) configuration. Only the Supabase URL and the publishable anon key belong here;
// RLS protects the data. Never put service-role or payment keys in the app.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isConfigured = SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;
// Public page used for "Share my trip" links (admin/public/share.html on the admin site).
// Falls back to the trip-share Edge Function (HTML may show as plain text on *.supabase.co).
export const SHARE_URL = process.env.EXPO_PUBLIC_SHARE_URL ?? "";
