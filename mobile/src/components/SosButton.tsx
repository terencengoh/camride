// SOS: one tap opens emergency options - call police 117 / fire 118 / SAMU 119 (Cameroon), and
// alert the CamRide safety team (trigger_sos stores the trip + position and notifies admins).
import { useState } from "react";
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { locate } from "../lib/location";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import { Button, Muted } from "./ui";

export function SosButton({ tripId }: { tripId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const alertTeam = async () => {
    setBusy(true);
    setErr(null);
    const r = await locate();
    const { error } = await supabase.rpc("trigger_sos", {
      p_trip_id: tripId ?? null,
      p_lat: r.source === "gps" ? r.point.lat : null,
      p_lng: r.source === "gps" ? r.point.lng : null,
      p_note: null,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("sosTitle")}
        onPress={() => setOpen(true)}
        style={{ backgroundColor: colors.red, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, alignSelf: "flex-start" }}
      >
        <Text style={{ color: "#fff", fontWeight: "900" }}>{t("sos")}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 18, gap: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: "900", color: colors.red }}>{t("sosTitle")}</Text>
            <Muted>{t("sosBody")}</Muted>
            <Button title={t("callPolice")} variant="danger" onPress={() => Linking.openURL("tel:117")} />
            <Button title={t("callAmbulance")} variant="danger" onPress={() => Linking.openURL("tel:119")} />
            <Button title={t("callFire")} variant="danger" onPress={() => Linking.openURL("tel:118")} />
            <Button title={sent ? t("sosSent") : t("alertCamRide")} onPress={alertTeam} loading={busy} disabled={sent} />
            {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
            <Button title="OK" variant="secondary" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}
