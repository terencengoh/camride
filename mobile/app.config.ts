// Dynamic Expo config so the Google Maps key comes from the environment (never committed).
// Set GOOGLE_MAPS_ANDROID_API_KEY locally in .env or as an EAS secret / environment variable.
import type { ExpoConfig } from "expo/config";
// Writes assets/*.png from the committed assets/*.png.b64 before Expo reads them.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { decodeAssets } = require("./scripts/decode-assets.js");
decodeAssets();

const GREEN = "#007a3d";

const config: ExpoConfig = {
  name: "CamRide",
  slug: "camride",
  scheme: "camride",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  android: {
    package: "cm.camride.app",
    versionCode: 1,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: GREEN },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "POST_NOTIFICATIONS",
      "CAMERA",
    ],
    // Not used by CamRide; some libraries add them by default.
    blockedPermissions: ["android.permission.RECORD_AUDIO", "android.permission.SYSTEM_ALERT_WINDOW"],
  },
  ios: {
    bundleIdentifier: "cm.camride.app",
    supportsTablet: false,
    infoPlist: { UIBackgroundModes: ["location", "remote-notification"] },
  },
  plugins: [
    "expo-router",
    "expo-localization",
    "expo-web-browser",
    [
      "expo-splash-screen",
      { image: "./assets/splash-icon.png", imageWidth: 200, resizeMode: "contain", backgroundColor: GREEN },
    ],
    [
      "expo-notifications",
      { icon: "./assets/notification-icon.png", color: GREEN },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "CamRide needs your photos so you can upload your driver documents (licence, ID, insurance).",
        cameraPermission: "CamRide uses the camera so you can photograph your driver documents.",
        microphonePermission: false,
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "CamRide uses your location to find nearby drivers and show your pickup point.",
        locationAlwaysAndWhenInUsePermission:
          "Drivers only: while you are online, CamRide shares your location in the background so riders and customers can be matched to you and follow their trip. It stops when you go offline.",
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
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
