// Receipt for a completed trip or delivered order: amounts, promo, payment method/reference, refunds.
// Shareable as text (no PDF dependency).
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { Button, Card, H1, Muted, Row, Screen } from "../../components/ui";
import { fcfa, km, shortDate } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { shareText } from "../../lib/share";
import { supabase } from "../../lib/supabase";
import type { Order, Trip } from "../../lib/types";

interface Payment { id: string; method: string; provider: string; provider_ref: string | null; amount_xaf: number; status: string; created_at: string }
interface Refund { amount_xaf: number; status: string; created_at: string }
type Data = { key: string; trip?: Trip; order?: Order; payments: Payment[]; refunds: Refund[] };

export default function ReceiptScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: "trip" | "order" }>();
  const { t, lang } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const key = `${kind}:${id}`;

  useEffect(() => {
    if (!id) return;
    let active = true;
    const isOrder = kind === "order";
    Promise.all([
      supabase.from(isOrder ? "orders" : "trips").select("*").eq("id", id).maybeSingle(),
      supabase.from("payments").select("id,method,provider,provider_ref,amount_xaf,status,created_at").eq(isOrder ? "order_id" : "trip_id", id).eq("status", "successful"),
    ]).then(async ([row, pays]) => {
      const payments = (pays.data ?? []) as Payment[];
      const { data: refunds } = payments.length
        ? await supabase.from("refunds").select("amount_xaf,status,created_at").in("payment_id", payments.map((p) => p.id)).eq("status", "succeeded")
        : { data: [] };
      if (!active) return;
      setData({
        key: `${kind}:${id}`,
        trip: isOrder ? undefined : (row.data as Trip),
        order: isOrder ? (row.data as Order) : undefined,
        payments,
        refunds: (refunds ?? []) as Refund[],
      });
    });
    return () => {
      active = false;
    };
  }, [id, kind]);

  const d = data?.key === key ? data : null;
  if (!d || (!d.trip && !d.order)) return <Screen><Muted>…</Muted></Screen>;

  const lines: [string, string][] = [];
  if (d.trip) {
    const tr = d.trip;
    lines.push([t("date"), shortDate(tr.completed_at ?? tr.created_at, lang)]);
    lines.push([t("pickup"), tr.pickup_address ?? `${tr.pickup_lat.toFixed(4)}, ${tr.pickup_lng.toFixed(4)}`]);
    lines.push([t("destination"), tr.dropoff_address ?? `${tr.dropoff_lat.toFixed(4)}, ${tr.dropoff_lng.toFixed(4)}`]);
    lines.push([t(tr.vehicle_type), `${km(tr.distance_km, lang)} · ${Math.round(tr.duration_min)} min`]);
    lines.push([t("fare"), fcfa(tr.fare_xaf, lang)]);
    if (tr.discount_xaf > 0) lines.push([`${t("discount")} ${tr.promo_code ?? ""}`, `-${fcfa(tr.discount_xaf, lang)}`]);
    lines.push([t("total"), fcfa(tr.amount_due_xaf, lang)]);
  } else if (d.order) {
    const o = d.order;
    lines.push([t("date"), shortDate(o.created_at, lang)]);
    lines.push([t("subtotal"), fcfa(o.subtotal_xaf, lang)]);
    lines.push([t("deliveryFee"), fcfa(o.delivery_fee_xaf, lang)]);
    if (o.discount_xaf > 0) lines.push([`${t("discount")} ${o.promo_code ?? ""}`, `-${fcfa(o.discount_xaf, lang)}`]);
    lines.push([t("total"), fcfa(o.total_xaf, lang)]);
  }
  for (const p of d.payments) {
    lines.push([t("paymentMethod"), p.method === "cash" ? t("cash") : `${p.method.toUpperCase()} (${p.provider})`]);
    if (p.provider_ref) lines.push([t("reference"), p.provider_ref]);
  }
  for (const r of d.refunds) lines.push([`${t("refunded")} ${shortDate(r.created_at, lang)}`, `-${fcfa(r.amount_xaf, lang)}`]);
  const ref = (d.trip?.id ?? d.order?.id ?? "").slice(0, 8).toUpperCase();
  const text = [`${t("receiptTitle")} #${ref}`, ...lines.map(([a, b]) => `${a}: ${b}`)].join("\n");

  return (
    <Screen>
      <H1>{`${t("receiptTitle")} #${ref}`}</H1>
      <Card>
        {lines.map(([a, b], i) => (
          <Row key={`${a}-${i}`}>
            <Text style={{ flex: 1, fontWeight: a === t("total") ? "800" : "500" }}>{a}</Text>
            <Text style={{ fontWeight: a === t("total") ? "800" : "400", flexShrink: 1, textAlign: "right" }}>{b}</Text>
          </Row>
        ))}
      </Card>
      <Muted>CamRide · Cameroun</Muted>
      <Button title={t("shareReceipt")} variant="secondary" onPress={() => shareText(text)} />
    </Screen>
  );
}
