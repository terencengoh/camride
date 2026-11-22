// Matching runs in Postgres (public.offer_trip / offer_order / run_matching in
// migrations/20261122000004_platform.sql) so the pg_cron scheduler can expire offers and re-offer
// every 10 seconds without HTTP. These wrappers call the same functions from Edge Functions.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type MatchResult =
  | { status: "offered"; driver_id: string; distance_m: number; expires_at: string }
  | { status: "waiting" | "no_drivers" | "not_matchable" }
  | { status: "already_offered"; driver_id: string; expires_at?: string };

export async function offerTrip(db: SupabaseClient, tripId: string): Promise<MatchResult> {
  const { data, error } = await db.rpc("offer_trip", { p_trip_id: tripId });
  if (error) throw new Error(error.message);
  return data as MatchResult;
}

export async function offerOrder(db: SupabaseClient, orderId: string): Promise<MatchResult> {
  const { data, error } = await db.rpc("offer_order", { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return data as MatchResult;
}
