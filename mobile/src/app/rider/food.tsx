import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { Card, H1, Muted, Row, Screen } from "../../components/ui";
import { fcfa, km } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { locate } from "../../lib/location";
import { placeById } from "../../lib/places";
import { supabase } from "../../lib/supabase";
import type { RestaurantNear } from "../../lib/types";

export default function FoodScreen() {
  const { t, lang } = useI18n();
  const [list, setList] = useState<RestaurantNear[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { point } = await locate();
      const { data, error } = await supabase.rpc("restaurants_near", { p_lat: point.lat, p_lng: point.lng, p_radius_km: 25 });
      if (error) setErr(error.message);
      setList((data ?? []) as RestaurantNear[]);
    })();
  }, []);

  return (
    <Screen>
      <H1>{t("restaurantsNear")}</H1>
      {err ? <Muted>{t("error", { msg: err })}</Muted> : null}
      {list && list.length === 0 ? <Muted>{t("noRestaurants")}</Muted> : null}
      {list?.map((r) => (
        <Pressable key={r.id} onPress={() => router.push(`/restaurant/${r.id}`)} disabled={!r.is_open}>
          <Card style={{ opacity: r.is_open ? 1 : 0.5 }}>
            <Row>
              <Text style={{ fontSize: 30 }}>{r.emoji ?? "🍲"}</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", flex: 1 }}>{r.name}</Text>
            </Row>
            <Muted>{[r.tags, placeById(r.city_id).name].filter(Boolean).join(" · ")}</Muted>
            <Muted>{`${km(r.distance_km, lang)} · ${t("deliveryFee")} ${fcfa(r.delivery_fee_xaf, lang)}${r.is_open ? "" : " · " + t("closed")}`}</Muted>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
