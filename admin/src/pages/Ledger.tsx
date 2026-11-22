import { useState } from "react";
import { supabase } from "../lib/supabase";
import { fcfa, short, when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Action, Filter, Loading, Section } from "../components/ui";
import { must } from "../lib/must";

interface Balance { id: string; kind: string; label: string | null; credit_balance_xaf: number; debit_balance_xaf: number }
interface Tx { id: string; kind: string; memo: string | null; created_at: string; trip_id: string | null; order_id: string | null; ledger_entries: { amount_xaf: number; ledger_accounts: { kind: string } | null }[] }
interface Audit { id: number; created_at: string; admin_id: string | null; action: string; target_type: string | null; target_id: string | null; details: Record<string, unknown> }

const KINDS = ["driver_wallet", "restaurant_wallet", "platform_revenue", "platform_promotions", "psp_clearing", "customer_deposits", "payouts_pending", "adjustments"];

function Adjust({ account, onDone }: { account: Balance; onDone: () => void }) {
  return <Action label="Adjust…" run={async () => {
    const v = window.prompt(`Adjust ${account.label ?? account.kind} by (FCFA). Positive = CamRide owes them more; negative = they owe CamRide.`);
    if (!v || !Number.isFinite(Number(v)) || Number(v) === 0) return;
    const memo = window.prompt("Reason (required, kept in the ledger and audit log)");
    if (!memo) return;
    await must(supabase.rpc("admin_adjust_wallet", { p_account: account.id, p_amount: Math.round(Number(v)), p_memo: memo }));
    onDone();
  }} />;
}

export default function Ledger() {
  const [kind, setKind] = useState("driver_wallet");
  const balances = useQuery(`balances:${kind}`, () => {
    let b = supabase.from("admin_account_balances").select("id,kind,label,credit_balance_xaf,debit_balance_xaf").order("credit_balance_xaf", { ascending: false }).limit(300);
    if (kind) b = b.eq("kind", kind);
    return b;
  });
  const txs = useQuery("ledger-tx", () => supabase.from("ledger_transactions")
    .select("id,kind,memo,created_at,trip_id,order_id,ledger_entries(amount_xaf,ledger_accounts(kind))").order("created_at", { ascending: false }).limit(50));
  const audit = useQuery("audit", () => supabase.from("admin_audit").select("id,created_at,admin_id,action,target_type,target_id,details").order("created_at", { ascending: false }).limit(100));
  const rows = (balances.data ?? []) as Balance[];
  const wallet = kind === "driver_wallet" || kind === "restaurant_wallet";
  return (
    <>
      <Section title="Account balances" actions={<>Kind: <Filter value={kind} options={KINDS} onChange={setKind} /></>}>
        <Loading loading={balances.loading} error={balances.error} empty={!rows.length} />
        {rows.length ? (
          <table>
            <thead><tr><th>Account</th><th>Kind</th><th className="num">Balance</th><th></th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.label ?? "—"} <span className="muted">{short(b.id)}</span></td>
                  <td>{b.kind}</td>
                  <td className="num">{fcfa(["psp_clearing", "platform_promotions", "customer_deposits", "adjustments"].includes(b.kind) ? b.debit_balance_xaf : b.credit_balance_xaf)}</td>
                  <td>{wallet ? <Adjust account={b} onDone={() => { balances.reload(); txs.reload(); audit.reload(); }} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p className="muted">Double-entry: every transaction sums to zero. Wallet balance = what CamRide owes the holder (negative = they owe commission on cash trips).</p>
      </Section>
      <Section title="Latest ledger transactions">
        <Loading loading={txs.loading} error={txs.error} />
        <table>
          <thead><tr><th>When</th><th>Kind</th><th>Ref</th><th>Entries</th><th>Memo</th></tr></thead>
          <tbody>
            {((txs.data ?? []) as unknown as Tx[]).map((t) => (
              <tr key={t.id}>
                <td>{when(t.created_at)}</td>
                <td>{t.kind}</td>
                <td>{t.trip_id ? `trip ${short(t.trip_id)}` : t.order_id ? `order ${short(t.order_id)}` : "—"}</td>
                <td>{t.ledger_entries.map((e, i) => <div key={i}>{e.ledger_accounts?.kind}: {e.amount_xaf > 0 ? "Dr" : "Cr"} {fcfa(Math.abs(e.amount_xaf))}</div>)}</td>
                <td>{t.memo ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Admin audit log">
        <Loading loading={audit.loading} error={audit.error} />
        <table>
          <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            {((audit.data ?? []) as unknown as Audit[]).map((a) => (
              <tr key={a.id}>
                <td>{when(a.created_at)}</td>
                <td>{a.admin_id ? short(a.admin_id) : "system"}</td>
                <td>{a.action}</td>
                <td>{a.target_type} {short(a.target_id)}</td>
                <td><code>{JSON.stringify(a.details)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
