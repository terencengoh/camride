import { useState } from "react";
import { supabase } from "../lib/supabase";
import { fcfa } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Action, Badge, Loading, Section } from "../components/ui";
import { must } from "../lib/must";

interface Restaurant {
  id: string; name: string; city_id: string; address: string | null; tags: string | null; emoji: string | null;
  is_open: boolean; active: boolean; rating_avg: number; rating_count: number; owner_id: string | null;
  profiles: { full_name: string | null; phone: string | null } | null;
}
interface MenuItem { id: string; name: string; name_fr: string | null; price_xaf: number; available: boolean }

function Menu({ restaurantId }: { restaurantId: string }) {
  const q = useQuery(`menu:${restaurantId}`, () => supabase.from("menu_items").select("id,name,name_fr,price_xaf,available").eq("restaurant_id", restaurantId).order("name"));
  const [name, setName] = useState(""); const [price, setPrice] = useState("");
  const items = (q.data ?? []) as MenuItem[];
  return (
    <div>
      <Loading loading={q.loading} error={q.error} empty={!items.length} />
      {items.map((m) => (
        <div className="doc row" key={m.id}>
          <b>{m.name}</b>{m.name_fr ? <span className="muted">/ {m.name_fr}</span> : null} {fcfa(m.price_xaf)} <Badge value={m.available ? "available" : "hidden"} />
          <Action label={m.available ? "Hide" : "Show"} run={async () => { await must(supabase.from("menu_items").update({ available: !m.available }).eq("id", m.id)); q.reload(); }} />
          <Action label="Price…" run={async () => {
            const v = window.prompt("New price (FCFA)", String(m.price_xaf)); if (!v) return;
            await must(supabase.from("menu_items").update({ price_xaf: Math.round(Number(v)) }).eq("id", m.id)); q.reload();
          }} />
        </div>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        <input placeholder="New item name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="small" placeholder="FCFA" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Action label="Add item" kind="primary" disabled={!name || !(Number(price) > 0)} run={async () => {
          await must(supabase.from("menu_items").insert({ restaurant_id: restaurantId, name, price_xaf: Math.round(Number(price)) }));
          setName(""); setPrice(""); q.reload();
        }} />
      </div>
    </div>
  );
}

function NewRestaurant({ onDone }: { onDone: () => void }) {
  const cities = useQuery("cities", () => supabase.from("cities").select("id,name").order("name"));
  const [f, setF] = useState({ name: "", city_id: "", lat: "", lng: "", address: "", tags: "", emoji: "🍲", owner_phone: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Section title="Add a restaurant">
      <div className="grid2">
        <label>Name<input value={f.name} onChange={set("name")} /></label>
        <label>City<select value={f.city_id} onChange={set("city_id")}><option value="">—</option>
          {((cities.data ?? []) as { id: string; name: string }[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Latitude<input value={f.lat} onChange={set("lat")} placeholder="4.0511" /></label>
        <label>Longitude<input value={f.lng} onChange={set("lng")} placeholder="9.7679" /></label>
        <label>Address<input value={f.address} onChange={set("address")} /></label>
        <label>Tags<input value={f.tags} onChange={set("tags")} placeholder="Ndolé · Grillades" /></label>
        <label>Emoji<input value={f.emoji} onChange={set("emoji")} /></label>
        <label>Owner phone (optional)<input value={f.owner_phone} onChange={set("owner_phone")} placeholder="2376XXXXXXXX" /></label>
        <Action label="Create" kind="primary" disabled={!f.name || !f.city_id || !f.lat || !f.lng} run={async () => {
          const lat = Number(f.lat), lng = Number(f.lng);
          if (!(lat > 1.5 && lat < 13.2 && lng > 8.3 && lng < 16.3)) throw new Error("Coordinates must be in Cameroon");
          let owner_id: string | null = null;
          if (f.owner_phone) {
            const phone = f.owner_phone.replace(/\D/g, "");
            const p = await must(supabase.from("profiles").select("id").in("phone", [phone, `+${phone}`]).maybeSingle());
            if (!p) throw new Error("No user with that phone. Ask the owner to sign up in the app first.");
            owner_id = p.id;
            await must(supabase.rpc("admin_set_role", { p_user_id: owner_id, p_role: "restaurant" }));
          }
          await must(supabase.from("restaurants").insert({
            name: f.name, city_id: f.city_id, location: `SRID=4326;POINT(${lng} ${lat})`, address: f.address || null,
            tags: f.tags || null, emoji: f.emoji || null, owner_id,
          }));
          onDone();
        }} />
      </div>
    </Section>
  );
}

export default function Restaurants() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const q = useQuery("restaurants", () => supabase.from("restaurants")
    .select("id,name,city_id,address,tags,emoji,is_open,active,rating_avg,rating_count,owner_id,profiles(full_name,phone)").order("city_id").order("name"));
  const rows = (q.data ?? []) as unknown as Restaurant[];
  return (
    <>
      {adding ? <NewRestaurant onDone={() => { setAdding(false); q.reload(); }} /> : null}
      <Section title="Restaurants" actions={<button className="btn primary" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Add restaurant"}</button>}>
        <Loading loading={q.loading} error={q.error} empty={!rows.length} />
        {rows.length ? (
          <table>
            <thead><tr><th>Restaurant</th><th>City</th><th>Owner</th><th>Rating</th><th>Open</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {rows.flatMap((r) => [
                <tr key={r.id}>
                  <td>{r.emoji} <b>{r.name}</b><br /><span className="muted">{r.tags}</span></td>
                  <td>{r.city_id}</td>
                  <td>{r.profiles?.full_name ?? "—"}<br /><span className="muted">{r.profiles?.phone}</span></td>
                  <td>⭐ {Number(r.rating_avg).toFixed(1)} ({r.rating_count})</td>
                  <td><Badge value={r.is_open} /></td>
                  <td><Badge value={r.active} /></td>
                  <td className="row">
                    <button className="btn" onClick={() => setOpenId(openId === r.id ? null : r.id)}>{openId === r.id ? "Hide menu" : "Menu"}</button>
                    <Action label={r.active ? "Suspend" : "Re-activate"} kind={r.active ? "danger" : "primary"}
                      confirm={r.active ? "Suspend this restaurant? It disappears from the app." : undefined}
                      run={async () => { await must(supabase.from("restaurants").update({ active: !r.active }).eq("id", r.id)); q.reload(); }} />
                  </td>
                </tr>,
                openId === r.id ? <tr key={`${r.id}-m`}><td colSpan={7}><Menu restaurantId={r.id} /></td></tr> : null,
              ])}
            </tbody>
          </table>
        ) : null}
      </Section>
    </>
  );
}
