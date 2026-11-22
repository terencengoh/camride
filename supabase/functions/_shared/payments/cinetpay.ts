// CinetPay adapter: STUB. Not wired up yet; kept so the provider switch has a third option.
// Docs (FR): https://docs.cinetpay.com/api/1.0-fr/checkout/initialisation
//   POST https://api-checkout.cinetpay.com/v2/payment
//   { apikey, site_id, transaction_id, amount (multiple of 5), currency: "XAF", description,
//     notify_url, return_url, channels: "MOBILE_MONEY", customer_phone_number, ... }  -> payment_url
//   Cameroon methods: OMCM (Orange Money), MTNCM (MTN): https://docs.cinetpay.com/api/1.0-fr/checkout/tableau
//   Notifications are POSTed to notify_url; authenticate them with the x-token HMAC described in the
//   CinetPay docs and confirm with POST /v2/payment/check before trusting the status.
// To implement: hosted checkout (redirect to payment_url) fits CinetPay better than a direct push.
import {
  type InitiateInput,
  type InitiateResult,
  type NormalizedEvent,
  type PaymentProvider,
  ProviderError,
  type WebhookRequest,
  WebhookVerificationError,
} from "./types.ts";

export class CinetPayProvider implements PaymentProvider {
  readonly name = "cinetpay";
  initiate(_input: InitiateInput): Promise<InitiateResult> {
    return Promise.reject(new ProviderError("CinetPay adapter is not implemented yet"));
  }
  verifyWebhook(_req: WebhookRequest): Promise<NormalizedEvent> {
    return Promise.reject(new WebhookVerificationError("CinetPay webhooks are not implemented yet"));
  }
}
