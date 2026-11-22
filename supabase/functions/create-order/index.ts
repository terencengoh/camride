// POST /functions/v1/create-order
// { restaurant_id, items: [{menu_item_id, quantity}], delivery: {lat,lng,address?}, payment_method }
// Prices, delivery fee and totals are computed here from the database; client prices are ignored.
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { computeFare, estimateRoute, inCameroon, type RateCard } from "../_shared/fare.ts";

interface Body {
  restaurant_id: string;
  items: { menu_item_id: string; quantity: number }[];
  delivery: { lat: number; lng: number; address?: string };
  payment_method: "mtn" | "orange" | "cash";
}

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const db = adminClient();
  const user = await requireUser(req, db);
  const body = await readJson<Body>(req);

  if (!["mtn", "orange", "cash"].includes(body.payment_method)) throw new HttpError(422, "invalid payment_method");
  if (!body.delivery || !inCameroon(body.delivery)) throw new HttpError(422, "delivery point must be in Cameroon");
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) throw new HttpError(422, "1 to 30 items");
  for (const it of body.items) {
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 50) throw new HttpError(422, "quantity must be 1-50");
  }

  const { data: resto } = await db.from("restaurants_public").select("id,lat,lng,is_open").eq("id", body.restaurant_id).single();
  if (!resto) throw new HttpError(404, "restaurant not found");
  if (!resto.is_open) throw new HttpError(409, "restaurant is closed");

  const ids = [...new Set(body.items.map((i) => i.menu_item_id))];
  const { data: menu } = await db.from("menu_items").select("id,name,price_xaf,available,restaurant_id").in("id", ids);
  const byId = new Map((menu ?? []).map((m) => [m.id, m]));
  const lines = body.items.map((it) => {
    const m = byId.get(it.menu_item_id);
    if (!m || m.restaurant_id !== resto.id || !m.available) throw new HttpError(422, `item ${it.menu_item_id} unavailable`);
    return { menu_item_id: m.id, name: m.name, unit_price_xaf: m.price_xaf, quantity: it.quantity };
  });
  const subtotal = lines.reduce((s, l) => s + l.unit_price_xaf * l.quantity, 0);

  const { data: card } = await db.from("rate_cards").select("*").eq("key", "delivery").single();
  if (!card) throw new HttpError(500, "delivery rate card missing");
  const route = estimateRoute({ lat: resto.lat, lng: resto.lng }, body.delivery);
  if (card.max_distance_km && route.distanceKm > Number(card.max_distance_km)) throw new HttpError(422, "too far to deliver");
  const fee = computeFare(card as RateCard, route.distanceKm, 0);

  const { data: order, error } = await db.from("orders").insert({
    customer_id: user.id,
    restaurant_id: resto.id,
    status: body.payment_method === "cash" ? "placed" : "pending_payment",
    delivery_location: `SRID=4326;POINT(${body.delivery.lng} ${body.delivery.lat})`,
    delivery_lat: body.delivery.lat, delivery_lng: body.delivery.lng,
    delivery_address: body.delivery.address?.slice(0, 200) ?? null,
    distance_km: route.distanceKm,
    subtotal_xaf: subtotal, delivery_fee_xaf: fee, total_xaf: subtotal + fee,
    payment_method: body.payment_method,
  }).select().single();
  if (error) throw error;

  const { error: itemsErr } = await db.from("order_items").insert(lines.map((l) => ({ ...l, order_id: order.id })));
  if (itemsErr) {
    await db.from("orders").delete().eq("id", order.id);
    throw itemsErr;
  }
  return json({ order, items: lines }, 201);
}));
