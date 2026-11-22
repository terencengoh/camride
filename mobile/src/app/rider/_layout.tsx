import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useI18n } from "../../lib/i18n";
import { colors } from "../../lib/theme";

function icon(emoji: string) {
  return function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
  };
}

export default function RiderTabs() {
  const { t } = useI18n();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green }}>
      <Tabs.Screen name="index" options={{ title: t("ride"), tabBarIcon: icon("🚗") }} />
      <Tabs.Screen name="food" options={{ title: t("food"), tabBarIcon: icon("🍲") }} />
      <Tabs.Screen name="activity" options={{ title: t("activity"), tabBarIcon: icon("🧾") }} />
      <Tabs.Screen name="account" options={{ title: t("account"), tabBarIcon: icon("👤") }} />
    </Tabs>
  );
}
