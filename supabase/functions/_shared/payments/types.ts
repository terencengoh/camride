// Provider-agnostic payment types. Amounts are integer FCFA (XAF).

export type MobileMoneyMethod = "mtn" | "orange";

export interface InitiateInput {
  /** Our payments.id (UUID). Sent to the provider as the merchant/external reference. */
  paymentId: string;
  amountXaf: number;
  /** Normalised "2376XXXXXXXX". */
  phone: string;
  method: MobileMoneyMethod;
  description: string;
}

export interface InitiateResult {
  providerRef: string | null;
  status: "pending" | "successful" | "failed";
  /** Code the customer can dial if the push prompt does not arrive (e.g. *126# for MTN). */
  ussdCode?: string;
  raw: unknown;
}

export interface WebhookRequest {
  method: string;
  url: string;
  headers: Headers;
  rawBody: string;
}

export interface NormalizedEvent {
  /** Stable id for idempotency (unique per provider). */
  eventId: string;
  /** Our payments.id when the provider echoes it back. */
  paymentId: string | null;
  providerRef: string | null;
  status: "successful" | "failed" | "ignored";
  amountXaf: number | null;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  /** Verifies authenticity (signature) and normalises the event. Throws WebhookVerificationError. */
  verifyWebhook(req: WebhookRequest): Promise<NormalizedEvent>;
}

export class WebhookVerificationError extends Error {}
export class ProviderError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}

export type FetchFn = typeof fetch;
