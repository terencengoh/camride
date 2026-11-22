import { useState } from "react";
import { supabase } from "../lib/supabase";
import { when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Action, Badge, Filter, Loading, Section } from "../components/ui";
import { must } from "../lib/must";

const ROLES = ["rider", "driver", "courier", "restaurant", "admin"];
interface Profile { id: string; full_name: string | null; phone: string | null; role: string; city_id: string | null; suspended: boolean; suspended_reason: string | null; created_at: string; accepted_terms_at: string | null }

export default function Users() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [suspended, setSuspended] = useState("");
  const q = useQuery(`users:${search}:${role}:${suspended}`, () => {
    let b = supabase.from("profiles").select("id,full_name,phone,role,city_id,suspended,suspended_reason,created_at,accepted_terms_at")
      .order("created_at", { ascending: false }).limit(200);
    const s = search.replace(/[%,()]/g, "");
    if (s) b = b.or(`phone.ilike.%${s}%,full_name.ilike.%${s}%`);
    if (role) b = b.eq("role", role);
    if (suspended) b = b.eq("suspended", suspended === "yes");
    return b;
  });
  const rows = (q.data ?? []) as Profile[];
  return (
    <Section title="Users" actions={<>
      <input placeholder="name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      Role: <Filter value={role} options={ROLES} onChange={setRole} />
      Suspended: <Filter value={suspended} options={["yes", "no"]} onChange={setSuspended} />
    </>}>
      <Loading loading={q.loading} error={q.error} empty={!rows.length} />
      {rows.length ? (
        <table>
          <thead><tr><th>User</th><th>City</th><th>Joined</th><th>Terms</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name ?? "—"}<br /><span className="muted">{u.phone}</span></td>
                <td>{u.city_id ?? "—"}</td>
                <td>{when(u.created_at)}</td>
                <td>{u.accepted_terms_at ? when(u.accepted_terms_at) : <Badge value="missing" />}</td>
                <td>
                  <select value={u.role} onChange={async (e) => {
                    const r = e.target.value;
                    if (r === "admin" && !window.confirm("Give this user full admin access?")) return;
                    const { error } = await supabase.rpc("admin_set_role", { p_user_id: u.id, p_role: r });
                    if (error) window.alert(error.message); q.reload();
                  }}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                </td>
                <td>{u.suspended ? <><Badge value="suspended" /><br /><span className="muted">{u.suspended_reason}</span></> : <Badge value="active" />}</td>
                <td>{u.suspended
                  ? <Action label="Unsuspend" kind="primary" run={async () => { await must(supabase.rpc("admin_set_suspended", { p_user_id: u.id, p_suspended: false })); q.reload(); }} />
                  : <Action label="Suspend…" kind="danger" run={async () => {
                    const reason = window.prompt("Reason (shown in the audit log)"); if (!reason) return;
                    await must(supabase.rpc("admin_set_suspended", { p_user_id: u.id, p_suspended: true, p_reason: reason })); q.reload();
                  }} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="muted">Suspended users cannot request rides, order, go online or pay (enforced by the API and database).</p>
    </Section>
  );
}
