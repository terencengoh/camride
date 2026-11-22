import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../lib/auth";
import { colors } from "../lib/theme";

/** Routes the user by session and role. */
export default function Index() {
  const { session, profile, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.green} size="large" />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile?.full_name) return <Redirect href="/onboarding" />;
  if (profile.role === "driver" || profile.role === "courier") return <Redirect href="/driver" />;
  if (profile.role === "restaurant") return <Redirect href="/partner" />;
  return <Redirect href="/rider" />;
}
