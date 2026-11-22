import { useState } from "react";
import { callFunction, supabase } from "../lib/supabase";
import { fcfa, short, when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Action, Badge, Filter, Loading, Section } from "../components/ui";

interface PaymentRow {
  id: string; created_at: string; amount_xaf: number; method: string; provider: string; provider_ref: string | null; phone: string | null;
  status: string; failure_reason: string | null; trip_id: string | null; order_id: string | null;
  profiles: { full_name: string | null } | null;
  refunds: { amount_xaf: number; status: string }[];
}

export default function Payments() {
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const q = useQuery(`payments:${status}:${method}`, () => {
    let b = supabase.from("payments")
      .select("id,created_at,amount_xaf,method,provider,provider_ref,phone,status,failure_reason,trip_id,order_id,profiles(full_name),refunds(amount_xaf,status)")
      .order("created_at", { ascending: false }).limit(200);
    if (status) b = b.eq("status", status);
    if (method) b = b.eq("method", method);
    return b;
  });
  const rows = (q.data ?? []) as unknown as PaymentRow[];
  const refund = async (p: PaymentRow, refunded: number) => {
    const max = p.amount_xaf - refunded;
    const amount = window.prompt(`Refund amount in FCFA (max ${max}). It is sent to ${p.phone} through the payout provider.`, String(max));
    if (!amount) return;
    const reason = window.prompt("Reason (kept in the audit log)");
    if (!reason) return;
    const r = await callFunction<{ status: string }>("refunds-process", { payment_id: p.id, amount_xaf: Math.round(Number(amount)), reason });
    window.alert(`Refund ${r.status}`);
    q.reload();
  };
  return (
    <Section title="Payments (latest 200)" actions={<>
      Status: <Filter value={status} options={["pending", "successful", "failed"]} onChange={setStatus} />
      Method: <Filter value={method} options={["mtn", "orange", "cash"]} onChange={setMethod} />
      <button className="btn" onClick={q.reload}>Refresh</button>
    </>}>
      <Loading loading={q.loading} error={q.error} empty={!rows.length} />
      {rows.length ? (
        <table>
          <thead><tr><th>When</th><th>Payer</th><th>For</th><th className="num">Amount</th><th>Method</th><th>Provider ref</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const refunded = p.refunds.filter((r) => r.status !== "failed").reduce((s, r) => s + r.amount_xaf, 0);
              return (
                <tr key={p.id}>
                  <td>{when(p.created_at)}</td>
                  <td>{p.profiles?.full_name ?? "—"}<br /><span className="muted">{p.phone}</span></td>
                  <td>{p.trip_id ? `trip ${short(p.trip_id)}` : `order ${short(p.order_id)}`}</td>
                  <td className="num">{fcfa(p.amount_xaf)}{refunded ? <><br /><span className="muted">refunded {fcfa(refunded)}</span></> : null}</td>
                  <td>{p.method} · {p.provider}</td>
                  <td><code>{p.provider_ref ?? "—"}</code></td>
                  <td><Badge value={p.status} />{p.failure_reason ? <><br /><span className="muted">{p.failure_reason}</span></> : null}</td>
                  <td>{p.status === "successful" && p.method !== "cash" && refunded < p.amount_xaf
                    ? <Action label="Refund…" kind="danger" run={() => refund(p, refunded)} /> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      <p className="muted">Cash disputes: use a wallet adjustment in “Ledger & audit”.</p>
    </Section>
  );
}
