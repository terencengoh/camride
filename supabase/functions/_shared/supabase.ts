import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, requireEnv } from "./http.ts";

/** Service-role client. Bypasses RLS: only use after authorising the caller yourself. */
export function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolves the signed-in user from the request's Authorization header. */
export async function requireUser(req: Request, admin: SupabaseClient): Promise<{ id: string; phone?: string }> {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "missing Authorization header");
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "invalid session");
  return { id: data.user.id, phone: data.user.phone ?? undefined };
}
