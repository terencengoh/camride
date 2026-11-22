// Provider-independent webhook processing with idempotency.
// 1. The adapter verifies the signature and normalises the event (throws if not authentic).
// 2. The event is recorded once per (provider, event_id); duplicates are acknowledged and skipped.
// 3. The payment moves pending -> successful/failed at most once (conditional update), and the
//    amount must match what we charged.
import type { NormalizedEvent, PaymentProvider, WebhookRequest } from "./payments/types.ts";

export interface PaymentRecord {
  id: string;
  status: "pending" | "successful" | "failed";
  amount_xaf: number;
  trip_id: string | null;
  order_id: string | null;
  provider: string;
  provider_ref: string | null;
}

export interface WebhookStore {
  findPayment(provider: string, paymentId: string | null, providerRef: string | null): Promise<PaymentRecord | null>;
  /** Inserts the event; returns false if (provider, eventId) was already recorded. */
  recordEvent(provider: string, eventId: string, paymentId: string | null, payload: unknown): Promise<boolean>;
  /** Moves a *pending* payment to a final status; returns false if it was not pending anymore. */
  settlePayment(paymentId: string, status: "successful" | "failed", providerRef: string | null, failureReason: string | null): Promise<boolean>;
  /** Marks the trip/order as paid (and a pending_payment order as placed) or failed. */
  applyToTarget(payment: PaymentRecord, status: "successful" | "failed"): Promise<void>;
}

export type WebhookOutcome =
  | { result: "processed"; paymentId: string; status: "successful" | "failed" }
  | { result: "duplicate" | "ignored" | "unknown_payment" | "already_settled"; paymentId?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function processWebhook(provider: PaymentProvider, req: WebhookRequest, store: WebhookStore): Promise<WebhookOutcome> {
  const event: NormalizedEvent = await provider.verifyWebhook(req); // throws WebhookVerificationError
  const paymentId = event.paymentId && UUID_RE.test(event.paymentId) ? event.paymentId : null;
  const payment = await store.findPayment(provider.name, paymentId, event.providerRef);

  const isNew = await store.recordEvent(provider.name, event.eventId, payment?.id ?? null, event.raw);
  if (!isNew) return { result: "duplicate", paymentId: payment?.id };
  if (!payment) return { result: "unknown_payment" };
  if (event.status === "ignored") return { result: "ignored", paymentId: payment.id };
  if (payment.status !== "pending") return { result: "already_settled", paymentId: payment.id };

  let status = event.status;
  let reason: string | null = status === "failed" ? "provider_reported_failure" : null;
  if (status === "successful" && event.amountXaf != null && event.amountXaf !== payment.amount_xaf) {
    status = "failed";
    reason = `amount_mismatch: expected ${payment.amount_xaf}, got ${event.amountXaf}`;
  }
  const updated = await store.settlePayment(payment.id, status, event.providerRef, reason);
  if (!updated) return { result: "already_settled", paymentId: payment.id };
  await store.applyToTarget(payment, status);
  return { result: "processed", paymentId: payment.id, status };
}
