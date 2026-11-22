import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
// Registers the background location task at startup (must run at module scope).
import "../lib/backgroundLocation";
import { AuthProvider, useAuth } from "../lib/auth";
import { CartProvider } from "../lib/cart";
import { I18nProvider } from "../lib/i18n";
import { usePushNotifications } from "../lib/push";

function PushRegistration() {
  const { session } = useAuth();
  usePushNotifications(session?.user.id ?? null);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <CartProvider>
            <PushRegistration />
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
          </CartProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
