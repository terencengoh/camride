import { useState } from "react";
import { supabase } from "../lib/supabase";
import { fcfa, when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Action, Badge, Loading, Section } from "../components/ui";
import { must } from "../lib/must";

interface Promo {
  code: string; description: string | null; kind: string; value: number; max_discount_xaf: number | null; min_amount_xaf: number;
  applies_to: string; starts_at: string | null; ends_at: string | null; max_redemptions: number | null; per_user_limit: number; active: boolean;
}

const empty = { code: "", description: "", kind: "percent", value: "10", max_discount_xaf: "", min_amount_xaf: "0", applies_to: "any", ends_at: "", max_redemptions: "", per_user_limit: "1" };

export default function Promos() {
  const q = useQuery("promos", () => supabase.from("promo_codes").select("*").order("created_at", { ascending: false }));
  const uses = useQuery("promo-uses", () => supabase.from("promo_redemptions").select("code,discount_xaf"));
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const stats = new Map<string, { n: number; total: number }>();
  for (const u of (uses.data ?? []) as { code: string; discount_xaf: number }[]) {
    const s = stats.get(u.code) ?? { n: 0, total: 0 }; s.n++; s.total += u.discount_xaf; stats.set(u.code, s);
  }
  const rows = (q.data ?? []) as Promo[];
  const num = (v: string) => (v === "" ? null : Math.round(Number(v)));
  return (
    <>
      <Section title="New promo code">
        <div className="grid2">
          <label>Code<input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="RENTREE26" /></label>
          <label>Description<input value={f.description} onChange={set("description")} /></label>
          <label>Kind<select value={f.kind} onChange={set("kind")}><option value="percent">percent</option><option value="fixed">fixed FCFA</option></select></label>
          <label>Value<input value={f.value} onChange={set("value")} inputMode="numeric" /></label>
          <label>Max discount (FCFA)<input value={f.max_discount_xaf} onChange={set("max_discount_xaf")} inputMode="numeric" /></label>
          <label>Min amount (FCFA)<input value={f.min_amount_xaf} onChange={set("min_amount_xaf")} inputMode="numeric" /></label>
          <label>Applies to<select value={f.applies_to} onChange={set("applies_to")}><option>any</option><option>ride</option><option>food</option></select></label>
          <label>Ends<input type="datetime-local" value={f.ends_at} onChange={set("ends_at")} /></label>
          <label>Total uses<input value={f.max_redemptions} onChange={set("max_redemptions")} inputMode="numeric" placeholder="unlimited" /></label>
          <label>Uses per user<input value={f.per_user_limit} onChange={set("per_user_limit")} inputMode="numeric" /></label>
          <Action label="Create" kind="primary" disabled={!/^[A-Z0-9_-]{3,20}$/.test(f.code)} run={async () => {
            await must(supabase.from("promo_codes").insert({
              code: f.code, description: f.description || null, kind: f.kind, value: num(f.value), max_discount_xaf: num(f.max_discount_xaf),
              min_amount_xaf: num(f.min_amount_xaf) ?? 0, applies_to: f.applies_to, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
              max_redemptions: num(f.max_redemptions), per_user_limit: num(f.per_user_limit) ?? 1,
            }));
            setF(empty); q.reload();
          }} />
        </div>
        <p className="muted">Discounts are paid by CamRide (platform_promotions); drivers and restaurants still earn on the full price.</p>
      </Section>
      <Section title="Promo codes">
        <Loading loading={q.loading} error={q.error} empty={!rows.length} />
        {rows.length ? (
          <table>
            <thead><tr><th>Code</th><th>Discount</th><th>Rules</th><th>Ends</th><th>Used</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.code}>
                  <td><b>{p.code}</b><br /><span className="muted">{p.description}</span></td>
                  <td>{p.kind === "percent" ? `${p.value}%` : fcfa(p.value)}{p.max_discount_xaf ? ` (max ${fcfa(p.max_discount_xaf)})` : ""}</td>
                  <td>{p.applies_to} · min {fcfa(p.min_amount_xaf)} · {p.per_user_limit}/user{p.max_redemptions ? ` · ${p.max_redemptions} total` : ""}</td>
                  <td>{when(p.ends_at)}</td>
                  <td>{stats.get(p.code)?.n ?? 0} · {fcfa(stats.get(p.code)?.total ?? 0)}</td>
                  <td><Badge value={p.active} /></td>
                  <td><Action label={p.active ? "Disable" : "Enable"} run={async () => { await must(supabase.from("promo_codes").update({ active: !p.active }).eq("code", p.code)); q.reload(); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>
    </>
  );
}
