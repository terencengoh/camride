import { useState } from "react";
import { supabase } from "../lib/supabase";
import { fcfa, osm, short, when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Badge, Filter, Loading, Section } from "../components/ui";

const STATUSES = ["requested", "offered", "accepted", "arrived", "in_progress", "completed", "cancelled", "no_drivers"];

interface TripRow {
  id: string; created_at: string; city_id: string | null; vehicle_type: string; status: string; fare_xaf: number; discount_xaf: number;
  amount_due_xaf: number; promo_code: string | null; payment_method: string; payment_status: string; distance_km: number; route_source: string | null;
  pickup_address: string | null; dropoff_address: string | null; pickup_lat: number; pickup_lng: number;
  rider: { full_name: string | null; phone: string | null } | null;
  driver: { profiles: { full_name: string | null; phone: string | null } | null } | null;
}

export default function Trips() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const q = useQuery(`trips:${status}:${search}`, () => {
    let b = supabase.from("trips").select(
      "id,created_at,city_id,vehicle_type,status,fare_xaf,discount_xaf,amount_due_xaf,promo_code,payment_method,payment_status,distance_km,route_source,pickup_address,dropoff_address,pickup_lat,pickup_lng," +
      "rider:profiles!trips_rider_id_fkey(full_name,phone),driver:drivers!trips_driver_id_fkey(profiles(full_name,phone))",
    ).order("created_at", { ascending: false }).limit(200);
    if (status) b = b.eq("status", status);
    if (/^[0-9a-f-]{8,36}$/i.test(search)) b = b.eq("id", search);
    return b;
  });
  const rows = (q.data ?? []) as unknown as TripRow[];
  return (
    <Section title="Trips (latest 200)" actions={<>
      <input placeholder="trip id" value={search} onChange={(e) => setSearch(e.target.value.trim())} />
      Status: <Filter value={status} options={STATUSES} onChange={setStatus} />
      <button className="btn" onClick={q.reload}>Refresh</button>
    </>}>
      <Loading loading={q.loading} error={q.error} empty={!rows.length} />
      {rows.length ? (
        <table>
          <thead><tr><th>When</th><th>Trip</th><th>Rider</th><th>Driver</th><th>Route</th><th className="num">Fare</th><th>Payment</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{when(r.created_at)}<br /><span className="muted">{r.city_id}</span></td>
                <td><code>{short(r.id)}</code><br />{r.vehicle_type}</td>
                <td>{r.rider?.full_name ?? "—"}<br /><span className="muted">{r.rider?.phone}</span></td>
                <td>{r.driver?.profiles?.full_name ?? "—"}<br /><span className="muted">{r.driver?.profiles?.phone}</span></td>
                <td><a href={osm(r.pickup_lat, r.pickup_lng)} target="_blank" rel="noopener">{r.pickup_address ?? "pickup"}</a> → {r.dropoff_address ?? "drop-off"}<br />
                  <span className="muted">{r.distance_km} km · {r.route_source ?? "estimate"}</span></td>
                <td className="num">{fcfa(r.fare_xaf)}{r.discount_xaf ? <><br /><span className="muted">−{fcfa(r.discount_xaf)} {r.promo_code}</span></> : null}</td>
                <td>{r.payment_method} <Badge value={r.payment_status} /></td>
                <td><Badge value={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Section>
  );
}
