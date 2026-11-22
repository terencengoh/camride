// Notch Pay adapter (Cameroon MTN MoMo "cm.mtn" + Orange Money "cm.orange", XAF).
// Docs: https://developer.notchpay.co/accept-payments/mobile-money
//   POST https://api.notchpay.co/payments            Authorization: <public key>
//        { amount, currency: "XAF", customer: { phone }, description, reference }   -> payment reference
//   POST https://api.notchpay.co/payments/{reference} { channel: "cm.mtn" | "cm.orange", data: { phone } }
//        -> the customer gets a push prompt to confirm on their phone
// Webhooks: https://developer.notchpay.co/get-started/webhooks/verify
//   Header x-notch-signature = hex(HMAC-SHA256(raw body, webhook hash key)); verify against the RAW body.
//   Event: { id, type: "payment.complete" | "payment.failed" | "payment.canceled" | "payment.expired" | ..., data: { id, reference, amount, status } }
//   (https://developer.notchpay.co/api-reference/webhooks)
import { hmacSha256Hex, timingSafeEqual } from "../crypto.ts";
import {
  type FetchFn,
  type InitiateInput,
  type InitiateResult,
  type NormalizedEvent,
  type PaymentProvider,
  ProviderError,
  type WebhookRequest,
  WebhookVerificationError,
} from "./types.ts";

export interface NotchPayConfig {
  baseUrl: string; // https://api.notchpay.co
  publicKey: string;
  webhookHashKey: string;
}

const CHANNEL = { mtn: "cm.mtn", orange: "cm.orange" } as const;

export class NotchPayProvider implements PaymentProvider {
  readonly name = "notchpay";
  constructor(private cfg: NotchPayConfig, private fetchFn: FetchFn = fetch) {}

  private async call(path: string, body: unknown) {
    const res = await this.fetchFn(`${this.cfg.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: this.cfg.publicKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ProviderError(`Notch Pay ${path} failed (${res.status})`, json);
    return json;
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const phone = `+${input.phone}`;
    const created = await this.call("/payments", {
      amount: input.amountXaf,
      currency: "XAF",
      customer: { phone },
      description: input.description,
      reference: input.paymentId,
    });
    const reference: string | undefined = created?.transaction?.reference ?? created?.payment?.reference ?? created?.reference;
    if (!reference) throw new ProviderError("Notch Pay did not return a payment reference", created);
    const processed = await this.call(`/payments/${encodeURIComponent(reference)}`, {
      channel: CHANNEL[input.method],
      data: { phone },
    });
    return { providerRef: reference, status: "pending", raw: { created, processed } };
  }

  async verifyWebhook(req: WebhookRequest): Promise<NormalizedEvent> {
    const received = req.headers.get("x-notch-signature") ?? "";
    if (!received) throw new WebhookVerificationError("missing x-notch-signature");
    const expected = await hmacSha256Hex(this.cfg.webhookHashKey, req.rawBody);
    if (!timingSafeEqual(expected, received.toLowerCase())) throw new WebhookVerificationError("invalid Notch Pay signature");
    let evt: { id?: string; type?: string; data?: Record<string, unknown> };
    try {
      evt = JSON.parse(req.rawBody);
    } catch {
      throw new WebhookVerificationError("invalid JSON");
    }
    const data = evt.data ?? {};
    const type = String(evt.type ?? evt["event" as keyof typeof evt] ?? "");
    const status = type === "payment.complete" ? "successful"
      : ["payment.failed", "payment.canceled", "payment.expired"].includes(type) ? "failed"
      : "ignored";
    const merchantRef = (data.merchant_reference ?? data.reference) as string | undefined;
    const providerRef = (data.reference ?? data.id) as string | undefined;
    return {
      eventId: String(evt.id ?? `${providerRef}:${type}`),
      paymentId: merchantRef ?? null,
      providerRef: providerRef ?? null,
      status,
      amountXaf: data.amount != null ? Math.round(Number(data.amount)) : null,
      raw: evt,
    };
  }
}
