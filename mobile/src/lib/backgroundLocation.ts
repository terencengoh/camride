// Background location for drivers/couriers while online (expo-location + expo-task-manager).
// The task is defined at module scope (imported by the root layout) so Android can start it headless.
// Android shows a persistent foreground-service notification while it runs; Google Play requires the
// prominent in-app disclosure shown on the driver screen before asking for "Allow all the time".
// Needs a development or production build (not Expo Go).
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { supabase } from "./supabase";

export const LOCATION_TASK = "camride-driver-location";

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const last = data.locations[data.locations.length - 1];
  const { error: rpcError } = await supabase.rpc("update_my_location", {
    p_lat: last.coords.latitude,
    p_lng: last.coords.longitude,
    p_heading: last.coords.heading ?? null,
  });
  // Signed out or no longer a driver: stop sending.
  if (rpcError && /not a driver|JWT|sign in/i.test(rpcError.message)) await stopBackgroundLocation();
});

export async function backgroundPermissionGranted(): Promise<boolean> {
  const p = await Location.getBackgroundPermissionsAsync();
  return p.granted;
}

/** Asks for foreground then background permission. Call only after the prominent disclosure. */
export async function requestBackgroundPermission(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted;
}

export async function startBackgroundLocation(notification: { title: string; body: string }): Promise<boolean> {
  if (!(await backgroundPermissionGranted())) return false;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return true;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 25,
    deferredUpdatesInterval: 10_000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: { notificationTitle: notification.title, notificationBody: notification.body, notificationColor: "#0a7d3b", killServiceOnDestroy: false },
  });
  return true;
}

export async function stopBackgroundLocation(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    /* task not registered (e.g. Expo Go) */
  }
}
