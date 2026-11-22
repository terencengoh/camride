import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useQuery } from "../lib/useQuery";
import { Action, Loading, Section } from "../components/ui";
import { must } from "../lib/must";

interface Card { key: string; base_xaf: number; per_km_xaf: number; per_min_xaf: number; minimum_xaf: number; max_distance_km: number | null }
interface CityCard extends Card { city_id: string }
const FIELDS = ["base_xaf", "per_km_xaf", "per_min_xaf", "minimum_xaf", "max_distance_km"] as const;
const KEYS = ["moto", "car", "comfort", "delivery"];

function CardRow<T extends Card>({ card, label, save, remove }: { card: T; label: string; save: (c: T) => Promise<void>; remove?: () => Promise<void> }) {
  const [c, setC] = useState(card);
  const dirty = FIELDS.some((f) => c[f] !== card[f]);
  return (
    <tr>
      <td><b>{label}</b></td>
      {FIELDS.map((f) => (
        <td key={f}><input className="small" inputMode="numeric" value={c[f] ?? ""} onChange={(e) =>
          setC({ ...c, [f]: e.target.value === "" ? (f === "max_distance_km" ? null : 0) : Number(e.target.value) })} /></td>
      ))}
      <td className="row">
        <Action label="Save" kind="primary" disabled={!dirty} run={() => save(c)} />
        {remove ? <Action label="Remove" kind="danger" confirm="Remove this city override? The national card applies again." run={remove} /> : null}
      </td>
    </tr>
  );
}

const Head = () => <thead><tr><th></th><th>Base</th><th>Per km</th><th>Per min</th><th>Minimum</th><th>Max km</th><th></th></tr></thead>;

export default function RateCards() {
  const national = useQuery("rate_cards", () => supabase.from("rate_cards").select("*").order("key"));
  const city = useQuery("city_rate_cards", () => supabase.from("city_rate_cards").select("*").order("city_id").order("key"));
  const cities = useQuery("cities", () => supabase.from("cities").select("id,name").order("name"));
  const [newCity, setNewCity] = useState(""); const [newKey, setNewKey] = useState("car");
  const pick = (c: Card) => Object.fromEntries(FIELDS.map((f) => [f, c[f]]));
  return (
    <>
      <Section title="National rate cards (FCFA)">
        <Loading loading={national.loading} error={national.error} />
        <table><Head /><tbody>
          {((national.data ?? []) as Card[]).map((c) => (
            <CardRow key={`${c.key}-${national.key}`} card={c} label={c.key}
              save={async (n) => { await must(supabase.from("rate_cards").update(pick(n)).eq("key", c.key)); national.reload(); }} />
          ))}
        </tbody></table>
        <p className="muted">fare = max(minimum, base + per_km × km + per_min × minutes), rounded to 50 FCFA. Delivery uses the “delivery” card.</p>
      </Section>
      <Section title="City overrides" actions={<>
        <select value={newCity} onChange={(e) => setNewCity(e.target.value)}><option value="">city…</option>
          {((cities.data ?? []) as { id: string; name: string }[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={newKey} onChange={(e) => setNewKey(e.target.value)}>{KEYS.map((k) => <option key={k}>{k}</option>)}</select>
        <Action label="Add override" kind="primary" disabled={!newCity} run={async () => {
          const base = ((national.data ?? []) as Card[]).find((c) => c.key === newKey);
          if (!base) throw new Error("national card missing");
          await must(supabase.from("city_rate_cards").insert({ city_id: newCity, key: newKey, ...pick(base) }));
          city.reload();
        }} />
      </>}>
        <Loading loading={city.loading} error={city.error} empty={!(city.data ?? []).length} />
        {(city.data ?? []).length ? (
          <table><Head /><tbody>
            {((city.data ?? []) as CityCard[]).map((c) => (
              <CardRow key={`${c.city_id}-${c.key}-${city.key}`} card={c} label={`${c.city_id} · ${c.key}`}
                save={async (n) => { await must(supabase.from("city_rate_cards").update(pick(n)).eq("city_id", c.city_id).eq("key", c.key)); city.reload(); }}
                remove={async () => { await must(supabase.from("city_rate_cards").delete().eq("city_id", c.city_id).eq("key", c.key)); city.reload(); }} />
            ))}
          </tbody></table>
        ) : null}
      </Section>
    </>
  );
}
