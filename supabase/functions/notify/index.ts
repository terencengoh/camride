// POST /functions/v1/notify   (service role only)
// Sends pending rows of public.notifications through the Expo Push API and records the outcome.
// Called every 10 s by pg_cron + pg_net (supabase/sql/schedule_notify.sql) or by a Database Webhook
// on INSERT into public.notifications.
import { handler, HttpError, json } from "../_shared/http.ts";
import { adminClient, isServiceRequest } from "../_shared/supabase.ts";
import { dispatchPush, type OutboxItem, type PushStore } from "../_shared/push.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

function store(db: SupabaseClient): PushStore {
  return {
    async pending(limit) {
      // Re-queue batches left in "sending" by a crashed run.
      await db.from("notifications").update({ status: "pending" }).eq("status", "sending")
        .lt("created_at", new Date(Date.now() - 5 * 60_000).toISOString());
      const { data, error } = await db.from("notifications").select("id,user_id,title,body,data,kind")
        .eq("status", "pending").order("created_at").limit(limit);
      if (error) throw error;
      // Claim the batch so overlapping runs do not double-send.
      const ids = (data ?? []).map((n) => n.id);
      if (!ids.length) return [];
      const { data: claimed, error: cErr } = await db.from("notifications").update({ status: "sending" })
        .in("id", ids).eq("status", "pending").select("id");
      if (cErr) throw cErr;
      const ok = new Set((claimed ?? []).map((c) => c.id));
      return (data as OutboxItem[]).filter((n) => ok.has(n.id));
    },
    async tokens(userIds) {
      const { data, error } = await db.from("push_tokens").select("user_id,token").in("user_id", userIds);
      if (error) throw error;
      return data ?? [];
    },
    async mark(ids, status, err) {
      const { error } = await db.from("notifications")
        .update({ status, error: err ?? null, sent_at: status === "sent" ? new Date().toISOString() : null }).in("id", ids);
      if (error) throw error;
    },
    async deleteTokens(tokens) {
      await db.from("push_tokens").delete().in("token", tokens);
    },
  };
}

Deno.serve(handler(async (req) => {
  if (!isServiceRequest(req)) throw new HttpError(403, "service role only");
  const result = await dispatchPush(store(adminClient()), { accessToken: Deno.env.get("EXPO_ACCESS_TOKEN") ?? undefined });
  return json(result);
}));
