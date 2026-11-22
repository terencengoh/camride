// Public "Share my trip" page. Reads ?t=<share_token> and polls the trip-share Edge Function (JSON mode).
// No sign-in: the token is an unguessable UUID and links expire 24 hours after the trip was requested.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

interface Info {
  status: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  driver_first_name: string;
  vehicle: { make_model: string; color: string | null; plate: string } | null;
  driver_position: { lat: number; lng: number; at: string } | null;
}

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

const app = document.getElementById("app")!;
const token = new URLSearchParams(location.search).get("t") ?? "";

function el(tag: string, text?: string, attrs: Record<string, string> = {}): HTMLElement {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function line(label: string, value: string): HTMLElement {
  const p = el("p");
  p.append(el("b", `${label}: `), document.createTextNode(value));
  return p;
}

function render(info: Info | null) {
  app.replaceChildren();
  if (!info) {
    app.append(el("h1", "Lien expiré / Link expired"), el("p", "Ce lien de partage n'est plus valide. This share link is no longer valid."));
    return;
  }
  app.append(el("h1", STATUS[info.status] ?? info.status));
  app.append(line("De / From", info.pickup_address ?? "-"), line("À / To", info.dropoff_address ?? "-"));
  if (info.driver_first_name) app.append(line("Chauffeur / Driver", info.driver_first_name));
  if (info.vehicle) app.append(line("Véhicule / Vehicle", `${info.vehicle.make_model} ${info.vehicle.color ?? ""} — ${info.vehicle.plate}`));
  if (info.driver_position) {
    const { lat, lng, at } = info.driver_position;
    const p = el("p");
    p.append(el("a", "Voir la position du chauffeur / See driver position", {
      href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`, target: "_blank", rel: "noopener",
    }), el("br"), el("small", new Date(at).toLocaleString()));
    app.append(p);
  }
}

async function load() {
  if (!/^[0-9a-f-]{36}$/i.test(token) || !SUPABASE_URL) return render(null);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/trip-share?format=json&t=${encodeURIComponent(token)}`);
    render(res.ok ? ((await res.json()) as Info) : null);
  } catch {
    app.replaceChildren(el("p", "Connexion impossible, nouvel essai… / Offline, retrying…"));
  }
}

load();
setInterval(load, 15000);
