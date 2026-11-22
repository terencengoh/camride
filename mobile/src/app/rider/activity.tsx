import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { Card, H1, Muted, Row, Screen } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { fcfa, shortDate } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";
import type { Order, Trip } from "../../lib/types";

type Item = { kind: "trip"; row: Trip } | { kind: "order"; row: Order };

export default function ActivityScreen() {
  const { t, lang } = useI18n();
  const { session } = useAuth();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const [{ data: trips }, { data: orders }] = await Promise.all([
        supabase.from("trips").select("*").eq("rider_id", session.user.id).order("created_at", { ascending: false }).limit(30),
        supabase.from("orders").select("*").eq("customer_id", session.user.id).order("created_at", { ascending: false }).limit(30),
      ]);
      const all: Item[] = [
        ...((trips ?? []) as Trip[]).map((row) => ({ kind: "trip" as const, row })),
        ...((orders ?? []) as Order[]).map((row) => ({ kind: "order" as const, row })),
      ].sort((a, b) => b.row.created_at.localeCompare(a.row.created_at));
      setItems(all);
    })();
  }, [session]);

  return (
    <Screen>
      <H1>{t("activity")}</H1>
      {items.length === 0 ? <Muted>{t("none")}</Muted> : null}
      {items.map((it) => (
        <Pressable key={it.row.id} onPress={() => router.push(it.kind === "trip" ? `/trip/${it.row.id}` : `/order/${it.row.id}`)}>
          <Card>
            <Row>
              <Text style={{ fontWeight: "700", flex: 1 }}>
                {it.kind === "trip" ? `🚗 ${t(it.row.vehicle_type)}` : "🍲 " + t("food")}
              </Text>
              <Text style={{ fontWeight: "800" }}>{fcfa(it.kind === "trip" ? it.row.fare_xaf : it.row.total_xaf, lang)}</Text>
            </Row>
            <Muted>{`${shortDate(it.row.created_at, lang)} · ${it.kind === "trip" ? t(`st_${it.row.status}`) : t(`os_${it.row.status}`)}`}</Muted>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
