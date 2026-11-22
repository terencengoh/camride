// Executes approved payouts and requested refunds through a payment provider, and refreshes their status.
// State lives in Postgres (payout_requests / refunds); the SQL functions own the ledger postings:
//   payout:  approved --mark_processing--> processing --set_result--> paid | failed (failed releases the hold)
//   refund:  requested --mark_processing--> processing --set_result--> succeeded | failed
// A provider error that clearly means "nothing was sent" marks the transfer failed; anything ambiguous
// (timeouts, 5xx) leaves it processing so an admin can refresh the status instead of paying twice.
import { type PaymentProvider, ProviderError } from "./payments/types.ts";

export type TransferKind = "payout" | "refund";

export interface TransferRecord {
  id: string;
  status: string;
  amount_xaf: number;
  phone: string;
  method: "mtn" | "orange";
  provider: string | null;
  provider_ref: string | null;
  name: string;
}

export interface TransferStore {
  get(kind: TransferKind, id: string): Promise<TransferRecord | null>;
  markProcessing(kind: TransferKind, id: string, provider: string): Promise<void>;
  /** status: final ("successful"/"failed") or "pending" to just record the provider reference. */
  setResult(kind: TransferKind, id: string, status: "successful" | "failed" | "pending", providerRef: string | null, reason: string | null): Promise<void>;
}

export type TransferOutcome = {
  kind: TransferKind;
  id: string;
  status: "successful" | "failed" | "pending" | "unknown";
  providerRef: string | null;
  reason?: string;
};

export const transferReference = (kind: TransferKind, id: string) => `${kind === "payout" ? "po" : "rf"}-${id}`;

export async function executeTransfer(kind: TransferKind, id: string, provider: PaymentProvider, store: TransferStore): Promise<TransferOutcome> {
  const rec = await store.get(kind, id);
  if (!rec) throw new Error(`${kind} not found`);
  const ready = kind === "payout" ? "approved" : "requested";
  if (rec.status !== ready) throw new Error(`${kind} is ${rec.status}, expected ${ready}`);
  await store.markProcessing(kind, id, provider.name);
  try {
    const res = await provider.payout({
      reference: transferReference(kind, id),
      amountXaf: rec.amount_xaf,
      phone: rec.phone,
      method: rec.method,
      name: rec.name,
      description: kind === "payout" ? "CamRide payout" : "CamRide refund",
    });
    await store.setResult(kind, id, res.status, res.providerRef, res.failureReason ?? null);
    return { kind, id, status: res.status, providerRef: res.providerRef, reason: res.failureReason };
  } catch (e) {
    if (e instanceof ProviderError && e.definitive) {
      await store.setResult(kind, id, "failed", null, e.message.slice(0, 200));
      return { kind, id, status: "failed", providerRef: null, reason: e.message };
    }
    console.error(`${kind} ${id} transfer outcome unknown`, e instanceof ProviderError ? e.details : e);
    return { kind, id, status: "unknown", providerRef: null, reason: "provider outcome unknown; refresh the status later" };
  }
}

export async function refreshTransfer(kind: TransferKind, id: string, provider: PaymentProvider, store: TransferStore): Promise<TransferOutcome> {
  const rec = await store.get(kind, id);
  if (!rec) throw new Error(`${kind} not found`);
  if (rec.status !== "processing") return { kind, id, status: "unknown", providerRef: rec.provider_ref, reason: `already ${rec.status}` };
  const res = await provider.payoutStatus(transferReference(kind, id), rec.provider_ref);
  await store.setResult(kind, id, res.status, res.providerRef ?? rec.provider_ref, res.failureReason ?? null);
  return { kind, id, status: res.status, providerRef: res.providerRef ?? rec.provider_ref, reason: res.failureReason };
}
