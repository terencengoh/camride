import { useState } from "react";
import { supabase } from "../lib/supabase";
import { when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Action, Loading, Section } from "../components/ui";
import { must } from "../lib/must";

interface Setting { key: string; value: number; description: string | null; updated_at: string }

function Row({ s, onSaved }: { s: Setting; onSaved: () => void }) {
  const [v, setV] = useState(String(s.value));
  return (
    <tr>
      <td><code>{s.key}</code><br /><span className="muted">{s.description}</span></td>
      <td><input className="small" value={v} inputMode="decimal" onChange={(e) => setV(e.target.value)} /></td>
      <td className="muted">{when(s.updated_at)}</td>
      <td><Action label="Save" kind="primary" disabled={v === String(s.value) || !Number.isFinite(Number(v))} run={async () => {
        await must(supabase.from("platform_settings").update({ value: Number(v), updated_at: new Date().toISOString() }).eq("key", s.key)); onSaved();
      }} /></td>
    </tr>
  );
}

export default function Settings() {
  const q = useQuery("settings", () => supabase.from("platform_settings").select("*").order("key"));
  const rows = (q.data ?? []) as Setting[];
  return (
    <Section title="Platform settings">
      <Loading loading={q.loading} error={q.error} />
      <table>
        <thead><tr><th>Setting</th><th>Value</th><th>Updated</th><th></th></tr></thead>
        <tbody>{rows.map((s) => <Row key={`${s.key}-${s.updated_at}`} s={s} onSaved={q.reload} />)}</tbody>
      </table>
      <p className="muted">Commission changes apply to trips/orders settled after the change; past ledger entries are never modified.</p>
    </Section>
  );
}
