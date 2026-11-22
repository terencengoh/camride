import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../lib/auth";
import { CartProvider } from "../lib/cart";
import { I18nProvider } from "../lib/i18n";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <CartProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
          </CartProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
