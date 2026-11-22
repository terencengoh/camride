import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
export const isConfigured = SUPABASE_URL.startsWith("http") && ANON.length > 20;

// Only the public anon key: admins sign in as normal users and RLS/RPCs check profiles.role = 'admin'.
export const supabase = createClient(isConfigured ? SUPABASE_URL : "http://localhost:54321", isConfigured ? ANON : "public-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Calls an admin Edge Function with the signed-in admin's JWT. */
export async function callFunction<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try { msg = ((await ctx.json()) as { error?: string }).error ?? msg; } catch { /* keep message */ }
    }
    throw new Error(msg);
  }
  return data as T;
}
