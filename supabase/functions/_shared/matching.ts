// Offer a trip (or a food delivery) to the nearest available, verified driver/courier.
// Offers expire after OFFER_TTL_SECONDS; declined/expired drivers are skipped on the next round.
// Re-matching is triggered by the rider app (match-driver), or by a scheduler (pg_cron / external cron)
// calling match-driver with the service-role key.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const OFFER_TTL_SECONDS = 30;
export const SEARCH_RADIUS_M = 5000;
export const GIVE_UP_AFTER_MINUTES = 5;

export type MatchResult =
  | { status: "offered"; driverId: string; distanceM: number; expiresAt: string }
  | { status: "waiting" | "no_drivers" | "not_matchable" | "already_offered" };

export async function offerTrip(db: SupabaseClient, tripId: string): Promise<MatchResult> {
  const { data: trip, error } = await db.from("trips")
    .select("id,status,vehicle_type,pickup_lat,pickup_lng,offered_driver_id,offer_expires_at,declined_driver_ids,created_at")
    .eq("id", tripId).single();
  if (error || !trip) throw new Error(`trip ${tripId} not found`);
  if (!["requested", "offered"].includes(trip.status)) return { status: "not_matchable" };
  const now = Date.now();
  if (trip.status === "offered" && trip.offer_expires_at && Date.parse(trip.offer_expires_at) > now) return { status: "already_offered" };

  const exclude: string[] = [...(trip.declined_driver_ids ?? [])];
  if (trip.offered_driver_id) exclude.push(trip.offered_driver_id); // expired offer counts as a decline

  const { data: drivers, error: rpcErr } = await db.rpc("nearest_available_drivers", {
    p_lat: trip.pickup_lat, p_lng: trip.pickup_lng, p_vehicle_type: trip.vehicle_type,
    p_couriers_only: false, p_radius_m: SEARCH_RADIUS_M, p_limit: 1, p_exclude: exclude,
  });
  if (rpcErr) throw rpcErr;

  if (!drivers || drivers.length === 0) {
    const tooOld = now - Date.parse(trip.created_at) > GIVE_UP_AFTER_MINUTES * 60_000;
    await db.from("trips").update({
      status: tooOld ? "no_drivers" : "requested", offered_driver_id: null, offer_expires_at: null, declined_driver_ids: exclude,
    }).eq("id", tripId).in("status", ["requested", "offered"]);
    return { status: tooOld ? "no_drivers" : "waiting" };
  }

  const d = drivers[0] as { driver_id: string; distance_m: number };
  const expiresAt = new Date(now + OFFER_TTL_SECONDS * 1000).toISOString();
  const { data: updated } = await db.from("trips").update({
    status: "offered", offered_driver_id: d.driver_id, offer_expires_at: expiresAt, declined_driver_ids: exclude,
  }).eq("id", tripId).in("status", ["requested", "offered"]).select("id");
  if (!updated?.length) return { status: "not_matchable" };
  return { status: "offered", driverId: d.driver_id, distanceM: d.distance_m, expiresAt };
}

export async function offerOrder(db: SupabaseClient, orderId: string): Promise<MatchResult> {
  const { data: order, error } = await db.from("orders")
    .select("id,status,restaurant_id,courier_id,offered_courier_id,offer_expires_at,declined_courier_ids")
    .eq("id", orderId).single();
  if (error || !order) throw new Error(`order ${orderId} not found`);
  if (order.courier_id || !["accepted", "preparing", "ready"].includes(order.status)) return { status: "not_matchable" };
  const now = Date.now();
  if (order.offered_courier_id && order.offer_expires_at && Date.parse(order.offer_expires_at) > now) return { status: "already_offered" };

  const { data: resto } = await db.from("restaurants_public").select("lat,lng").eq("id", order.restaurant_id).single();
  if (!resto) throw new Error("restaurant not found");
  const exclude: string[] = [...(order.declined_courier_ids ?? [])];
  if (order.offered_courier_id) exclude.push(order.offered_courier_id);

  const { data: couriers, error: rpcErr } = await db.rpc("nearest_available_drivers", {
    p_lat: resto.lat, p_lng: resto.lng, p_vehicle_type: null, p_couriers_only: true,
    p_radius_m: SEARCH_RADIUS_M, p_limit: 1, p_exclude: exclude,
  });
  if (rpcErr) throw rpcErr;
  if (!couriers?.length) {
    await db.from("orders").update({ offered_courier_id: null, offer_expires_at: null, declined_courier_ids: exclude })
      .eq("id", orderId).is("courier_id", null);
    return { status: "waiting" };
  }
  const c = couriers[0] as { driver_id: string; distance_m: number };
  const expiresAt = new Date(now + OFFER_TTL_SECONDS * 1000).toISOString();
  const { data: updated } = await db.from("orders").update({
    offered_courier_id: c.driver_id, offer_expires_at: expiresAt, declined_courier_ids: exclude,
  }).eq("id", orderId).is("courier_id", null).select("id");
  if (!updated?.length) return { status: "not_matchable" };
  return { status: "offered", driverId: c.driver_id, distanceM: c.distance_m, expiresAt };
}
