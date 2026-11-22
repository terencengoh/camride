// POST /functions/v1/payments-initiate  { trip_id | order_id, method: "mtn" | "orange", phone }
// Charges the amount stored in the database (never a client amount) via the configured provider.
// The customer approves on their own phone; the final status arrives through payments-webhook
// and reaches the app through Realtime on the payments row.
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { detectOperator, normalizeCmPhone } from "../_shared/phone.ts";
import { getProvider, ProviderError } from "../_shared/payments/index.ts";

interface Body { trip_id?: string; order_id?: string; method: "mtn" | "orange"; phone: string }

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const db = adminClient();
  const user = await requireUser(req, db);
  const body = await readJson<Body>(req);
  if (!body.trip_id === !body.order_id) throw new HttpError(422, "send exactly one of trip_id or order_id");
  if (body.method !== "mtn" && body.method !== "orange") throw new HttpError(422, "method must be mtn or orange");

  const phone = normalizeCmPhone(body.phone);
  if (!phone) throw new HttpError(422, "enter a Cameroon mobile number (+237 6XX XXX XXX)", "bad_phone");
  const op = detectOperator(phone);
  if (op !== body.method) throw new HttpError(422, `this number looks like ${op ?? "another operator"}, not ${body.method}`, "operator_mismatch");

  let amount: number;
  let description: string;
  if (body.trip_id) {
    const { data: t } = await db.from("trips").select("id,rider_id,fare_xaf,status,payment_status").eq("id", body.trip_id).single();
    if (!t || t.rider_id !== user.id) throw new HttpError(404, "trip not found");
    if (t.status === "cancelled" || t.payment_status === "paid") throw new HttpError(409, "nothing to pay");
    amount = t.fare_xaf;
    description = `CamRide trip ${t.id.slice(0, 8)}`;
  } else {
    const { data: o } = await db.from("orders").select("id,customer_id,total_xaf,status,payment_status").eq("id", body.order_id!).single();
    if (!o || o.customer_id !== user.id) throw new HttpError(404, "order not found");
    if (o.status !== "pending_payment" || o.payment_status === "paid") throw new HttpError(409, "nothing to pay");
    amount = o.total_xaf;
    description = `CamRide order ${o.id.slice(0, 8)}`;
  }

  // Avoid spamming the customer's phone: reuse a pending charge from the last 2 minutes.
  const since = new Date(Date.now() - 120_000).toISOString();
  const target = body.trip_id ? { col: "trip_id", id: body.trip_id } : { col: "order_id", id: body.order_id! };
  const { data: recent } = await db.from("payments").select("id,status,provider_ref").eq(target.col, target.id)
    .eq("status", "pending").gte("created_at", since).limit(1);
  if (recent?.length) return json({ payment_id: recent[0].id, status: "pending", reused: true });

  const provider = getProvider();
  const { data: payment, error } = await db.from("payments").insert({
    payer_id: user.id, [target.col]: target.id, amount_xaf: amount, method: body.method, provider: provider.name, phone,
  }).select("id").single();
  if (error) throw error;

  try {
    const res = await provider.initiate({ paymentId: payment.id, amountXaf: amount, phone, method: body.method, description });
    await db.from("payments").update({ provider_ref: res.providerRef }).eq("id", payment.id);
    await db.from(body.trip_id ? "trips" : "orders").update({ payment_status: "pending" }).eq("id", target.id).neq("payment_status", "paid");
    return json({
      payment_id: payment.id, status: res.status,
      ussd_code: res.ussdCode ?? (body.method === "mtn" ? "*126#" : "#150*50#"),
    }, 201);
  } catch (e) {
    const reason = e instanceof ProviderError ? e.message : "provider_unreachable";
    await db.from("payments").update({ status: "failed", failure_reason: reason }).eq("id", payment.id);
    console.error("payment initiate failed", e instanceof ProviderError ? e.details : e);
    throw new HttpError(502, "the payment provider did not accept the request, please try again", "provider_error");
  }
}));
