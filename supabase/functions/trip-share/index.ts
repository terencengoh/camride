// GET /functions/v1/trip-share?t=<share_token>   (public: verify_jwt = false)
// A small auto-refreshing page a rider can send to family/friends: trip status, driver first name,
// vehicle and the driver's last position (only while the trip is live). Links expire after 24 hours.
// ?format=json returns the data with CORS (used by admin/public/share.html). Note: on the default
// *.supabase.co domain Supabase serves HTML from Edge Functions as text/plain, so the app shares the
// static share.html page (deploy it with the admin site) unless you use a custom functions domain.
import { corsHeaders } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STATUS: Record<string, string> = {
  requested: "Recherche d'un chauffeur / Finding a driver",
  offered: "Recherche d'un chauffeur / Finding a driver",
  accepted: "Chauffeur en route / Driver on the way",
  arrived: "Chauffeur arrivé / Driver arrived",
  in_progress: "Course en cours / Trip in progress",
  completed: "Course terminée / Trip completed",
  cancelled: "Course annulée / Trip cancelled",
  no_drivers: "Aucun chauffeur / No driver found",
};

interface Info {
  status: string;
  vehicle_type: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  driver_first_name: string;
  vehicle: { make_model: string; color: string | null; plate: string } | null;
  driver_position: { lat: number; lng: number; at: string } | null;
  updated_at: string;
}

export function renderSharePage(info: Info | null): string {
  const body = !info
    ? `<h1>Lien expiré / Link expired</h1><p>Ce lien de partage n'est plus valide. This share link is no longer valid.</p>`
    : `<h1>${esc(STATUS[info.status] ?? info.status)}</h1>
<p><b>De / From:</b> ${esc(info.pickup_address ?? "-")}<br><b>À / To:</b> ${esc(info.dropoff_address ?? "-")}</p>
${info.driver_first_name ? `<p><b>Chauffeur / Driver:</b> ${esc(info.driver_first_name)}</p>` : ""}
${info.vehicle ? `<p><b>Véhicule / Vehicle:</b> ${esc(info.vehicle.make_model)} ${esc(info.vehicle.color ?? "")} - <b>${esc(info.vehicle.plate)}</b></p>` : ""}
${info.driver_position
      ? `<p><a href="https://www.openstreetmap.org/?mlat=${info.driver_position.lat}&mlon=${info.driver_position.lng}#map=16/${info.driver_position.lat}/${info.driver_position.lng}">Voir la position du chauffeur / See driver position</a><br><small>${esc(info.driver_position.at)}</small></p>`
      : ""}
<p class="sos">Urgence / Emergency: Police 117 · Pompiers / Fire 118 · SAMU 119</p>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="20"><meta name="robots" content="noindex"><title>CamRide - Suivi de course</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:2rem auto;padding:0 1rem;color:#111}h1{font-size:1.3rem;color:#0a7d3b}.sos{background:#fde8e8;padding:.6rem;border-radius:8px}a{color:#0a58ca}</style>
</head><body><p><b>CamRide</b></p>${body}</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const params = new URL(req.url).searchParams;
  const token = params.get("t") ?? "";
  let info: Info | null = null;
  if (UUID_RE.test(token)) {
    const { data } = await adminClient().rpc("trip_share_info", { p_token: token });
    info = (data as Info | null) ?? null;
  }
  if (params.get("format") === "json") {
    return new Response(JSON.stringify(info ?? { error: "expired" }), {
      status: info ? 200 : 404,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return new Response(renderSharePage(info), {
    status: info ? 200 : 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" },
  });
});
