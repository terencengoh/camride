import { Fragment, useState } from "react";
import { supabase } from "../lib/supabase";
import { fcfa, short, when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Badge, Filter, Loading, Section } from "../components/ui";

const STATUSES = ["pending_payment", "placed", "accepted", "preparing", "ready", "picked_up", "delivered", "cancelled"];

interface OrderRow {
  id: string; created_at: string; status: string; subtotal_xaf: number; delivery_fee_xaf: number; discount_xaf: number; total_xaf: number;
  promo_code: string | null; payment_method: string; payment_status: string; delivery_address: string | null; distance_km: number;
  restaurants: { name: string; city_id: string } | null;
  customer: { full_name: string | null; phone: string | null } | null;
  courier: { profiles: { full_name: string | null; phone: string | null } | null } | null;
  order_items: { name: string; quantity: number; unit_price_xaf: number }[];
}

export default function Orders() {
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery(`orders:${status}`, () => {
    let b = supabase.from("orders").select(
      "id,created_at,status,subtotal_xaf,delivery_fee_xaf,discount_xaf,total_xaf,promo_code,payment_method,payment_status,delivery_address,distance_km," +
      "restaurants(name,city_id),customer:profiles!orders_customer_id_fkey(full_name,phone),courier:drivers!orders_courier_id_fkey(profiles(full_name,phone)),order_items(name,quantity,unit_price_xaf)",
    ).order("created_at", { ascending: false }).limit(200);
    if (status) b = b.eq("status", status);
    return b;
  });
  const rows = (q.data ?? []) as unknown as OrderRow[];
  return (
    <Section title="Food orders (latest 200)" actions={<>Status: <Filter value={status} options={STATUSES} onChange={setStatus} /><button className="btn" onClick={q.reload}>Refresh</button></>}>
      <Loading loading={q.loading} error={q.error} empty={!rows.length} />
      {rows.length ? (
        <table>
          <thead><tr><th>When</th><th>Order</th><th>Restaurant</th><th>Customer</th><th>Courier</th><th className="num">Total</th><th>Payment</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ cursor: "pointer" }}>
                  <td>{when(r.created_at)}</td>
                  <td><code>{short(r.id)}</code><br /><span className="muted">{r.order_items.length} item(s) · {r.distance_km} km</span></td>
                  <td>{r.restaurants?.name}<br /><span className="muted">{r.restaurants?.city_id}</span></td>
                  <td>{r.customer?.full_name ?? "—"}<br /><span className="muted">{r.customer?.phone}</span></td>
                  <td>{r.courier?.profiles?.full_name ?? "—"}</td>
                  <td className="num">{fcfa(r.total_xaf)}{r.discount_xaf ? <><br /><span className="muted">−{fcfa(r.discount_xaf)} {r.promo_code}</span></> : null}</td>
                  <td>{r.payment_method} <Badge value={r.payment_status} /></td>
                  <td><Badge value={r.status} /></td>
                </tr>
                {openId === r.id ? (
                  <tr><td colSpan={8}>
                    {r.order_items.map((i, n) => <div key={n}>{i.quantity} × {i.name} — {fcfa(i.unit_price_xaf * i.quantity)}</div>)}
                    <div className="muted">Subtotal {fcfa(r.subtotal_xaf)} · delivery {fcfa(r.delivery_fee_xaf)} · to {r.delivery_address ?? "—"}</div>
                  </td></tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      ) : null}
    </Section>
  );
}
