// Supabase-backed implementation of WebhookStore (service role).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { PaymentRecord, WebhookStore } from "./webhook.ts";

const COLS = "id,status,amount_xaf,trip_id,order_id,provider,provider_ref";

export function supabaseWebhookStore(db: SupabaseClient): WebhookStore {
  return {
    async findPayment(provider, paymentId, providerRef) {
      if (paymentId) {
        const { data } = await db.from("payments").select(COLS).eq("id", paymentId).eq("provider", provider).maybeSingle();
        if (data) return data as PaymentRecord;
      }
      if (providerRef) {
        const { data } = await db.from("payments").select(COLS).eq("provider", provider).eq("provider_ref", providerRef).maybeSingle();
        if (data) return data as PaymentRecord;
      }
      return null;
    },
    async recordEvent(provider, eventId, paymentId, payload) {
      const { data, error } = await db.from("webhook_events")
        .upsert({ provider, event_id: eventId, payment_id: paymentId, payload }, { onConflict: "provider,event_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    async settlePayment(paymentId, status, providerRef, failureReason) {
      const patch: Record<string, unknown> = { status, failure_reason: failureReason };
      if (providerRef) patch.provider_ref = providerRef;
      const { data, error } = await db.from("payments").update(patch).eq("id", paymentId).eq("status", "pending").select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    async applyToTarget(payment, status) {
      const paymentStatus = status === "successful" ? "paid" : "failed";
      if (payment.trip_id) {
        await db.from("trips").update({ payment_status: paymentStatus }).eq("id", payment.trip_id).neq("payment_status", "paid");
      } else if (payment.order_id) {
        await db.from("orders").update({ payment_status: paymentStatus }).eq("id", payment.order_id).neq("payment_status", "paid");
        if (status === "successful") {
          await db.from("orders").update({ status: "placed" }).eq("id", payment.order_id).eq("status", "pending_payment");
        }
      }
    },
    async settleTransfer(reference, status, providerRef, reason) {
      const [kind, id] = [reference.slice(0, 2), reference.slice(3)];
      const { error } = kind === "po"
        ? await db.rpc("payout_set_result", { p_payout_id: id, p_status: status === "successful" ? "paid" : "failed", p_provider_ref: providerRef, p_reason: reason })
        : await db.rpc("refund_set_result", { p_refund_id: id, p_status: status === "successful" ? "succeeded" : "failed", p_provider_ref: providerRef, p_reason: reason });
      if (error) {
        if (/not found/i.test(error.message)) return false;
        throw error;
      }
      return true;
    },
  };
}
