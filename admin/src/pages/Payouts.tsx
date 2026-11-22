import { useState } from "react";
import { callFunction, supabase } from "../lib/supabase";
import { fcfa, when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Action, Badge, Filter, Loading, Section } from "../components/ui";

interface PayoutRow {
  id: string; created_at: string; amount_xaf: number; phone: string; method: string; status: string; provider: string | null;
  provider_ref: string | null; failure_reason: string | null; review_note: string | null; account_id: string;
  profiles: { full_name: string | null; phone: string | null } | null;
  ledger_accounts: { kind: string; restaurants: { name: string } | null } | null;
}

export default function Payouts() {
  const [status, setStatus] = useState("requested");
  const q = useQuery(`payouts:${status}`, () => {
    let b = supabase.from("payout_requests")
      .select("id,created_at,amount_xaf,phone,method,status,provider,provider_ref,failure_reason,review_note,account_id,profiles!payout_requests_requested_by_fkey(full_name,phone),ledger_accounts(kind,restaurants(name))")
      .order("created_at", { ascending: false }).limit(200);
    if (status) b = b.eq("status", status);
    return b;
  });
  const bal = useQuery("payout-balances", () => supabase.from("admin_account_balances").select("id,credit_balance_xaf").in("kind", ["driver_wallet", "restaurant_wallet"]));
  const balance = new Map(((bal.data ?? []) as { id: string; credit_balance_xaf: number }[]).map((b) => [b.id, Number(b.credit_balance_xaf)]));
  const rows = (q.data ?? []) as unknown as PayoutRow[];
  const act = async (id: string, action: "approve" | "reject" | "send" | "refresh") => {
    const note = action === "reject" ? window.prompt("Reason shown to the requester") : undefined;
    if (action === "reject" && !note) return;
    const r = await callFunction<{ status: string }>("payouts-process", { payout_id: id, action, note });
    window.alert(`Payout ${r.status}`); q.reload(); bal.reload();
  };
  return (
    <Section title="Payout requests" actions={<>Status: <Filter value={status} options={["requested", "approved", "processing", "paid", "failed", "rejected"]} onChange={setStatus} />
      <button className="btn" onClick={() => { q.reload(); bal.reload(); }}>Refresh</button></>}>
      <Loading loading={q.loading} error={q.error} empty={!rows.length} />
      {rows.length ? (
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Wallet</th><th className="num">Amount</th><th className="num">Wallet balance</th><th>To</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{when(p.created_at)}</td>
                <td>{p.profiles?.full_name ?? "—"}<br /><span className="muted">{p.profiles?.phone}</span></td>
                <td>{p.ledger_accounts?.kind === "restaurant_wallet" ? `🍲 ${p.ledger_accounts.restaurants?.name ?? ""}` : "🚗 driver"}</td>
                <td className="num"><b>{fcfa(p.amount_xaf)}</b></td>
                <td className="num">{fcfa(balance.get(p.account_id))}</td>
                <td>{p.phone} ({p.method})</td>
                <td><Badge value={p.status} />{p.failure_reason || p.review_note ? <><br /><span className="muted">{p.failure_reason ?? p.review_note}</span></> : null}</td>
                <td className="row">
                  {p.status === "requested" ? <>
                    <Action label="Approve & send" kind="primary" confirm={`Send ${fcfa(p.amount_xaf)} to ${p.phone}?`} run={() => act(p.id, "approve")} />
                    <Action label="Reject" kind="danger" run={() => act(p.id, "reject")} />
                  </> : null}
                  {p.status === "approved" ? <Action label="Send" kind="primary" run={() => act(p.id, "send")} /> : null}
                  {p.status === "processing" ? <Action label="Check status" run={() => act(p.id, "refresh")} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="muted">The amount is held from the wallet when requested; rejecting or a failed transfer returns it. Wallet balance shown excludes the held amount.</p>
    </Section>
  );
}
