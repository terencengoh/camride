import { router } from "expo-router";
import { Button, Card, H1, Muted, Row, Screen, Chip } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { placeById } from "../../lib/places";

export default function AccountScreen() {
  const { t, lang, setLang } = useI18n();
  const { profile, signOut } = useAuth();
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
      <Button title={t("switchRole")} variant="secondary" onPress={() => router.push("/onboarding")} />
      <Button title={t("signOut")} variant="danger" onPress={async () => { await signOut(); router.replace("/sign-in"); }} />
    </Screen>
  );
}
