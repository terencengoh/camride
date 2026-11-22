// /functions/v1/payments-webhook?provider=campay|notchpay
// Public endpoint (verify_jwt = false in config.toml): authenticity comes from the provider signature.
// Always answers 200 for authentic events (including duplicates) so providers stop retrying;
// 401 for bad signatures.
import { corsHeaders, json } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { getProvider, PROVIDERS, WebhookVerificationError } from "../_shared/payments/index.ts";
import { processWebhook } from "../_shared/webhook.ts";
import { supabaseWebhookStore } from "../_shared/webhook_store.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const name = new URL(req.url).searchParams.get("provider") ?? "";
  if (!PROVIDERS.includes(name as never)) return json({ error: "unknown provider" }, 400);
  try {
    const provider = getProvider(name);
    const rawBody = req.method === "GET" ? "" : await req.text();
    const outcome = await processWebhook(provider, { method: req.method, url: req.url, headers: req.headers, rawBody }, supabaseWebhookStore(adminClient()));
    return json(outcome, 200);
  } catch (e) {
    if (e instanceof WebhookVerificationError) return json({ error: "invalid signature" }, 401);
    console.error("webhook error", e);
    return json({ error: "internal_error" }, 500); // provider may retry; processing is idempotent
  }
});
