import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { PayModal } from "../../components/PayModal";
import { Stars } from "../../components/Stars";
import { Button, Muted, Row, styles as ui } from "../../components/ui";
import { fcfa } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { useRealtimeRow } from "../../lib/realtime";
import { supabase } from "../../lib/supabase";
import { colors } from "../../lib/theme";
import type { DriverRow, Order, OrderStatus } from "../../lib/types";

const STEPS: OrderStatus[] = ["placed", "accepted", "preparing", "ready", "picked_up", "delivered"];

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { row: order } = useRealtimeRow<Order>("orders", id ?? null);
  const { row: courier } = useRealtimeRow<DriverRow>("drivers", order?.courier_id ?? null, "id,lat,lng,heading,rating_avg,vehicle_type,status,is_courier,documents_verified");
  const [payOpen, setPayOpen] = useState(false);
  const [restStars, setRestStars] = useState(0);
  const [courierStars, setCourierStars] = useState(0);
  const [comment, setComment] = useState("");
  const [rated, setRated] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!order) return <View style={{ flex: 1 }} />;

  const rate = async () => {
    setErr(null);
    const { error } = await supabase.rpc("rate_order", {
      p_order_id: order.id, p_restaurant_stars: restStars, p_courier_stars: courierStars || null, p_comment: comment.trim() || null,
    });
    if (error && !/duplicate key/.test(error.message)) setErr(error.message);
    else setRated(true);
  };
  const idx = STEPS.indexOf(order.status);

  return (
    <View style={{ flex: 1 }}>
      <MapView style={{ flex: 1 }} initialRegion={{ latitude: order.delivery_lat, longitude: order.delivery_lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}>
        <Marker coordinate={{ latitude: order.delivery_lat, longitude: order.delivery_lng }} pinColor={colors.green} />
        {courier?.lat != null && courier?.lng != null ? (
          <Marker coordinate={{ latitude: courier.lat, longitude: courier.lng }} title={t("courier")}>
            <Text style={{ fontSize: 28 }}>🛵</Text>
          </Marker>
        ) : null}
      </MapView>
      <View style={{ backgroundColor: "#fff", padding: 16, gap: 6, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>{t(`os_${order.status}`)}</Text>
        {STEPS.map((s, i) => (
          <Text key={s} style={{ color: i <= idx ? colors.ink : "#9aa7a0", fontWeight: i === idx ? "800" : "400" }}>
            {`${i <= idx ? "●" : "○"} ${t(`os_${s}`)}`}
          </Text>
        ))}
        <Row>
          <Muted>{`${t("subtotal")} ${fcfa(order.subtotal_xaf, lang)} · ${t("deliveryFee")} ${fcfa(order.delivery_fee_xaf, lang)}`}</Muted>
        </Row>
        {order.discount_xaf > 0 ? <Muted>{`${t("discount")} ${order.promo_code ?? ""}: -${fcfa(order.discount_xaf, lang)}`}</Muted> : null}
        <Text style={{ fontWeight: "800" }}>{`${t("total")}: ${fcfa(order.total_xaf, lang)}`}</Text>
        {order.status === "delivered" && !rated ? (
          <>
            <Text style={{ fontWeight: "700" }}>{t("rateRestaurant")}</Text>
            <Stars value={restStars} onChange={setRestStars} />
            {order.courier_id ? <Text style={{ fontWeight: "700" }}>{t("rateCourier")}</Text> : null}
            {order.courier_id ? <Stars value={courierStars} onChange={setCourierStars} /> : null}
            <TextInput style={ui.input} placeholder={t("comment")} value={comment} onChangeText={setComment} maxLength={500} />
            <Button title={t("save")} onPress={rate} disabled={!restStars} />
          </>
        ) : null}
        {rated ? <Muted>{t("thanks")}</Muted> : null}
        {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
        {order.status === "delivered" ? <Button title={t("viewReceipt")} variant="secondary" onPress={() => router.push(`/receipt/${order.id}?kind=order`)} /> : null}
        {order.status === "pending_payment" ? <Button title={t("payNow", { amount: fcfa(order.total_xaf, lang) })} onPress={() => setPayOpen(true)} /> : null}
        {["delivered", "cancelled"].includes(order.status) ? <Button title="OK" variant="secondary" onPress={() => router.replace("/rider/food")} /> : null}
      </View>
      <PayModal
        visible={payOpen}
        target={{ order_id: order.id }}
        amount={order.total_xaf}
        defaultMethod={order.payment_method === "orange" ? "orange" : "mtn"}
        onClose={() => setPayOpen(false)}
        onPaid={() => setPayOpen(false)}
      />
    </View>
  );
}
