import { H1, Screen } from "../../components/ui";
import { Wallet } from "../../components/Wallet";
import { useI18n } from "../../lib/i18n";

export default function DriverEarnings() {
  const { t } = useI18n();
  return (
    <Screen>
      <H1>{t("earnings")}</H1>
      <Wallet kind="driver_wallet" />
    </Screen>
  );
}
