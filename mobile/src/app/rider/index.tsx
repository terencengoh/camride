// Book a ride: live map with the device location, destination by tap or search,
// server-side fare quotes for Moto / Car / Comfort (road route drawn on the map), promo code,
// payment method, request.
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { CityPicker } from "../../components/CityPicker";
import { Button, Chip, Muted, Row, styles as ui } from "../../components/ui";
import { api, type QuoteResult } from "../../lib/api";
import { fcfa, km } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { geocode, locate } from "../../lib/location";
import { DEFAULT_PLACE, nearestPlace, type Place } from "../../lib/places";
import { toCoords } from "../../lib/polyline";
import { colors } from "../../lib/theme";
import type { LatLng, PayMethod, VehicleType } from "../../lib/types";

const ICON: Record<VehicleType, string> = { moto: "🏍️", car: "🚗", comfort: "🚙" };
const region = (p: LatLng, d = 0.03): Region => ({ latitude: p.lat, longitude: p.lng, latitudeDelta: d, longitudeDelta: d });

export default function RideScreen() {
  const { t, lang } = useI18n();
  const map = useRef<MapView>(null);
  const [city, setCity] = useState<Place>(DEFAULT_PLACE);
  const [pickup, setPickup] = useState<LatLng>(DEFAULT_PLACE);
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  const [query, setQuery] = useState("");
  // Quotes are keyed by the route they were fetched for, so a stale quote is never shown.
  const [quoteState, setQuoteState] = useState<{ key: string; result: QuoteResult } | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState("");
  const [vehicle, setVehicle] = useState<VehicleType>("moto");
  const [pay, setPay] = useState<PayMethod>("mtn");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    locate().then((r) => {
      setPickup(r.point);
      if (r.source === "gps") setCity(nearestPlace(r.point.lat, r.point.lng));
      else if (r.reason === "denied") setNote(t("locationDenied", { city: DEFAULT_PLACE.name }));
      else if (r.reason === "outside") setNote(t("outside", { city: DEFAULT_PLACE.name }));
      map.current?.animateToRegion(region(r.point), 600);
    });
  }, [t]);

  const routeKey = dropoff ? `${pickup.lat},${pickup.lng}>${dropoff.lat},${dropoff.lng}|${promo}` : null;
  const result = quoteState && quoteState.key === routeKey ? quoteState.result : null;
  const quotes = result?.quotes ?? null;
  const discounts = result?.promo && "discounts" in result.promo ? result.promo.discounts : null;
  const promoError = result?.promo && "error" in result.promo ? result.promo.error : null;

  useEffect(() => {
    if (!dropoff || !routeKey) return;
    let active = true;
    api.quote(pickup, dropoff, promo).then((r) => active && setQuoteState({ key: routeKey, result: r })).catch((e) => active && setNote(t("error", { msg: e.message })));
    return () => {
      active = false;
    };
  }, [pickup, dropoff, routeKey, promo, t]);

  const chooseCity = (p: Place) => {
    setCity(p);
    setPickup(p);
    setDropoff(null);
    map.current?.animateToRegion(region(p), 600);
  };

  const doSearch = async () => {
    if (query.trim().length < 3) return;
    const hit = await geocode(`${query}, ${city.name}`).catch(() => null);
    if (!hit) return setNote(t("error", { msg: "not found" }));
    setDropoff(hit);
    map.current?.animateToRegion(region(hit), 600);
  };

  const request = async () => {
    if (!dropoff) return;
    setBusy(true);
    try {
      const { trip } = await api.requestRide({ ...pickup }, { ...dropoff, address: query || undefined }, vehicle, pay, discounts ? promo : undefined);
      router.push(`/trip/${trip.id}`);
    } catch (e) {
      setNote(t("error", { msg: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const selected = quotes?.find((q) => q.vehicle_type === vehicle);
  const price = (fare: number, type: VehicleType) => fare - (discounts?.[type] ?? 0);
  const routeCoords = toCoords(result?.route.polyline);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        initialRegion={region(DEFAULT_PLACE)}
        showsUserLocation
        onPress={(e) => setDropoff({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
      >
        <Marker
          coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
          pinColor={colors.green}
          draggable
          title={t("pickup")}
          onDragEnd={(e) => setPickup({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
        />
        {dropoff ? <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} pinColor={colors.red} title={t("destination")} /> : null}
        {routeCoords.length > 1 ? (
          <Polyline coordinates={routeCoords} strokeColor={colors.green} strokeWidth={5} lineDashPattern={result?.route.source === "estimate" ? [8, 8] : undefined} />
        ) : null}
      </MapView>
      <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 10 }}>
        <CityPicker value={city.id} onChange={chooseCity} />
      </SafeAreaView>
      <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>{t("whereTo")}</Text>
        <Row>
          <TextInput style={[ui.input, { flex: 1 }]} placeholder={t("searchPlace")} value={query} onChangeText={setQuery} onSubmitEditing={doSearch} returnKeyType="search" />
          <Chip label={t("search")} onPress={doSearch} />
        </Row>
        {note ? <Muted>{note}</Muted> : null}
        {!dropoff ? <Muted>{t("tapMap")}</Muted> : null}
        {dropoff && !quotes ? <Muted>…</Muted> : null}
        {quotes ? (
          <>
            {quotes.map((q) => (
              <Chip
                key={q.vehicle_type}
                selected={q.vehicle_type === vehicle}
                onPress={() => setVehicle(q.vehicle_type)}
                label={`${ICON[q.vehicle_type]}  ${t(q.vehicle_type)}   ${fcfa(price(q.fare_xaf, q.vehicle_type), lang)}   ·   ${km(q.distance_km, lang)} · ${Math.round(q.duration_min)} min`}
              />
            ))}
            {result?.route.source === "estimate" ? <Muted>{t("routeEstimate")}</Muted> : null}
            <Row>
              <TextInput style={[ui.input, { flex: 1 }]} placeholder={t("promoCode")} autoCapitalize="characters" value={promoInput} onChangeText={setPromoInput} />
              <Chip label={t("apply")} onPress={() => setPromo(promoInput.trim().toUpperCase())} />
            </Row>
            {discounts && selected ? <Muted>{t("promoApplied", { code: promo, amount: fcfa(discounts[vehicle] ?? 0, lang) })}</Muted> : null}
            {promoError ? <Text style={{ color: colors.red }}>{promoError}</Text> : null}
            {vehicle === "moto" ? <Muted>{t("motoNote")}</Muted> : null}
            <Row>
              <Text style={{ fontWeight: "600" }}>{t("payWith")}</Text>
              <Chip label="MTN" accent={colors.mtn} selected={pay === "mtn"} onPress={() => setPay("mtn")} />
              <Chip label="Orange" accent={colors.orange} selected={pay === "orange"} onPress={() => setPay("orange")} />
              <Chip label={t("cash")} selected={pay === "cash"} onPress={() => setPay("cash")} />
            </Row>
            <Button title={`${t("request")} ${t(vehicle)}${selected ? " · " + fcfa(price(selected.fare_xaf, vehicle), lang) : ""}`} onPress={request} loading={busy} />
          </>
        ) : null}
      </View>
    </View>
  );
}
