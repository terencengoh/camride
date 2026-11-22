import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { Button, Card, Chip, H1, Muted, Row, Screen } from "../../components/ui";
import { useCart } from "../../lib/cart";
import { fcfa } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";
import type { MenuItem } from "../../lib/types";

export default function MenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const cart = useCart();
  const [name, setName] = useState("");
  const [items, setItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    if (!id) return;
    supabase.from("restaurants").select("name").eq("id", id).single().then(({ data }) => setName(data?.name ?? ""));
    supabase.from("menu_items").select("*").eq("restaurant_id", id).eq("available", true).order("price_xaf")
      .then(({ data }) => setItems((data ?? []) as MenuItem[]));
  }, [id]);

  const qty = (itemId: string) => (cart.restaurantId === id ? cart.lines.find((l) => l.item.id === itemId)?.quantity ?? 0 : 0);

  return (
    <Screen>
      <H1>{name}</H1>
      {items.map((m) => (
        <Card key={m.id}>
          <Text style={{ fontWeight: "700", fontSize: 16 }}>{lang === "fr" && m.name_fr ? m.name_fr : m.name}</Text>
          <Muted>{(lang === "fr" ? m.description_fr : m.description) ?? ""}</Muted>
          <Row>
            <Text style={{ fontWeight: "800", flex: 1 }}>{fcfa(m.price_xaf, lang)}</Text>
            {qty(m.id) ? <Chip label="−" onPress={() => cart.remove(m.id)} /> : null}
            {qty(m.id) ? <Text style={{ fontWeight: "800" }}>{qty(m.id)}</Text> : null}
            <Chip label={`+ ${t("add")}`} onPress={() => cart.add(m)} />
          </Row>
        </Card>
      ))}
      {cart.count > 0 && cart.restaurantId === id ? (
        <Button title={`${t("viewCart", { n: cart.count })} · ${fcfa(cart.subtotal, lang)}`} onPress={() => router.push("/checkout")} />
      ) : null}
    </Screen>
  );
}
