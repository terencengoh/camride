// Restaurant partner console: create the restaurant, manage the menu, accept orders
// (which triggers courier matching), mark preparing / ready.
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Switch, Text } from "react-native";
import { CityPicker } from "../../components/CityPicker";
import { Button, Card, Field, H1, Muted, Row, Screen } from "../../components/ui";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fcfa } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { locate } from "../../lib/location";
import { placeById } from "../../lib/places";
import { useRealtimeQuery } from "../../lib/realtime";
import { supabase } from "../../lib/supabase";
import { colors } from "../../lib/theme";
import type { MenuItem, Order } from "../../lib/types";

interface MyRestaurant { id: string; name: string; is_open: boolean; city_id: string }

const OPEN_ORDERS = ["placed", "accepted", "preparing", "ready", "picked_up"] as const;

export default function PartnerScreen() {
  const { t, lang } = useI18n();
  const { session, profile, signOut } = useAuth();
  const uid = session?.user.id ?? null;
  const [rest, setRest] = useState<MyRestaurant | null | undefined>(undefined);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // create form
  const [name, setName] = useState("");
  const [city, setCity] = useState(profile?.city_id ?? "douala");
  // add item form
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");

  const fetchAll = useCallback(async (): Promise<{ rest: MyRestaurant | null; menu: MenuItem[] }> => {
    if (!uid) return { rest: null, menu: [] };
    const { data } = await supabase.from("restaurants").select("id,name,is_open,city_id").eq("owner_id", uid).maybeSingle();
    if (!data) return { rest: null, menu: [] };
    const { data: m } = await supabase.from("menu_items").select("*").eq("restaurant_id", data.id).order("name");
    return { rest: data as MyRestaurant, menu: (m ?? []) as MenuItem[] };
  }, [uid]);
  const apply = (r: { rest: MyRestaurant | null; menu: MenuItem[] }) => {
    setRest(r.rest);
    setMenu(r.menu);
  };
  const load = () => fetchAll().then(apply);
  useEffect(() => {
    let active = true;
    fetchAll().then((r) => {
      if (!active) return;
      setRest(r.rest);
      setMenu(r.menu);
    });
    return () => {
      active = false;
    };
  }, [fetchAll]);

  const orders = useRealtimeQuery<Order>("orders", "restaurant_id", rest?.id ?? null, OPEN_ORDERS);

  const create = async () => {
    if (!uid || name.trim().length < 2) return;
    const r = await locate();
    const p = r.source === "gps" ? r.point : placeById(city);
    const { error } = await supabase.from("restaurants").insert({
      owner_id: uid, name: name.trim(), city_id: city, location: `SRID=4326;POINT(${p.lng} ${p.lat})`, is_open: false,
    });
    if (error) setErr(error.message);
    load();
  };

  const addItem = async () => {
    const price = parseInt(itemPrice, 10);
    if (!rest || itemName.trim().length < 2 || !Number.isFinite(price) || price < 50) return;
    const { error } = await supabase.from("menu_items").insert({ restaurant_id: rest.id, name: itemName.trim(), price_xaf: price });
    if (error) setErr(error.message);
    setItemName("");
    setItemPrice("");
    load();
  };

  const setOpen = async (v: boolean) => {
    if (!rest) return;
    await supabase.from("restaurants").update({ is_open: v }).eq("id", rest.id);
    load();
  };

  const setStatus = async (o: Order, to: "accepted" | "preparing" | "ready" | "cancelled") => {
    setErr(null);
    const { error } = await supabase.rpc("restaurant_set_order_status", { p_order_id: o.id, p_to: to });
    if (error) return setErr(error.message);
    if (to === "accepted") api.rematch({ order_id: o.id }).catch((e) => setErr(e.message));
  };

  const out = async () => { await signOut(); router.replace("/sign-in"); };

  if (rest === undefined) return <Screen><Muted>…</Muted></Screen>;

  if (rest === null) {
    return (
      <Screen>
        <H1>{t("createRestaurant")}</H1>
        <Field label={t("restaurantName")} value={name} onChangeText={setName} />
        <CityPicker value={city} onChange={(p) => setCity(p.id)} />
        {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
        <Button title={t("save")} onPress={create} />
        <Button title={t("signOut")} variant="danger" onPress={out} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>{rest.name}</H1>
      <Row>
        <Text style={{ flex: 1, fontWeight: "700" }}>{rest.is_open ? t("open") : t("closed")}</Text>
        <Switch value={rest.is_open} onValueChange={setOpen} />
      </Row>
      {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
      <Text style={{ fontSize: 18, fontWeight: "800" }}>{t("incomingOrders")}</Text>
      {orders.length === 0 ? <Muted>{t("none")}</Muted> : null}
      {orders.map((o) => (
        <Card key={o.id}>
          <Text style={{ fontWeight: "800" }}>{`#${o.id.slice(0, 6)} · ${t(`os_${o.status}`)} · ${fcfa(o.subtotal_xaf, lang)}`}</Text>
          <Row>
            {o.status === "placed" ? <Button title={t("accept")} onPress={() => setStatus(o, "accepted")} /> : null}
            {o.status === "placed" ? <Button title={t("decline")} variant="secondary" onPress={() => setStatus(o, "cancelled")} /> : null}
            {o.status === "accepted" ? <Button title={t("os_preparing")} onPress={() => setStatus(o, "preparing")} /> : null}
            {o.status === "preparing" ? <Button title={t("markReady")} onPress={() => setStatus(o, "ready")} /> : null}
          </Row>
        </Card>
      ))}
      <Text style={{ fontSize: 18, fontWeight: "800" }}>{t("menu")}</Text>
      {menu.map((m) => (
        <Row key={m.id}>
          <Text style={{ flex: 1 }}>{m.name}</Text>
          <Text>{fcfa(m.price_xaf, lang)}</Text>
        </Row>
      ))}
      <Field label={t("itemName")} value={itemName} onChangeText={setItemName} />
      <Field label={t("priceXaf")} value={itemPrice} onChangeText={setItemPrice} keyboardType="number-pad" />
      <Button title={t("add")} variant="secondary" onPress={addItem} />
      <Button title={t("signOut")} variant="danger" onPress={out} />
    </Screen>
  );
}
