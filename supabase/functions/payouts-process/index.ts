// POST /functions/v1/payouts-process   (admin only; called from the admin dashboard)
// { payout_id, action: "approve" | "reject" | "send" | "refresh", note? }
//   approve -> admin_review_payout (audited as the admin) then sends the money with the payout provider
//   reject  -> admin_review_payout(false): the held amount returns to the wallet
//   send    -> retries sending an approved payout whose transfer never started (e.g. provider was down)
//   refresh -> re-reads a processing transfer's status from the provider
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { adminClient, requireAdmin, userClient } from "../_shared/supabase.ts";
import { getPayoutProvider } from "../_shared/payments/index.ts";
import { executeTransfer, refreshTransfer } from "../_shared/transfers.ts";
import { supabaseTransferStore } from "../_shared/transfer_store.ts";

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const db = adminClient();
  await requireAdmin(req, db);
  const body = await readJson<{ payout_id: string; action: "approve" | "reject" | "send" | "refresh"; note?: string }>(req);
  if (!body.payout_id) throw new HttpError(422, "payout_id required");
  const store = supabaseTransferStore(db);

  if (body.action === "approve" || body.action === "reject") {
    const { error } = await userClient(req).rpc("admin_review_payout", {
      p_payout_id: body.payout_id, p_approve: body.action === "approve", p_note: body.note ?? null,
    });
    if (error) throw new HttpError(409, error.message);
    if (body.action === "reject") return json({ status: "rejected" });
    return json(await executeTransfer("payout", body.payout_id, getPayoutProvider(), store));
  }
  if (body.action === "send") return json(await executeTransfer("payout", body.payout_id, getPayoutProvider(), store));
  if (body.action === "refresh") return json(await refreshTransfer("payout", body.payout_id, getPayoutProvider(), store));
  throw new HttpError(422, "action must be approve, reject, send or refresh");
}));
