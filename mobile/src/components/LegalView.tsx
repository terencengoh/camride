import { Text } from "react-native";
import { useI18n } from "../lib/i18n";
import { LEGAL } from "../lib/legal";
import { colors } from "../lib/theme";
import { Card, H1, Muted, Screen } from "./ui";

export function LegalView({ doc }: { doc: "terms" | "privacy" }) {
  const { t, lang } = useI18n();
  const d = LEGAL[doc][lang];
  return (
    <Screen>
      <H1>{d.title}</H1>
      <Card style={{ backgroundColor: "#fff8e1", borderColor: colors.yellow }}>
        <Text style={{ fontWeight: "800", color: colors.ink }}>{t("draftNotice")}</Text>
      </Card>
      <Muted>{d.updated}</Muted>
      {d.sections.map((s) => (
        <Card key={s.title}>
          <Text style={{ fontWeight: "800" }}>{s.title}</Text>
          <Text style={{ color: colors.ink, lineHeight: 20 }}>{s.body}</Text>
        </Card>
      ))}
    </Screen>
  );
}
