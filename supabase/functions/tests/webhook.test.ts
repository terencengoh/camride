import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { hmacSha256Hex, signHs256Jwt } from "../_shared/crypto.ts";
import { CamPayProvider } from "../_shared/payments/campay.ts";
import { NotchPayProvider } from "../_shared/payments/notchpay.ts";
import { WebhookVerificationError } from "../_shared/payments/types.ts";
import { type PaymentRecord, processWebhook, type WebhookStore } from "../_shared/webhook.ts";

const PAY_ID = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";

function memoryStore(initial: PaymentRecord[]) {
  const payments = new Map(initial.map((p) => [p.id, { ...p }]));
  const events = new Set<string>();
  const applied: string[] = [];
  const store: WebhookStore = {
    findPayment: (provider, id, ref) => Promise.resolve(
      [...payments.values()].find((p) => p.provider === provider && ((id && p.id === id) || (ref && p.provider_ref === ref))) ?? null,
    ),
    recordEvent: (provider, eventId) => {
      const k = `${provider}:${eventId}`;
      if (events.has(k)) return Promise.resolve(false);
      events.add(k);
      return Promise.resolve(true);
    },
    settlePayment: (id, status, ref) => {
      const p = payments.get(id)!;
      if (p.status !== "pending") return Promise.resolve(false);
      p.status = status;
      if (ref) p.provider_ref = ref;
      return Promise.resolve(true);
    },
    applyToTarget: (p, status) => {
      applied.push(`${p.trip_id ?? p.order_id}:${status}`);
      return Promise.resolve();
    },
  };
  return { store, payments, applied };
}

const basePayment = (provider: string, amount = 1350): PaymentRecord => ({
  id: PAY_ID, status: "pending", amount_xaf: amount, trip_id: "trip-1", order_id: null, provider, provider_ref: null,
});

// ---------- Notch Pay (HMAC-SHA256 header) ----------
const NOTCH_HASH = "test_hash_key";
const notch = new NotchPayProvider({ baseUrl: "https://api.notchpay.co", publicKey: "pk_test", webhookHashKey: NOTCH_HASH });

async function notchRequest(body: unknown, tamper = false) {
  const raw = JSON.stringify(body);
  const sig = await hmacSha256Hex(NOTCH_HASH, raw);
  return { method: "POST", url: "https://x/payments-webhook?provider=notchpay", headers: new Headers({ "x-notch-signature": tamper ? sig.replace(/.$/, "0") : sig }), rawBody: tamper ? raw.replace("1350", "13500") : raw };
}

Deno.test("notchpay: valid signature settles payment once, duplicates are ignored", async () => {
  const { store, payments, applied } = memoryStore([basePayment("notchpay")]);
  const evt = { id: "evt_1", type: "payment.complete", data: { reference: PAY_ID, id: "trx_9", amount: 1350, status: "complete" } };
  const first = await processWebhook(notch, await notchRequest(evt), store);
  assertEquals(first, { result: "processed", paymentId: PAY_ID, status: "successful" });
  assertEquals(payments.get(PAY_ID)!.status, "successful");
  const again = await processWebhook(notch, await notchRequest(evt), store);
  assertEquals(again.result, "duplicate");
  assertEquals(applied, ["trip-1:successful"]);
});

Deno.test("notchpay: tampered body or signature is rejected", async () => {
  const { store, payments } = memoryStore([basePayment("notchpay")]);
  const evt = { id: "evt_2", type: "payment.complete", data: { reference: PAY_ID, amount: 1350 } };
  await assertRejects(async () => processWebhook(notch, await notchRequest(evt, true), store), WebhookVerificationError);
  const noSig = { method: "POST", url: "https://x", headers: new Headers(), rawBody: JSON.stringify(evt) };
  await assertRejects(() => processWebhook(notch, noSig, store), WebhookVerificationError);
  assertEquals(payments.get(PAY_ID)!.status, "pending");
});

Deno.test("notchpay: amount mismatch fails the payment", async () => {
  const { store, payments, applied } = memoryStore([basePayment("notchpay", 5000)]);
  const evt = { id: "evt_3", type: "payment.complete", data: { reference: PAY_ID, amount: 50 } };
  const out = await processWebhook(notch, await notchRequest(evt), store);
  assertEquals(out, { result: "processed", paymentId: PAY_ID, status: "failed" });
  assertEquals(payments.get(PAY_ID)!.status, "failed");
  assertEquals(applied, ["trip-1:failed"]);
});

Deno.test("notchpay: a late failure after success does not overwrite it", async () => {
  const { store, payments } = memoryStore([basePayment("notchpay")]);
  await processWebhook(notch, await notchRequest({ id: "e1", type: "payment.complete", data: { reference: PAY_ID, amount: 1350 } }), store);
  const late = await processWebhook(notch, await notchRequest({ id: "e2", type: "payment.failed", data: { reference: PAY_ID } }), store);
  assertEquals(late.result, "already_settled");
  assertEquals(payments.get(PAY_ID)!.status, "successful");
});

Deno.test("notchpay: unrelated events are ignored", async () => {
  const { store } = memoryStore([basePayment("notchpay")]);
  const out = await processWebhook(notch, await notchRequest({ id: "e9", type: "payment.created", data: { reference: PAY_ID } }), store);
  assertEquals(out.result, "ignored");
});

