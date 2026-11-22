// CinetPay adapter (hosted checkout for collections + Transfer API for payouts/refunds), XAF.
// Checkout docs (FR): https://docs.cinetpay.com/api/1.0-fr/checkout/initialisation
//   POST https://api-checkout.cinetpay.com/v2/payment  (JSON)
//   { apikey, site_id, transaction_id, amount (multiple of 5), currency: "XAF", description, notify_url,
//     return_url, channels: "MOBILE_MONEY", lang, metadata, customer_phone_number }
//   -> { code: "201", data: { payment_token, payment_url } }   The customer pays on payment_url.
// Notification (https://docs.cinetpay.com/api/1.0-fr/checkout/notification): form POST to notify_url with
//   header x-token = hex(HMAC-SHA256(secret key, cpm_site_id + cpm_trans_id + cpm_trans_date + cpm_amount +
//   cpm_currency + signature + payment_method + cel_phone_num + cpm_phone_prefixe + cpm_language + cpm_version +
//   cpm_payment_config + cpm_page_action + cpm_custom + cpm_designation + cpm_error_message)).
//   The status must then be confirmed with POST /v2/payment/check { apikey, site_id, transaction_id }
//   -> data.status ACCEPTED | REFUSED | (WAITING_FOR_CUSTOMER ...). CinetPay also GETs notify_url to test it.
// Transfer docs (FR): https://docs.cinetpay.com/api/1.0-fr/transfert/utilisation
//   POST https://client.cinetpay.com/v1/auth/login (form: apikey, password) -> data.token (valid 5 minutes)
//   POST /v1/transfer/contact?token=..  (form: data=[{prefix, phone, name, surname, email}])  code 726 = already exists
//   POST /v1/transfer/money/send/contact?token=..  (form: data=[{prefix, phone, amount (multiple of 5),
//        client_transaction_id, notify_url, payment_method?}])  payment_method: MTNCM | OMCM
//   GET  /v1/transfer/check/money?token=..&client_transaction_id=..  -> data[0].treatment_status VAL | REJ | NEW ...
//   Transfer notifications are not signed: we only use them as a trigger and re-read the status from the API.
import { hmacSha256Hex, timingSafeEqual } from "../crypto.ts";
import {
  type FetchFn,
  type InitiateInput,
  type InitiateResult,
  type NormalizedEvent,
  type PaymentProvider,
  type PayoutInput,
  type PayoutResult,
  ProviderError,
  type WebhookRequest,
  WebhookVerificationError,
} from "./types.ts";

export interface CinetPayConfig {
  apiKey: string;
  siteId: string;
  secretKey: string;
  notifyUrl: string;
  returnUrl: string;
  /** Transfer API password (set in the CinetPay back office); only needed for payouts/refunds. */
  transferPassword?: string;
  /** Where transfer notifications go (defaults to notifyUrl). */
  transferNotifyUrl?: string;
  checkoutBaseUrl?: string; // https://api-checkout.cinetpay.com
  transferBaseUrl?: string; // https://client.cinetpay.com
  lang?: "fr" | "en";
}

/** Fields concatenated (in this order) to compute the x-token HMAC. */
export const CINETPAY_TOKEN_FIELDS = [
  "cpm_site_id", "cpm_trans_id", "cpm_trans_date", "cpm_amount", "cpm_currency", "signature", "payment_method",
  "cel_phone_num", "cpm_phone_prefixe", "cpm_language", "cpm_version", "cpm_payment_config", "cpm_page_action",
  "cpm_custom", "cpm_designation", "cpm_error_message",
] as const;

const METHOD = { mtn: "MTNCM", orange: "OMCM" } as const;

