// POST /functions/v1/refunds-process   (admin only)
// { payment_id, amount_xaf, reason }  -> creates the refund (admin_create_refund, audited) and sends it
// { refund_id, action: "send" | "refresh" } -> sends a requested refund / refreshes a processing one
// Refunds go back to the payer's mobile money number through the payout provider; the ledger reversal
// is posted by refund_set_result when the transfer succeeds. Cash disputes use wallet adjustments instead.
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { adminClient, requireAdmin, userClient } from "../_shared/supabase.ts";
import { getPayoutProvider } from "../_shared/payments/index.ts";
import { executeTransfer, refreshTransfer } from "../_shared/transfers.ts";
import { supabaseTransferStore } from "../_shared/transfer_store.ts";

interface Body { payment_id?: string; amount_xaf?: number; reason?: string; refund_id?: string; action?: "send" | "refresh" }

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const db = adminClient();
  await requireAdmin(req, db);
  const body = await readJson<Body>(req);
  const store = supabaseTransferStore(db);
  let refundId = body.refund_id;
  let action = body.action ?? "send";

  if (body.payment_id) {
    if (!Number.isInteger(body.amount_xaf) || (body.amount_xaf ?? 0) <= 0) throw new HttpError(422, "amount_xaf must be a positive integer");
    const { data, error } = await userClient(req).rpc("admin_create_refund", {
      p_payment_id: body.payment_id, p_amount: body.amount_xaf, p_reason: body.reason ?? "",
    });
    if (error) throw new HttpError(409, error.message);
    refundId = (data as { id: string }).id;
    action = "send";
  }
  if (!refundId) throw new HttpError(422, "payment_id or refund_id required");
  if (action === "send") return json(await executeTransfer("refund", refundId, getPayoutProvider(), store));
  if (action === "refresh") return json(await refreshTransfer("refund", refundId, getPayoutProvider(), store));
  throw new HttpError(422, "action must be send or refresh");
}));
