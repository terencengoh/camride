// Dynamic Expo config so the Google Maps key comes from the environment (never committed).
// Set GOOGLE_MAPS_ANDROID_API_KEY locally in .env or as an EAS secret / environment variable.
import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "CamRide",
  slug: "camride",
  scheme: "camride",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  // TODO: add icon / splash PNGs under ./assets before a store release.
  android: {
    package: "cm.camride.app",
    versionCode: 1,
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
  },
  ios: {
    bundleIdentifier: "cm.camride.app",
    supportsTablet: false,
  },
  plugins: [
    "expo-router",
    "expo-localization",
    [
      "expo-location",
      {
        locationWhenInUsePermission: "CamRide uses your location to find nearby drivers and show your pickup point.",
      },
    ],
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? "",
      },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
