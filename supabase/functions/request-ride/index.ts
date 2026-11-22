// POST /functions/v1/request-ride
// { pickup: {lat,lng,address?}, dropoff: {lat,lng,address?}, vehicle_type?, payment_method?, quote_only? }
// quote_only=true -> { quotes: [{vehicle_type, distance_km, duration_min, fare_xaf}] }
// otherwise creates the trip with a server-side fare and offers it to the nearest driver.
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { inCameroon, type LatLng } from "../_shared/fare.ts";
import { offerTrip } from "../_shared/matching.ts";

interface Place extends LatLng { address?: string }
interface Body {
  pickup: Place;
  dropoff: Place;
  vehicle_type?: "moto" | "car" | "comfort";
  payment_method?: "mtn" | "orange" | "cash";
  quote_only?: boolean;
}

const VEHICLES = ["moto", "car", "comfort"];
const METHODS = ["mtn", "orange", "cash"];
const validPlace = (p: Place | undefined): p is Place =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && inCameroon(p);

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const db = adminClient();
  const user = await requireUser(req, db);
  const body = await readJson<Body>(req);
  if (!validPlace(body.pickup) || !validPlace(body.dropoff)) throw new HttpError(422, "pickup and dropoff must be valid points in Cameroon");

  const { data: quotes, error: qErr } = await db.rpc("quote_trip", {
    p_pickup_lat: body.pickup.lat, p_pickup_lng: body.pickup.lng, p_dropoff_lat: body.dropoff.lat, p_dropoff_lng: body.dropoff.lng,
  });
  if (qErr) throw new HttpError(422, qErr.message);
  if (body.quote_only) return json({ quotes });

  if (!body.vehicle_type || !VEHICLES.includes(body.vehicle_type)) throw new HttpError(422, "vehicle_type must be moto, car or comfort");
  if (!body.payment_method || !METHODS.includes(body.payment_method)) throw new HttpError(422, "payment_method must be mtn, orange or cash");
  const q = (quotes as { vehicle_type: string; distance_km: number; duration_min: number; fare_xaf: number }[])
    .find((x) => x.vehicle_type === body.vehicle_type)!;

  const { data: card } = await db.from("rate_cards").select("max_distance_km").eq("key", body.vehicle_type).single();
  if (card?.max_distance_km && q.distance_km > Number(card.max_distance_km)) throw new HttpError(422, "trip too long for this ride type");

  const { count } = await db.from("trips").select("id", { count: "exact", head: true })
    .eq("rider_id", user.id).in("status", ["requested", "offered", "accepted", "arrived", "in_progress"]);
  if ((count ?? 0) > 0) throw new HttpError(409, "you already have an active trip");

  const { data: city } = await db.rpc("nearest_city", { p_lat: body.pickup.lat, p_lng: body.pickup.lng });

  const { data: trip, error } = await db.from("trips").insert({
    rider_id: user.id,
    vehicle_type: body.vehicle_type,
    status: "requested",
    city_id: city ?? null,
    pickup: `SRID=4326;POINT(${body.pickup.lng} ${body.pickup.lat})`,
    pickup_lat: body.pickup.lat, pickup_lng: body.pickup.lng, pickup_address: body.pickup.address?.slice(0, 200) ?? null,
    dropoff: `SRID=4326;POINT(${body.dropoff.lng} ${body.dropoff.lat})`,
    dropoff_lat: body.dropoff.lat, dropoff_lng: body.dropoff.lng, dropoff_address: body.dropoff.address?.slice(0, 200) ?? null,
    distance_km: q.distance_km, duration_min: q.duration_min, fare_xaf: q.fare_xaf,
    payment_method: body.payment_method,
  }).select().single();
  if (error) throw error;

  const match = await offerTrip(db, trip.id);
  return json({ trip, match }, 201);
}));
