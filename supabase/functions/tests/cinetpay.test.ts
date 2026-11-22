import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { hmacSha256Hex } from "../_shared/crypto.ts";
import { CINETPAY_TOKEN_FIELDS, CinetPayProvider, cinetpayDescription } from "../_shared/payments/cinetpay.ts";
import { ProviderError, WebhookVerificationError } from "../_shared/payments/types.ts";
import { processWebhook } from "../_shared/webhook.ts";
import { fakeFetch, formOf } from "./helpers.ts";

const PAY_ID = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
const cfg = {
  apiKey: "api", siteId: "105", secretKey: "secret", notifyUrl: "https://x/payments-webhook?provider=cinetpay",
  returnUrl: "https://x/paid", transferPassword: "tpw",
};

function provider(checkStatus = "ACCEPTED", amount = "1350") {
  return fakeFetch([
    [/POST .*\/v2\/payment$/, () => ({ body: { code: "201", message: "CREATED", data: { payment_token: "tok123", payment_url: "https://checkout.cinetpay.com/payment/tok123" } } })],
    [/POST .*\/v2\/payment\/check$/, () => ({ body: { code: "00", data: { status: checkStatus, amount, currency: "XAF" } } })],
    [/POST .*\/v1\/auth\/login$/, () => ({ body: { code: 0, data: { token: "ttok" } } })],
    [/POST .*\/v1\/transfer\/contact/, () => ({ body: { code: 0, data: [[{ code: 726, status: "ERROR_PHONE_ALREADY_MY_CONTACT" }]] } })],
    [/POST .*\/v1\/transfer\/money\/send\/contact/, () => ({ body: { code: 0, data: [[{ transaction_id: "CP-TR-1", lot: "1", treatment_status: "NEW" }]] } })],
    [/GET .*\/v1\/transfer\/check\/money/, () => ({ body: { code: 0, data: [{ transaction_id: "CP-TR-1", treatment_status: "VAL" }] } })],
  ]);
}

Deno.test("cinetpay init: hosted checkout request and payment_url", async () => {
  const f = provider();
  const cp = new CinetPayProvider(cfg, f.fetch);
  const res = await cp.initiate({ paymentId: PAY_ID, amountXaf: 1350, phone: "237677777777", method: "mtn", description: "CamRide trip #12/ab" });
  assertEquals(res.checkoutUrl, "https://checkout.cinetpay.com/payment/tok123");
  assertEquals(res.providerRef, "tok123");
  const body = JSON.parse(f.calls[0].body);
  assertEquals(body.transaction_id, PAY_ID);
  assertEquals(body.currency, "XAF");
  assertEquals(body.channels, "MOBILE_MONEY");
  assertEquals(body.site_id, "105");
  assertEquals(body.description, "CamRide trip 12 ab");
  assertEquals(body.customer_phone_number, "677777777");
  await assertRejects(() => cp.initiate({ paymentId: PAY_ID, amountXaf: 1352, phone: "237677777777", method: "mtn", description: "x" }), ProviderError);
});

async function notification(fields: Record<string, string>, secret = "secret") {
  const token = await hmacSha256Hex(secret, CINETPAY_TOKEN_FIELDS.map((k) => fields[k] ?? "").join(""));
  return { method: "POST", url: "https://x/payments-webhook?provider=cinetpay", headers: new Headers({ "x-token": token }), rawBody: new URLSearchParams(fields).toString() };
}

const FIELDS = {
  cpm_site_id: "105", cpm_trans_id: PAY_ID, cpm_trans_date: "2026-11-22 10:00:00", cpm_amount: "1350", cpm_currency: "XAF",
  signature: "sig", payment_method: "MTNCM", cel_phone_num: "677777777", cpm_phone_prefixe: "237", cpm_language: "fr",
  cpm_version: "V4", cpm_payment_config: "Single", cpm_page_action: "Payment", cpm_custom: "", cpm_designation: "CamRide", cpm_error_message: "",
};

Deno.test("cinetpay notification: x-token HMAC verified, status confirmed with /v2/payment/check", async () => {
  const f = provider("ACCEPTED");
  const cp = new CinetPayProvider(cfg, f.fetch);
  const evt = await cp.verifyWebhook(await notification(FIELDS));
  assertEquals([evt.paymentId, evt.status, evt.amountXaf], [PAY_ID, "successful", 1350]);
  assertEquals(JSON.parse(f.calls[0].body), { apikey: "api", site_id: "105", transaction_id: PAY_ID });
  await assertRejects(async () => cp.verifyWebhook(await notification(FIELDS, "wrong")), WebhookVerificationError);
  const tampered = await notification(FIELDS);
  tampered.rawBody = tampered.rawBody.replace("1350", "50");
  await assertRejects(() => cp.verifyWebhook(tampered), WebhookVerificationError);
  const refused = await new CinetPayProvider(cfg, provider("REFUSED").fetch).verifyWebhook(await notification(FIELDS));
  assertEquals(refused.status, "failed");
});

Deno.test("cinetpay transfer: login, contact (726 tolerated), send with MTNCM, check VAL", async () => {
  const f = provider();
  const cp = new CinetPayProvider(cfg, f.fetch);
  const ref = `rf-${PAY_ID}`;
  const res = await cp.payout({ reference: ref, amountXaf: 1350, phone: "237677777777", method: "mtn", name: "Awa Ngono", description: "CamRide refund" });
  assertEquals([res.status, res.providerRef], ["pending", "CP-TR-1"]);
  assertEquals(formOf(f.calls[0].body), { apikey: "api", password: "tpw" });
  const send = f.calls.find((c) => c.url.includes("/money/send/contact"))!;
  assertEquals(new URL(send.url).searchParams.get("token"), "ttok");
  const data = JSON.parse(formOf(send.body).data)[0];
  assertEquals(data, { prefix: "237", phone: "677777777", amount: 1350, client_transaction_id: ref, notify_url: cfg.notifyUrl, payment_method: "MTNCM" });
  const st = await cp.payoutStatus(ref, null);
  assertEquals(st.status, "successful");
  assertEquals(f.calls.filter((c) => c.url.includes("/auth/login")).length, 1); // token cached
});

Deno.test("cinetpay transfer notification is re-checked through the API and settles the transfer", async () => {
  const f = provider();
  const cp = new CinetPayProvider(cfg, f.fetch);
  const ref = `po-${PAY_ID}`;
  const settled: string[] = [];
  const events = new Set<string>();
  const store = {
    findPayment: () => Promise.resolve(null),
    recordEvent: (_p: string, id: string) => Promise.resolve(events.has(id) ? false : (events.add(id), true)),
    settlePayment: () => Promise.resolve(false),
    applyToTarget: () => Promise.resolve(),
    settleTransfer: (r: string, s: string) => (settled.push(`${r}:${s}`), Promise.resolve(true)),
  };
  const req = { method: "POST", url: "https://x", headers: new Headers(), rawBody: new URLSearchParams({ client_transaction_id: ref, transaction_id: "CP-TR-1", treatment_status: "VAL" }).toString() };
  assertEquals(await processWebhook(cp, req, store), { result: "transfer_processed", reference: ref, status: "successful" });
  assertEquals((await processWebhook(cp, req, store)).result, "duplicate");
  assertEquals(settled, [`${ref}:successful`]);
  const bad = { ...req, rawBody: new URLSearchParams({ client_transaction_id: "evil" }).toString() };
  await assertRejects(() => cp.verifyWebhook(bad), WebhookVerificationError);
});

Deno.test("cinetpay description sanitising", () => {
  assertEquals(cinetpayDescription("Order #1 & co/$_x"), "Order 1 co x");
});
