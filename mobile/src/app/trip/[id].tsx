// Live trip tracking: status + driver position via Supabase Realtime, re-matching while
// searching, cancel, mobile money payment at the end (cash is settled by the driver), rating.
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { PayModal } from "../../components/PayModal";
import { Stars } from "../../components/Stars";
import { Button, Muted, Row } from "../../components/ui";
import { api } from "../../lib/api";
import { fcfa } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { useRealtimeRow } from "../../lib/realtime";
import { supabase } from "../../lib/supabase";
import { colors } from "../../lib/theme";
import type { DriverRow, Trip } from "../../lib/types";

const ICON = { moto: "🏍️", car: "🚗", comfort: "🚙" } as const;

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { row: trip } = useRealtimeRow<Trip>("trips", id ?? null);
  const { row: driver } = useRealtimeRow<DriverRow>("drivers", trip?.driver_id ?? null, "id,lat,lng,heading,rating_avg,vehicle_type,status,is_courier,documents_verified");
  const [driverInfo, setDriverInfo] = useState<{ name: string; vehicle: string; plate: string } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [rated, setRated] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Driver name + vehicle (RLS allows this only while the driver serves this rider).
  useEffect(() => {
    if (!trip?.driver_id) return;
    (async () => {
      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", trip.driver_id!).maybeSingle(),
        supabase.from("drivers").select("vehicle_id").eq("id", trip.driver_id!).maybeSingle(),
      ]);
      const { data: v } = d?.vehicle_id ? await supabase.from("vehicles").select("make_model,plate").eq("id", d.vehicle_id).maybeSingle() : { data: null };
      setDriverInfo({ name: p?.full_name ?? "—", vehicle: v?.make_model ?? "", plate: v?.plate ?? "" });
    })();
  }, [trip?.driver_id]);

  // While searching, re-run matching every 15 s (offers expire after 30 s).
  useEffect(() => {
    if (!trip || !["requested", "offered"].includes(trip.status)) return;
    const timer = setInterval(() => api.rematch({ trip_id: trip.id }).catch(() => undefined), 15_000);
    return () => clearInterval(timer);
  }, [trip]);

  const cancel = useCallback(async () => {
    const { error } = await supabase.rpc("cancel_trip", { p_trip_id: id });
    if (error) setErr(error.message);
  }, [id]);

  const rate = async () => {
    const { error } = await supabase.rpc("rate_trip", { p_trip_id: id, p_stars: stars });
    if (error) setErr(error.message);
    else setRated(true);
  };

  if (!trip) return <View style={{ flex: 1 }} />;
  const needsPayment = trip.status === "completed" && trip.payment_method !== "cash" && trip.payment_status !== "paid";

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{ latitude: trip.pickup_lat, longitude: trip.pickup_lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      >
        <Marker coordinate={{ latitude: trip.pickup_lat, longitude: trip.pickup_lng }} pinColor={colors.green} title={t("pickup")} />
        <Marker coordinate={{ latitude: trip.dropoff_lat, longitude: trip.dropoff_lng }} pinColor={colors.red} title={t("destination")} />
        {driver?.lat != null && driver?.lng != null ? (
          <Marker coordinate={{ latitude: driver.lat, longitude: driver.lng }} title={driverInfo?.name}>
            <Text style={{ fontSize: 28 }}>{ICON[trip.vehicle_type]}</Text>
          </Marker>
        ) : null}
      </MapView>
      <View style={{ backgroundColor: "#fff", padding: 16, gap: 8, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>{t(`st_${trip.status}`)}</Text>
        <Row>
          <Text style={{ flex: 1 }}>{`${ICON[trip.vehicle_type]} ${t(trip.vehicle_type)}`}</Text>
          <Text style={{ fontWeight: "800" }}>{fcfa(trip.fare_xaf, lang)}</Text>
        </Row>
        {driverInfo ? <Muted>{`${driverInfo.name} · ⭐ ${driver?.rating_avg ?? "-"} · ${driverInfo.vehicle} · ${driverInfo.plate}`}</Muted> : null}
        {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}

        {trip.status === "no_drivers" ? <Button title={t("retry")} onPress={() => api.rematch({ trip_id: trip.id })} /> : null}
        {["requested", "offered", "accepted", "arrived", "no_drivers"].includes(trip.status) ? <Button title={t("cancel")} variant="danger" onPress={cancel} /> : null}

        {needsPayment ? <Button title={t("payNow", { amount: fcfa(trip.fare_xaf, lang) })} onPress={() => setPayOpen(true)} /> : null}
        {trip.status === "completed" && trip.payment_status === "paid" ? <Muted>{`✅ ${t("paid")}`}</Muted> : null}

        {trip.status === "completed" && !rated ? (
          <>
            <Text style={{ textAlign: "center", fontWeight: "700" }}>{t("rateDriver")}</Text>
            <Stars value={stars} onChange={setStars} />
            <Button title={t("save")} onPress={rate} disabled={!stars} />
          </>
        ) : null}
        {rated ? <Muted>{t("thanks")}</Muted> : null}
        {["completed", "cancelled"].includes(trip.status) ? <Button title="OK" variant="secondary" onPress={() => router.replace("/rider")} /> : null}
      </View>
      <PayModal
        visible={payOpen}
        target={{ trip_id: trip.id }}
        amount={trip.fare_xaf}
        defaultMethod={trip.payment_method === "orange" ? "orange" : "mtn"}
        onClose={() => setPayOpen(false)}
        onPaid={() => setPayOpen(false)}
      />
    </View>
  );
}
