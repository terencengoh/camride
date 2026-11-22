// POST /functions/v1/create-order
// { restaurant_id, items: [{menu_item_id, quantity}], delivery: {lat,lng,address?}, payment_method, promo_code?, quote_only? }
// Prices, delivery fee (road distance + city rate card), promo discount and totals are computed here
// from the database; client prices are ignored.
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { adminClient, requireActiveUser } from "../_shared/supabase.ts";
import { inCameroon } from "../_shared/fare.ts";
import { getRoute } from "../_shared/routing.ts";

interface Body {
  restaurant_id: string;
  items: { menu_item_id: string; quantity: number }[];
  delivery: { lat: number; lng: number; address?: string };
  payment_method: "mtn" | "orange" | "cash";
  promo_code?: string;
  quote_only?: boolean;
}

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const db = adminClient();
  const user = await requireActiveUser(req, db);
  const body = await readJson<Body>(req);

  if (!["mtn", "orange", "cash"].includes(body.payment_method)) throw new HttpError(422, "invalid payment_method");
  if (!body.delivery || !inCameroon(body.delivery)) throw new HttpError(422, "delivery point must be in Cameroon");
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) throw new HttpError(422, "1 to 30 items");
  for (const it of body.items) {
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 50) throw new HttpError(422, "quantity must be 1-50");
  }

  const { data: resto } = await db.from("restaurants_public").select("id,city_id,lat,lng,is_open,active").eq("id", body.restaurant_id).single();
  if (!resto || !resto.active) throw new HttpError(404, "restaurant not found");
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

  const route = await getRoute({ lat: resto.lat, lng: resto.lng }, body.delivery);
  const { data: card } = await db.rpc("effective_rate_card", { p_key: "delivery", p_city: resto.city_id }).single<{ max_distance_km: number | null }>();
  if (card?.max_distance_km && route.distanceKm > Number(card.max_distance_km)) throw new HttpError(422, "too far to deliver");
  const { data: fee, error: feeErr } = await db.rpc("delivery_fee", { p_distance_km: route.distanceKm, p_city: resto.city_id });
  if (feeErr) throw new HttpError(500, feeErr.message);

  const promoCode = body.promo_code?.trim() || null;
  let discount = 0;
  if (promoCode) {
    const { data, error } = await db.rpc("promo_quote", { p_code: promoCode, p_user: user.id, p_scope: "food", p_amount: subtotal + Number(fee) });
    if (error) throw new HttpError(422, error.message, "promo_invalid");
    discount = Number(data);
  }
  const total = subtotal + Number(fee) - discount;
  if (body.quote_only) {
    return json({ subtotal_xaf: subtotal, delivery_fee_xaf: fee, discount_xaf: discount, total_xaf: total, route: { polyline: route.polyline, source: route.source } });
  }

  const { data: order, error } = await db.from("orders").insert({
    customer_id: user.id,
    restaurant_id: resto.id,
    status: body.payment_method === "cash" ? "placed" : "pending_payment",
    delivery_location: `SRID=4326;POINT(${body.delivery.lng} ${body.delivery.lat})`,
    delivery_lat: body.delivery.lat, delivery_lng: body.delivery.lng,
    delivery_address: body.delivery.address?.slice(0, 200) ?? null,
    distance_km: route.distanceKm,
    subtotal_xaf: subtotal, delivery_fee_xaf: fee, discount_xaf: discount, total_xaf: total,
    promo_code: discount > 0 ? promoCode!.toUpperCase() : null,
    payment_method: body.payment_method,
  }).select().single();
  if (error) throw error;

  const { error: itemsErr } = await db.from("order_items").insert(lines.map((l) => ({ ...l, order_id: order.id })));
  if (itemsErr) {
    await db.from("orders").delete().eq("id", order.id);
    throw itemsErr;
  }
  if (discount > 0) {
    const { error: rErr } = await db.rpc("redeem_promo", {
      p_code: promoCode, p_user: user.id, p_scope: "food", p_amount: subtotal + Number(fee), p_order_id: order.id,
    });
    if (rErr) {
      await db.from("orders").delete().eq("id", order.id);
      throw new HttpError(409, rErr.message, "promo_invalid");
    }
  }
  return json({ order, items: lines }, 201);
}));