// ---------- CamPay (JWT signature, GET or POST callback) ----------
const CAMPAY_KEY = "campay_webhook_key";
const campay = new CamPayProvider({ baseUrl: "https://demo.campay.net/api", username: "u", password: "p", webhookKey: CAMPAY_KEY });

async function campayGet(params: Record<string, string>, key = CAMPAY_KEY) {
  const signature = await signHs256Jwt({ iat: Math.floor(Date.now() / 1000) }, key);
  const qs = new URLSearchParams({ ...params, signature });
  return { method: "GET", url: `https://x/payments-webhook?provider=campay&${qs}`, headers: new Headers(), rawBody: "" };
}

Deno.test("campay: signed GET callback settles payment (MTN), duplicate ignored", async () => {
  const { store, payments } = memoryStore([basePayment("campay")]);
  const params = { status: "SUCCESSFUL", reference: "cp-ref-1", amount: "1350", currency: "XAF", operator: "MTN", external_reference: PAY_ID };
  assertEquals((await processWebhook(campay, await campayGet(params), store)).result, "processed");
  assertEquals(payments.get(PAY_ID)!.status, "successful");
  assertEquals(payments.get(PAY_ID)!.provider_ref, "cp-ref-1");
  assertEquals((await processWebhook(campay, await campayGet(params), store)).result, "duplicate");
});

Deno.test("campay: POST JSON callback (Orange) marks failure", async () => {
  const { store, payments } = memoryStore([basePayment("campay")]);
  const signature = await signHs256Jwt({}, CAMPAY_KEY);
  const req = { method: "POST", url: "https://x", headers: new Headers({ "content-type": "application/json" }),
    rawBody: JSON.stringify({ status: "FAILED", reference: "cp-2", amount: "1350", operator: "ORANGE", external_reference: PAY_ID, signature }) };
  assertEquals(await processWebhook(campay, req, store), { result: "processed", paymentId: PAY_ID, status: "failed" });
  assertEquals(payments.get(PAY_ID)!.status, "failed");
});

Deno.test("campay: wrong key or missing signature rejected", async () => {
  const { store } = memoryStore([basePayment("campay")]);
  const params = { status: "SUCCESSFUL", reference: "cp-3", amount: "1350", external_reference: PAY_ID };
  await assertRejects(async () => processWebhook(campay, await campayGet(params, "attacker_key"), store), WebhookVerificationError);
  const noSig = { method: "GET", url: `https://x/?${new URLSearchParams(params)}`, headers: new Headers(), rawBody: "" };
  await assertRejects(() => processWebhook(campay, noSig, store), WebhookVerificationError);
});

Deno.test("campay: unknown payment is acknowledged but not applied", async () => {
  const { store, applied } = memoryStore([]);
  const out = await processWebhook(campay, await campayGet({ status: "SUCCESSFUL", reference: "cp-4", amount: "10", external_reference: PAY_ID }), store);
  assertEquals(out.result, "unknown_payment");
  assertEquals(applied.length, 0);
});

// ---------- initiate() request shapes (no network: injected fetch) ----------
Deno.test("campay initiate: token then collect with external_reference", async () => {
  const calls: { url: string; body: unknown; auth: string | null }[] = [];
  const fake = ((url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get("Authorization") });
    const resp = url.endsWith("/token/") ? { token: "tok", expires_in: 3600 } : { reference: "cp-ref", ussd_code: "*126#", operator: "MTN" };
    return Promise.resolve(new Response(JSON.stringify(resp), { status: 200 }));
  }) as typeof fetch;
  const p = new CamPayProvider({ baseUrl: "https://demo.campay.net/api", username: "u", password: "p", webhookKey: "k" }, fake);
  const res = await p.initiate({ paymentId: PAY_ID, amountXaf: 1350, phone: "237677123456", method: "mtn", description: "trip" });
  assertEquals(res.providerRef, "cp-ref");
  assertEquals(calls[1].url, "https://demo.campay.net/api/collect/");
  assertEquals(calls[1].auth, "Token tok");
  assertEquals(calls[1].body, { amount: "1350", currency: "XAF", from: "237677123456", description: "trip", external_reference: PAY_ID });
});

Deno.test("notchpay initiate: create then process with cm.orange channel", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fake = ((url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    const resp = calls.length === 1 ? { transaction: { reference: "np_ref" } } : { status: "Accepted" };
    return Promise.resolve(new Response(JSON.stringify(resp), { status: 201 }));
  }) as typeof fetch;
  const p = new NotchPayProvider({ baseUrl: "https://api.notchpay.co", publicKey: "pk", webhookHashKey: "h" }, fake);
  const res = await p.initiate({ paymentId: PAY_ID, amountXaf: 2500, phone: "237699999999", method: "orange", description: "order" });
  assertEquals(res.providerRef, "np_ref");
  assertEquals(calls[0].url, "https://api.notchpay.co/payments");
  assertEquals(calls[0].body.reference, PAY_ID);
  assertEquals(calls[1].url, "https://api.notchpay.co/payments/np_ref");
  assertEquals(calls[1].body, { channel: "cm.orange", data: { phone: "+237699999999" } });
});