/** CinetPay rejects some special characters in descriptions (#, /, $, _, &). */
export function cinetpayDescription(s: string): string {
  return s.replace(/[#/$_&]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "CamRide";
}

export class CinetPayProvider implements PaymentProvider {
  readonly name = "cinetpay";
  private transferToken: { value: string; expiresAt: number } | null = null;
  constructor(private cfg: CinetPayConfig, private fetchFn: FetchFn = fetch) {}

  private get checkoutBase() {
    return this.cfg.checkoutBaseUrl ?? "https://api-checkout.cinetpay.com";
  }
  private get transferBase() {
    return this.cfg.transferBaseUrl ?? "https://client.cinetpay.com";
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    if (!Number.isInteger(input.amountXaf) || input.amountXaf <= 0 || input.amountXaf % 5 !== 0) {
      throw new ProviderError("CinetPay amounts must be positive multiples of 5", null, true);
    }
    const res = await this.fetchFn(`${this.checkoutBase}/v2/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: this.cfg.apiKey,
        site_id: this.cfg.siteId,
        transaction_id: input.paymentId,
        amount: input.amountXaf,
        currency: "XAF",
        description: cinetpayDescription(input.description),
        notify_url: this.cfg.notifyUrl,
        return_url: this.cfg.returnUrl,
        channels: "MOBILE_MONEY",
        lang: this.cfg.lang ?? "fr",
        metadata: input.paymentId,
        customer_phone_number: input.phone.slice(3), // local 9-digit number, prefills the form
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (String(body?.code) !== "201" || !body?.data?.payment_url) {
      throw new ProviderError(`CinetPay init failed (${res.status} ${body?.code ?? ""} ${body?.message ?? ""})`, body, res.status < 500);
    }
    return { providerRef: String(body.data.payment_token ?? ""), status: "pending", checkoutUrl: String(body.data.payment_url), raw: body };
  }

  /** Authoritative status of a checkout transaction. */
  async checkPayment(transactionId: string): Promise<{ status: string; amount: number | null; raw: unknown }> {
    const res = await this.fetchFn(`${this.checkoutBase}/v2/payment/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: this.cfg.apiKey, site_id: this.cfg.siteId, transaction_id: transactionId }),
    });
    const body = await res.json().catch(() => ({}));
    const status = String(body?.data?.status ?? "").toUpperCase();
    if (!status) throw new ProviderError(`CinetPay check failed (${res.status})`, body);
    const amount = body?.data?.amount != null ? Math.round(Number(body.data.amount)) : null;
    return { status, amount, raw: body };
  }

  async verifyWebhook(req: WebhookRequest): Promise<NormalizedEvent> {
    const form = Object.fromEntries(new URLSearchParams(req.rawBody).entries());
    // Transfer notification (unsigned): confirm through the authenticated Transfer API.
    if (!form.cpm_trans_id && form.client_transaction_id) {
      const ref = String(form.client_transaction_id);
      if (!/^(po|rf)-[0-9a-f-]{36}$/i.test(ref)) throw new WebhookVerificationError("unknown transfer reference");
      const s = await this.payoutStatus(ref, form.transaction_id ?? null);
      return {
        kind: "transfer",
        reference: ref,
        eventId: `transfer:${ref}:${s.status}`,
        paymentId: null,
        providerRef: s.providerRef,
        status: s.status === "pending" ? "ignored" : s.status,
        amountXaf: null,
        raw: { form, check: s.raw },
      };
    }
    const received = req.headers.get("x-token") ?? "";
    if (!received || !form.cpm_trans_id) throw new WebhookVerificationError("missing x-token or cpm_trans_id");
    const data = CINETPAY_TOKEN_FIELDS.map((k) => form[k] ?? "").join("");
    const expected = await hmacSha256Hex(this.cfg.secretKey, data);
    if (!timingSafeEqual(expected, received.toLowerCase())) throw new WebhookVerificationError("invalid CinetPay x-token");
    if (form.cpm_site_id && form.cpm_site_id !== this.cfg.siteId) throw new WebhookVerificationError("site_id mismatch");

    const check = await this.checkPayment(form.cpm_trans_id);
    const status = check.status === "ACCEPTED" ? "successful" : check.status === "REFUSED" ? "failed" : "ignored";
    return {
      kind: "payment",
      eventId: `${form.cpm_trans_id}:${check.status}`,
      paymentId: form.cpm_trans_id,
      providerRef: null,
      status,
      amountXaf: check.amount,
      raw: { form, check: check.raw },
    };
  }

  // ---------- Transfer API ----------
  private async transferAuth(): Promise<string> {
    if (this.transferToken && this.transferToken.expiresAt > Date.now() + 20_000) return this.transferToken.value;
    if (!this.cfg.transferPassword) throw new ProviderError("CINETPAY_TRANSFER_PASSWORD is required for transfers", null, true);
    const res = await this.fetchFn(`${this.transferBase}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ apikey: this.cfg.apiKey, password: this.cfg.transferPassword }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    const token = body?.data?.token;
    if (Number(body?.code) !== 0 || !token) throw new ProviderError(`CinetPay transfer login failed (${body?.code ?? res.status})`, body, true);
    this.transferToken = { value: String(token), expiresAt: Date.now() + 4.5 * 60_000 };
    return String(token);
  }

  private async transferPost(path: string, data: unknown[]): Promise<Record<string, unknown>> {
    const token = await this.transferAuth();
    const res = await this.fetchFn(`${this.transferBase}${path}?token=${encodeURIComponent(token)}&lang=fr`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: JSON.stringify(data) }).toString(),
    });
    return await res.json().catch(() => ({ code: -1, status: res.status }));
  }

  async payout(input: PayoutInput): Promise<PayoutResult> {
    if (!Number.isInteger(input.amountXaf) || input.amountXaf <= 0 || input.amountXaf % 5 !== 0) {
      throw new ProviderError("CinetPay transfers must be positive multiples of 5", null, true);
    }
    const phone = input.phone.slice(3);
    const [first, ...rest] = (input.name || "CamRide").trim().split(/\s+/);
    const contact = await this.transferPost("/v1/transfer/contact", [{
      prefix: "237", phone, name: rest.join(" ") || first, surname: first, email: `${phone}@camride.invalid`,
    }]);
    const cCode = Number(contact.code);
    const nested = JSON.stringify(contact.data ?? "");
    if (cCode !== 0 && cCode !== 726 && !nested.includes("726")) {
      throw new ProviderError(`CinetPay add contact failed (${contact.code})`, contact, true);
    }
    const sent = await this.transferPost("/v1/transfer/money/send/contact", [{
      prefix: "237", phone, amount: input.amountXaf, client_transaction_id: input.reference,
      notify_url: this.cfg.transferNotifyUrl ?? this.cfg.notifyUrl, payment_method: METHOD[input.method],
    }]);
    if (Number(sent.code) !== 0) throw new ProviderError(`CinetPay transfer failed (${sent.code} ${sent.message ?? ""})`, sent, true);
    const row = firstRow(sent.data);
    return { providerRef: row?.transaction_id ? String(row.transaction_id) : null, ...mapTreatment(row?.treatment_status), raw: sent };
  }

  async payoutStatus(reference: string, _providerRef: string | null): Promise<PayoutResult> {
    const token = await this.transferAuth();
    const res = await this.fetchFn(
      `${this.transferBase}/v1/transfer/check/money?token=${encodeURIComponent(token)}&lang=fr&client_transaction_id=${encodeURIComponent(reference)}`,
    );
    const body = await res.json().catch(() => ({}));
    if (Number(body?.code) !== 0) throw new ProviderError(`CinetPay transfer check failed (${body?.code ?? res.status})`, body);
    const row = firstRow(body.data);
    return { providerRef: row?.transaction_id ? String(row.transaction_id) : null, ...mapTreatment(row?.treatment_status), raw: body };
  }
}

function firstRow(data: unknown): Record<string, unknown> | null {
  let d: unknown = data;
  while (Array.isArray(d)) d = d[0];
  return d && typeof d === "object" ? d as Record<string, unknown> : null;
}

function mapTreatment(s: unknown): { status: PayoutResult["status"]; failureReason?: string } {
  const v = String(s ?? "NEW").toUpperCase();
  if (v === "VAL") return { status: "successful" };
  if (v === "REJ") return { status: "failed", failureReason: "cinetpay_rejected" };
  return { status: "pending" };
}
