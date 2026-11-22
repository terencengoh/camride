import { router } from "expo-router";
import { useState } from "react";
import { Button, Card, H1, Muted, Row, Screen, Chip } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { placeById } from "../../lib/places";
import { registerForPush, unregisterPush } from "../../lib/push";

export default function AccountScreen() {
  const { t, lang, setLang } = useI18n();
  const { profile, signOut } = useAuth();
  const [pushNote, setPushNote] = useState<string | null>(null);
  const enablePush = () =>
    registerForPush().then((tok) => setPushNote(tok ? "✅" : "—")).catch((e) => setPushNote((e as Error).message));
  return (
    <Screen>
      <H1>{t("account")}</H1>
      <Card>
        <Muted>{profile?.full_name ?? ""}</Muted>
        <Muted>{profile?.phone ? `+${profile.phone}` : ""}</Muted>
        <Muted>{placeById(profile?.city_id).name}</Muted>
      </Card>
      <Muted>{t("language")}</Muted>
      <Row>
        <Chip label="Français" selected={lang === "fr"} onPress={() => setLang("fr")} />
        <Chip label="English" selected={lang === "en"} onPress={() => setLang("en")} />
      </Row>
      <Button title={t("enableNotifications")} variant="secondary" onPress={enablePush} />
      {pushNote ? <Muted>{pushNote}</Muted> : null}
      <Button title={t("support")} variant="secondary" onPress={() => router.push("/support")} />
      <Row>
        <Button title={t("terms")} variant="secondary" onPress={() => router.push("/legal/terms")} />
        <Button title={t("privacy")} variant="secondary" onPress={() => router.push("/legal/privacy")} />
      </Row>
      <Button title={t("switchRole")} variant="secondary" onPress={() => router.push("/onboarding")} />
      <Button title={t("signOut")} variant="danger" onPress={async () => { await unregisterPush(); await signOut(); router.replace("/sign-in"); }} />
    </Screen>
  );
}
