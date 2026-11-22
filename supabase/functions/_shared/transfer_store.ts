// Supabase implementation of TransferStore (service-role client; SQL functions enforce the state machine).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { TransferKind, TransferRecord, TransferStore } from "./transfers.ts";

export function supabaseTransferStore(db: SupabaseClient): TransferStore {
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  return {
    async get(kind: TransferKind, id: string): Promise<TransferRecord | null> {
      if (kind === "payout") {
        const { data } = await db.from("payout_requests")
          .select("id,status,amount_xaf,phone,method,provider,provider_ref,profiles:requested_by(full_name)").eq("id", id).maybeSingle();
        if (!data) return null;
        const name = (data.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "CamRide partner";
        return { ...data, name } as TransferRecord;
      }
      const { data } = await db.from("refunds")
        .select("id,status,amount_xaf,phone,method,provider,provider_ref,payments(payer_id,profiles:payer_id(full_name))").eq("id", id).maybeSingle();
      if (!data) return null;
      const pay = data.payments as unknown as { profiles: { full_name: string | null } | null } | null;
      return { ...data, name: pay?.profiles?.full_name ?? "CamRide customer" } as TransferRecord;
    },
    async markProcessing(kind, id, provider) {
      const { error } = kind === "payout"
        ? await db.rpc("payout_mark_processing", { p_payout_id: id, p_provider: provider })
        : await db.rpc("refund_mark_processing", { p_refund_id: id, p_provider: provider });
      check(error);
    },
    async setResult(kind, id, status, providerRef, reason) {
      const sqlStatus = status === "pending" ? "processing" : status === "successful" ? (kind === "payout" ? "paid" : "succeeded") : "failed";
      const { error } = kind === "payout"
        ? await db.rpc("payout_set_result", { p_payout_id: id, p_status: sqlStatus, p_provider_ref: providerRef, p_reason: reason })
        : await db.rpc("refund_set_result", { p_refund_id: id, p_status: sqlStatus, p_provider_ref: providerRef, p_reason: reason });
      check(error);
    },
  };
}
