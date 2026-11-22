// POST /functions/v1/match-driver  { trip_id } | { order_id } | { run: true }
// (Re)offers a trip or delivery to the nearest available driver/courier (SQL offer_trip / offer_order).
// { run: true } runs one scheduler pass (public.run_matching) - normally pg_cron does this every 10 s.
// Allowed callers: the trip's rider, the order's customer or restaurant owner, or the service role.
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { adminClient, isServiceRequest, requireUser } from "../_shared/supabase.ts";
import { offerOrder, offerTrip } from "../_shared/matching.ts";

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const db = adminClient();
  const body = await readJson<{ trip_id?: string; order_id?: string; run?: boolean }>(req);
  const isService = isServiceRequest(req);
  if (body.run) {
    if (!isService) throw new HttpError(403, "service role only");
    const { data, error } = await db.rpc("run_matching");
    if (error) throw new HttpError(500, error.message);
    return json(data);
  }
  if (!body.trip_id === !body.order_id) throw new HttpError(422, "send exactly one of trip_id or order_id");
  if (!isService) {
    const user = await requireUser(req, db);
    if (body.trip_id) {
      const { data } = await db.from("trips").select("rider_id").eq("id", body.trip_id).single();
      if (!data || data.rider_id !== user.id) throw new HttpError(403, "not your trip");
    } else {
      const { data } = await db.from("orders").select("customer_id, restaurants(owner_id)").eq("id", body.order_id!).single();
      const owner = (data?.restaurants as unknown as { owner_id: string | null } | null)?.owner_id;
      if (!data || (data.customer_id !== user.id && owner !== user.id)) throw new HttpError(403, "not your order");
    }
  }
  const result = body.trip_id ? await offerTrip(db, body.trip_id) : await offerOrder(db, body.order_id!);
  return json(result);
}));
