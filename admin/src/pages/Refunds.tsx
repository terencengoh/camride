import { callFunction, supabase } from "../lib/supabase";
import { fcfa, short, when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Action, Badge, Loading, Section } from "../components/ui";

interface RefundRow {
  id: string; created_at: string; payment_id: string; amount_xaf: number; reason: string; phone: string; method: string;
  status: string; provider: string | null; provider_ref: string | null; failure_reason: string | null;
}

export default function Refunds() {
  const q = useQuery("refunds", () => supabase.from("refunds").select("*").order("created_at", { ascending: false }).limit(200));
  const rows = (q.data ?? []) as RefundRow[];
  const act = async (id: string, action: "send" | "refresh") => {
    const r = await callFunction<{ status: string }>("refunds-process", { refund_id: id, action });
    window.alert(`Refund ${r.status}`); q.reload();
  };
  return (
    <Section title="Refunds" actions={<button className="btn" onClick={q.reload}>Refresh</button>}>
      <Loading loading={q.loading} error={q.error} empty={!rows.length} />
      {rows.length ? (
        <table>
          <thead><tr><th>When</th><th>Payment</th><th className="num">Amount</th><th>To</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{when(r.created_at)}</td>
                <td><code>{short(r.payment_id)}</code></td>
                <td className="num">{fcfa(r.amount_xaf)}</td>
                <td>{r.phone} ({r.method})</td>
                <td>{r.reason}</td>
                <td><Badge value={r.status} />{r.failure_reason ? <><br /><span className="muted">{r.failure_reason}</span></> : null}
                  {r.provider_ref ? <><br /><code>{r.provider}:{r.provider_ref}</code></> : null}</td>
                <td>
                  {r.status === "requested" ? <Action label="Send" kind="primary" run={() => act(r.id, "send")} /> : null}
                  {r.status === "processing" ? <Action label="Check status" run={() => act(r.id, "refresh")} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="muted">A refund in “processing” is never re-sent automatically: check its status first to avoid paying twice.</p>
    </Section>
  );
}
