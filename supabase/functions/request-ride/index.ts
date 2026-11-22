// POST /functions/v1/request-ride
// { pickup: {lat,lng,address?}, dropoff: {lat,lng,address?}, vehicle_type?, payment_method?, promo_code?, quote_only? }
// quote_only=true -> { quotes, route: {polyline, source}, promo? }
// otherwise creates the trip with a server-side fare (road route via OSRM when ROUTING_URL is set,
// per-city rate card, optional promo) and offers it to the nearest driver. pg_cron keeps re-matching.
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { adminClient, requireActiveUser } from "../_shared/supabase.ts";
import { inCameroon, type LatLng } from "../_shared/fare.ts";
import { getRoute } from "../_shared/routing.ts";
import { offerTrip } from "../_shared/matching.ts";

interface Place extends LatLng { address?: string }
interface Body {
  pickup: Place;
  dropoff: Place;
  vehicle_type?: "moto" | "car" | "comfort";
  payment_method?: "mtn" | "orange" | "cash";
  promo_code?: string;
  quote_only?: boolean;
}
interface Quote { vehicle_type: string; distance_km: number; duration_min: number; fare_xaf: number; max_distance_km: number | null }

const VEHICLES = ["moto", "car", "comfort"];
const METHODS = ["mtn", "orange", "cash"];
const validPlace = (p: Place | undefined): p is Place =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && inCameroon(p);

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const db = adminClient();
  const user = await requireActiveUser(req, db);
  const body = await readJson<Body>(req);
  if (!validPlace(body.pickup) || !validPlace(body.dropoff)) throw new HttpError(422, "pickup and dropoff must be valid points in Cameroon");

  const route = await getRoute(body.pickup, body.dropoff);
  const { data: city } = await db.rpc("nearest_city", { p_lat: body.pickup.lat, p_lng: body.pickup.lng });
  const { data: quoteRows, error: qErr } = await db.rpc("quote_route", {
    p_city: city ?? null, p_distance_km: route.distanceKm, p_duration_min: route.durationMin,
  });
  if (qErr) throw new HttpError(422, qErr.message);
  const quotes = quoteRows as Quote[];
  const promoCode = body.promo_code?.trim() || null;

  const promoFor = async (amount: number) => {
    if (!promoCode) return 0;
    const { data, error } = await db.rpc("promo_quote", { p_code: promoCode, p_user: user.id, p_scope: "ride", p_amount: amount });
    if (error) throw new HttpError(422, error.message, "promo_invalid");
    return Number(data);
  };

  if (body.quote_only) {
    let promo: { code: string; discounts: Record<string, number> } | { code: string; error: string } | undefined;
    if (promoCode) {
      try {
        const discounts: Record<string, number> = {};
        for (const q of quotes) discounts[q.vehicle_type] = await promoFor(q.fare_xaf);
        promo = { code: promoCode.toUpperCase(), discounts };
      } catch (e) {
        promo = { code: promoCode.toUpperCase(), error: (e as Error).message };
      }
    }
    return json({ quotes, route: { polyline: route.polyline, source: route.source }, city, promo });
  }

  if (!body.vehicle_type || !VEHICLES.includes(body.vehicle_type)) throw new HttpError(422, "vehicle_type must be moto, car or comfort");
  if (!body.payment_method || !METHODS.includes(body.payment_method)) throw new HttpError(422, "payment_method must be mtn, orange or cash");
  const q = quotes.find((x) => x.vehicle_type === body.vehicle_type)!;
  if (q.max_distance_km && q.distance_km > Number(q.max_distance_km)) throw new HttpError(422, "trip too long for this ride type");

  const { count } = await db.from("trips").select("id", { count: "exact", head: true })
    .eq("rider_id", user.id).in("status", ["requested", "offered", "accepted", "arrived", "in_progress"]);
  if ((count ?? 0) > 0) throw new HttpError(409, "you already have an active trip");

  const discount = await promoFor(q.fare_xaf);
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
    promo_code: discount > 0 ? promoCode!.toUpperCase() : null, discount_xaf: discount,
    route_polyline: route.polyline, route_source: route.source,
    payment_method: body.payment_method,
  }).select().single();
  if (error) throw error;

  if (discount > 0) {
    const { error: rErr } = await db.rpc("redeem_promo", {
      p_code: promoCode, p_user: user.id, p_scope: "ride", p_amount: q.fare_xaf, p_trip_id: trip.id,
    });
    if (rErr) {
      await db.from("trips").delete().eq("id", trip.id);
      throw new HttpError(409, rErr.message, "promo_invalid");
    }
  }

  const match = await offerTrip(db, trip.id);
  return json({ trip, match }, 201);
}));
