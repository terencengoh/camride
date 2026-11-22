import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeTransfer, refreshTransfer, type TransferRecord, type TransferStore } from "../_shared/transfers.ts";
import { type PaymentProvider, type PayoutResult, ProviderError } from "../_shared/payments/types.ts";

const ID = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";

function memory(rec: Partial<TransferRecord>) {
  const r: TransferRecord = { id: ID, status: "approved", amount_xaf: 2000, phone: "237677777777", method: "mtn", provider: null, provider_ref: null, name: "Jean", ...rec };
  const log: string[] = [];
  const store: TransferStore = {
    get: () => Promise.resolve({ ...r }),
    markProcessing: (_k, _id, p) => {
      r.status = "processing";
      r.provider = p;
      log.push(`processing:${p}`);
      return Promise.resolve();
    },
    setResult: (kind, _id, status, ref, reason) => {
      if (status !== "pending") r.status = status === "successful" ? (kind === "payout" ? "paid" : "succeeded") : "failed";
      if (ref) r.provider_ref = ref;
      log.push(`${status}:${ref ?? ""}:${reason ?? ""}`);
      return Promise.resolve();
    },
  };
  return { store, r, log };
}

function fakeProvider(payout: () => Promise<PayoutResult>, status?: () => Promise<PayoutResult>): PaymentProvider & { refs: string[] } {
  const refs: string[] = [];
  return {
    name: "fake",
    refs,
    initiate: () => Promise.reject(new Error("unused")),
    verifyWebhook: () => Promise.reject(new Error("unused")),
    payout: (input) => (refs.push(input.reference), payout()),
    payoutStatus: (ref) => (refs.push(ref), (status ?? payout)()),
  };
}

Deno.test("payout: approved -> processing -> pending with provider ref, then refresh -> paid", async () => {
  const { store, r, log } = memory({});
  const p = fakeProvider(
    () => Promise.resolve({ providerRef: "P1", status: "pending", raw: {} }),
    () => Promise.resolve({ providerRef: "P1", status: "successful", raw: {} }),
  );
  const out = await executeTransfer("payout", ID, p, store);
  assertEquals(out, { kind: "payout", id: ID, status: "pending", providerRef: "P1", reason: undefined });
  assertEquals(p.refs, [`po-${ID}`]);
  assertEquals(r.status, "processing");
  const ref = await refreshTransfer("payout", ID, p, store);
  assertEquals(ref.status, "successful");
  assertEquals(r.status, "paid");
  assertEquals(log, ["processing:fake", "pending:P1:", "successful:P1:"]);
  // Already final: refresh is a no-op.
  assertEquals((await refreshTransfer("payout", ID, p, store)).reason, "already paid");
});

Deno.test("payout must be approved first; refunds must be requested", async () => {
  const p = fakeProvider(() => Promise.resolve({ providerRef: null, status: "pending", raw: {} }));
  await assertRejects(() => executeTransfer("payout", ID, p, memory({ status: "requested" }).store), Error, "expected approved");
  const { store } = memory({ status: "requested" });
  const out = await executeTransfer("refund", ID, p, store);
  assertEquals(out.status, "pending");
  assertEquals(p.refs, [`rf-${ID}`]);
});

Deno.test("definitive provider refusal marks failed (hold released in SQL); ambiguous errors stay processing", async () => {
  const a = memory({});
  const out = await executeTransfer("payout", ID, fakeProvider(() => Promise.reject(new ProviderError("Insufficient balance", {}, true))), a.store);
  assertEquals(out.status, "failed");
  assertEquals(a.r.status, "failed");
  const b = memory({});
  const out2 = await executeTransfer("payout", ID, fakeProvider(() => Promise.reject(new TypeError("network down"))), b.store);
  assertEquals(out2.status, "unknown");
  assertEquals(b.r.status, "processing");
});

Deno.test("immediate provider success is recorded as paid", async () => {
  const { store, r } = memory({});
  await executeTransfer("payout", ID, fakeProvider(() => Promise.resolve({ providerRef: "P9", status: "successful", raw: {} })), store);
  assertEquals([r.status, r.provider_ref], ["paid", "P9"]);
});
