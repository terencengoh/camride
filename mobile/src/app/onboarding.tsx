import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { CityPicker } from "../components/CityPicker";
import { Button, Chip, Field, H1, Row, Screen } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import type { Role, VehicleType } from "../lib/types";

const ROLES: { role: Exclude<Role, "admin">; key: "roleRider" | "roleDriver" | "roleCourier" | "roleRestaurant" }[] = [
  { role: "rider", key: "roleRider" },
  { role: "driver", key: "roleDriver" },
  { role: "courier", key: "roleCourier" },
  { role: "restaurant", key: "roleRestaurant" },
];

export default function Onboarding() {
  const { t, lang } = useI18n();
  const { session, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [role, setRole] = useState<Exclude<Role, "admin">>(profile?.role === "admin" || !profile ? "rider" : profile.role);
  const [city, setCity] = useState(profile?.city_id ?? "douala");
  const [vehicle, setVehicle] = useState<VehicleType>("moto");
  const [makeModel, setMakeModel] = useState("");
  const [plate, setPlate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsVehicle = role === "driver" || role === "courier";

  const save = async () => {
    if (!session) return;
    if (name.trim().length < 2) return setErr(t("fullName"));
    if (needsVehicle && (makeModel.trim().length < 2 || plate.trim().length < 4)) return setErr(`${t("makeModel")} / ${t("plate")}`);
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase.from("profiles")
        .update({ full_name: name.trim(), role: needsVehicle ? "rider" : role, city_id: city, lang })
        .eq("id", session.user.id);
      if (error) throw error;
      if (needsVehicle) {
        // register_driver also sets the profile role to driver/courier (unverified until an admin approves).
        const { error: e2 } = await supabase.rpc("register_driver", {
          p_vehicle_type: role === "courier" ? "moto" : vehicle,
          p_make_model: makeModel.trim(),
          p_plate: plate.trim(),
          p_is_courier: role === "courier",
        });
        if (e2) throw e2;
      }
      await refreshProfile();
      router.replace("/");
    } catch (e) {
      setErr(t("error", { msg: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>{t("welcome")}</H1>
      <Field label={t("fullName")} value={name} onChangeText={setName} autoComplete="name" />
      <Text style={{ fontWeight: "600" }}>{t("iWantTo")}</Text>
      {ROLES.map((r) => <Chip key={r.role} label={t(r.key)} selected={role === r.role} onPress={() => setRole(r.role)} />)}
      <Text style={{ fontWeight: "600" }}>{t("city")}</Text>
      <CityPicker value={city} onChange={(p) => setCity(p.id)} />
      {needsVehicle ? (
        <>
          {role === "driver" ? (
            <>
              <Text style={{ fontWeight: "600" }}>{t("vehicleType")}</Text>
              <Row>
                {(["moto", "car", "comfort"] as VehicleType[]).map((v) => <Chip key={v} label={t(v)} selected={vehicle === v} onPress={() => setVehicle(v)} />)}
              </Row>
            </>
          ) : null}
          <Field label={t("makeModel")} value={makeModel} onChangeText={setMakeModel} placeholder="Toyota Corolla / Nanfang 125" />
          <Field label={t("plate")} value={plate} onChangeText={setPlate} autoCapitalize="characters" placeholder="LT 123 AB" />
        </>
      ) : null}
      {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
      <Button title={t("continue")} onPress={save} loading={busy} />
    </Screen>
  );
}
