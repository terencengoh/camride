import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";
import { Button, Card, Chip, H1, Muted, Row, Screen, styles as ui } from "../components/ui";
import { api, type OrderQuote } from "../lib/api";
import { useCart } from "../lib/cart";
import { fcfa } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { locate } from "../lib/location";
import { colors } from "../lib/theme";
import type { LatLng, PayMethod } from "../lib/types";

export default function Checkout() {
  const { t, lang } = useI18n();
  const cart = useCart();
  const [point, setPoint] = useState<LatLng | null>(null);
  const [pay, setPay] = useState<PayMethod>("mtn");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState("");
  const [quoteState, setQuoteState] = useState<{ key: string; quote: OrderQuote | null; error?: string } | null>(null);

  useEffect(() => {
    locate().then((r) => setPoint(r.point));
  }, []);

  const items = cart.lines.map((l) => ({ menu_item_id: l.item.id, quantity: l.quantity }));
  const quoteKey = point && cart.restaurantId ? `${cart.restaurantId}|${JSON.stringify(items)}|${point.lat},${point.lng}|${promo}` : null;
  const quoteData = quoteState?.key === quoteKey ? quoteState : null;
  useEffect(() => {
    if (!quoteKey || !cart.restaurantId || !point) return;
    let active = true;
    const parsed = JSON.parse(quoteKey.split("|")[1]) as { menu_item_id: string; quantity: number }[];
    api.quoteOrder(cart.restaurantId, parsed, point, "cash", promo)
      .then((q) => active && setQuoteState({ key: quoteKey, quote: q }))
      .catch((e) => active && setQuoteState({ key: quoteKey, quote: null, error: (e as Error).message }));
    return () => {
      active = false;
    };
  }, [quoteKey, cart.restaurantId, point, promo]);

  const place = async () => {
    if (!cart.restaurantId || !point) return;
    setBusy(true);
    setErr(null);
    try {
      const { order } = await api.createOrder(
        cart.restaurantId,
        items,
        point,
        pay,
        quoteData?.quote && quoteData.quote.discount_xaf > 0 ? promo : undefined,
      );
      cart.clear();
      router.replace(`/order/${order.id}`);
    } catch (e) {
      setErr(t("error", { msg: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>{t("checkout")}</H1>
      <Card>
        {cart.lines.map((l) => (
          <Row key={l.item.id}>
            <Text style={{ flex: 1 }}>{`${l.quantity} × ${lang === "fr" && l.item.name_fr ? l.item.name_fr : l.item.name}`}</Text>
            <Text>{fcfa(l.quantity * l.item.price_xaf, lang)}</Text>
          </Row>
        ))}
        <Row>
          <Text style={{ flex: 1, fontWeight: "700" }}>{t("subtotal")}</Text>
          <Text style={{ fontWeight: "700" }}>{fcfa(cart.subtotal, lang)}</Text>
        </Row>
        {quoteData?.quote ? (
          <>
            <Row>
              <Text style={{ flex: 1 }}>{t("deliveryFee")}</Text>
              <Text>{fcfa(quoteData.quote.delivery_fee_xaf, lang)}</Text>
            </Row>
            {quoteData.quote.discount_xaf > 0 ? (
              <Row>
                <Text style={{ flex: 1 }}>{`${t("discount")} ${promo}`}</Text>
                <Text>{`-${fcfa(quoteData.quote.discount_xaf, lang)}`}</Text>
              </Row>
            ) : null}
            <Row>
              <Text style={{ flex: 1, fontWeight: "800" }}>{t("total")}</Text>
              <Text style={{ fontWeight: "800" }}>{fcfa(quoteData.quote.total_xaf, lang)}</Text>
            </Row>
          </>
        ) : <Muted>{quoteData?.error ?? "…"}</Muted>}
      </Card>
      <Row>
        <TextInput style={[ui.input, { flex: 1 }]} placeholder={t("promoCode")} autoCapitalize="characters" value={promoInput} onChangeText={setPromoInput} />
        <Chip label={t("apply")} onPress={() => setPromo(promoInput.trim().toUpperCase())} />
      </Row>
      <Card>
        <Muted>{t("deliverTo")}</Muted>
        <Text>{point ? `📍 ${t("currentLocation")}` : "…"}</Text>
      </Card>
      <Muted>{t("payWith")}</Muted>
      <Row>
        <Chip label="MTN MoMo" accent={colors.mtn} selected={pay === "mtn"} onPress={() => setPay("mtn")} />
        <Chip label="Orange Money" accent={colors.orange} selected={pay === "orange"} onPress={() => setPay("orange")} />
        <Chip label={t("cash")} selected={pay === "cash"} onPress={() => setPay("cash")} />
      </Row>
      {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
      <Button title={t("placeOrder")} onPress={place} loading={busy} disabled={!point || cart.count === 0} />
    </Screen>
  );
}
