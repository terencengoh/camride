// Driver / courier console: go online, stream foreground location to update_my_location,
// receive offers via Realtime (offered_driver_id / offered_courier_id), accept/decline,
// and advance the active job. Background location is a TODO (expo-task-manager).
import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Switch, Text } from "react-native";
import { Button, Card, H1, Muted, Row, Screen } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { fcfa, km } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { useRealtimeQuery } from "../../lib/realtime";
import { supabase } from "../../lib/supabase";
import { colors } from "../../lib/theme";
import type { DriverRow, Order, Trip, TripStatus } from "../../lib/types";

const NEXT_TRIP: Partial<Record<TripStatus, { to: TripStatus; key: "arrived" | "startTrip" | "completeTrip" }>> = {
  accepted: { to: "arrived", key: "arrived" },
  arrived: { to: "in_progress", key: "startTrip" },
  in_progress: { to: "completed", key: "completeTrip" },
};

const OFFERED = ["offered"] as const;
const TRIP_ACTIVE = ["accepted", "arrived", "in_progress"] as const;
const ORDER_ACTIVE = ["accepted", "preparing", "ready", "picked_up"] as const;

export default function DriverScreen() {
  const { t, lang } = useI18n();
  const { session, signOut } = useAuth();
  const uid = session?.user.id ?? null;
  const [me, setMe] = useState<DriverRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  const fetchMe = useCallback(async (): Promise<DriverRow | null> => {
    if (!uid) return null;
    const { data } = await supabase.from("drivers").select("id,lat,lng,heading,rating_avg,vehicle_type,status,is_courier,documents_verified").eq("id", uid).maybeSingle();
    return (data as DriverRow) ?? null;
  }, [uid]);
  const loadMe = useCallback(() => fetchMe().then(setMe), [fetchMe]);
  useEffect(() => {
    let active = true;
    fetchMe().then((d) => active && setMe(d));
    return () => {
      active = false;
    };
  }, [fetchMe]);

  const online = me?.status === "available" || me?.status === "busy";

  // Foreground location streaming while online.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return setErr(t("locationNeeded"));
      watcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 15 },
        (pos) => {
          supabase.rpc("update_my_location", {
            p_lat: pos.coords.latitude,
            p_lng: pos.coords.longitude,
            p_heading: pos.coords.heading ?? null,
          }).then(({ error }) => error && setErr(error.message));
        },
      );
    })();
    return () => {
      cancelled = true;
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [online, t]);

  const toggle = async (value: boolean) => {
    setErr(null);
    const { error } = await supabase.rpc("set_driver_status", { p_status: value ? "available" : "offline" });
    if (error) setErr(error.message);
    loadMe();
  };

  // Offers + active jobs (RLS limits rows to this driver).
  const tripOffers = useRealtimeQuery<Trip>("trips", "offered_driver_id", uid, OFFERED);
  const activeTrips = useRealtimeQuery<Trip>("trips", "driver_id", uid, TRIP_ACTIVE);
  const orderOffers = useRealtimeQuery<Order>("orders", "offered_courier_id", uid);
  const activeOrders = useRealtimeQuery<Order>("orders", "courier_id", uid, ORDER_ACTIVE);

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    setErr(null);
    const { error } = await supabase.rpc(fn, args);
    if (error) setErr(error.message);
    loadMe();
  };

  if (!me) {
    return (
      <Screen>
        <H1>{t("driverConsole")}</H1>
        <Muted>{t("notRegistered")}</Muted>
        <Button title={t("continue")} onPress={() => router.push("/onboarding")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>{me.is_courier ? t("courierConsole") : t("driverConsole")}</H1>
      {!me.documents_verified ? <Card><Text style={{ color: colors.red }}>{t("awaitingVerification")}</Text></Card> : null}
      <Row>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: "700" }}>{online ? t("online") : t("offline")}</Text>
        <Switch value={online} onValueChange={toggle} disabled={!me.documents_verified || me.status === "busy"} />
      </Row>
      <Muted>{`⭐ ${me.rating_avg} · ${t(me.vehicle_type)}`}</Muted>
      {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}

      {tripOffers.map((tr) => (
        <Card key={tr.id}>
          <Text style={{ fontWeight: "800" }}>{`${t("newRide")} · ${fcfa(tr.fare_xaf, lang)}`}</Text>
          <Muted>{`${km(tr.distance_km, lang)} · ${Math.round(tr.duration_min)} min · ${tr.payment_method.toUpperCase()}`}</Muted>
          <Row>
            <Button title={t("accept")} onPress={() => rpc("accept_trip", { p_trip_id: tr.id })} />
            <Button title={t("decline")} variant="secondary" onPress={() => rpc("decline_trip", { p_trip_id: tr.id })} />
          </Row>
        </Card>
      ))}
      {orderOffers.map((o) => (
        <Card key={o.id}>
          <Text style={{ fontWeight: "800" }}>{`${t("newDelivery")} · ${fcfa(o.delivery_fee_xaf, lang)}`}</Text>
          <Muted>{`${km(o.distance_km, lang)} · ${t(`os_${o.status}`)}`}</Muted>
          <Row>
            <Button title={t("accept")} onPress={() => rpc("accept_delivery", { p_order_id: o.id })} />
            <Button title={t("decline")} variant="secondary" onPress={() => rpc("decline_delivery", { p_order_id: o.id })} />
          </Row>
        </Card>
      ))}

      {activeTrips.map((tr) => {
        const next = NEXT_TRIP[tr.status];
        return (
          <Card key={tr.id}>
            <Text style={{ fontWeight: "800" }}>{`${t(`st_${tr.status}`)} · ${fcfa(tr.fare_xaf, lang)}`}</Text>
            <Muted>{`${tr.pickup_address ?? `${tr.pickup_lat.toFixed(4)}, ${tr.pickup_lng.toFixed(4)}`} → ${tr.dropoff_address ?? `${tr.dropoff_lat.toFixed(4)}, ${tr.dropoff_lng.toFixed(4)}`}`}</Muted>
            {tr.payment_method === "cash" ? <Muted>{t("collectCash", { amount: fcfa(tr.fare_xaf, lang) })}</Muted> : null}
            {next ? <Button title={t(next.key)} onPress={() => rpc("advance_trip", { p_trip_id: tr.id, p_to: next.to })} /> : null}
          </Card>
        );
      })}
      {activeOrders.map((o) => (
        <Card key={o.id}>
          <Text style={{ fontWeight: "800" }}>{`${t(`os_${o.status}`)} · ${fcfa(o.total_xaf, lang)}`}</Text>
          {o.payment_method === "cash" ? <Muted>{t("collectCash", { amount: fcfa(o.total_xaf, lang) })}</Muted> : null}
          {o.status === "ready" ? <Button title={t("pickedUp")} onPress={() => rpc("courier_advance_order", { p_order_id: o.id, p_to: "picked_up" })} /> : null}
          {o.status === "picked_up" ? <Button title={t("delivered")} onPress={() => rpc("courier_advance_order", { p_order_id: o.id, p_to: "delivered" })} /> : null}
        </Card>
      ))}
      {tripOffers.length + orderOffers.length + activeTrips.length + activeOrders.length === 0 && online ? <Muted>{t("waitingRequests")}</Muted> : null}
      <Button title={t("signOut")} variant="danger" onPress={async () => { await toggle(false); await signOut(); router.replace("/sign-in"); }} />
    </Screen>
  );
}
