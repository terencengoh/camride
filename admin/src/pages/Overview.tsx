import { supabase } from "../lib/supabase";
import { fcfa } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Loading, Section } from "../components/ui";

async function count(table: string, apply: (q: ReturnType<typeof base>) => ReturnType<typeof base>) {
  const { count: n, error } = await apply(base(table));
  if (error) throw new Error(error.message);
  return n ?? 0;
}
const base = (table: string) => supabase.from(table).select("*", { count: "exact", head: true });

async function load() {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const today = since.toISOString();
  const [docs, drivers, payouts, refunds, sos, tickets, trips, orders, failed] = await Promise.all([
    count("driver_documents", (q) => q.eq("status", "pending")),
    count("drivers", (q) => q.eq("documents_verified", false)),
    count("payout_requests", (q) => q.eq("status", "requested")),
    count("refunds", (q) => q.in("status", ["requested", "processing"])),
    count("sos_events", (q) => q.eq("status", "open")),
    count("support_tickets", (q) => q.neq("status", "closed")),
    count("trips", (q) => q.gte("created_at", today)),
    count("orders", (q) => q.gte("created_at", today)),
    count("payments", (q) => q.eq("status", "failed").gte("created_at", today)),
  ]);
  const { data: bal } = await supabase.from("admin_account_balances").select("kind,credit_balance_xaf,debit_balance_xaf")
    .in("kind", ["platform_revenue", "platform_promotions", "psp_clearing", "payouts_pending", "driver_wallet", "restaurant_wallet"]);
  const sum = (k: string, credit = true) => (bal ?? []).filter((b) => b.kind === k)
    .reduce((s, b) => s + Number(credit ? b.credit_balance_xaf : b.debit_balance_xaf), 0);
  return {
    data: {
      todo: { docs, drivers, payouts, refunds, sos, tickets },
      today: { trips, orders, failed },
      money: {
        revenue: sum("platform_revenue"), promotions: sum("platform_promotions", false), clearing: sum("psp_clearing", false),
        pending: sum("payouts_pending"), drivers: sum("driver_wallet"), restaurants: sum("restaurant_wallet"),
      },
    },
    error: null,
  };
}

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  return <div className="stat">{href ? <a href={href}><b>{value}</b>{label}</a> : <><b>{value}</b>{label}</>}</div>;
}

export default function Overview() {
  const q = useQuery("overview", load);
  const d = q.data;
  return (
    <>
      <Loading loading={q.loading} error={q.error} />
      {d ? (
        <>
          <Section title="Needs attention">
            <div className="cards">
              <Stat label="SOS alerts open" value={d.todo.sos} href="#/safety" />
              <Stat label="Documents to review" value={d.todo.docs} href="#/drivers" />
              <Stat label="Drivers not verified" value={d.todo.drivers} href="#/drivers" />
              <Stat label="Payout requests" value={d.todo.payouts} href="#/payouts" />
              <Stat label="Refunds in flight" value={d.todo.refunds} href="#/refunds" />
              <Stat label="Support tickets open" value={d.todo.tickets} href="#/safety" />
            </div>
          </Section>
          <Section title="Today">
            <div className="cards">
              <Stat label="Trips requested" value={d.today.trips} href="#/trips" />
              <Stat label="Food orders" value={d.today.orders} href="#/orders" />
              <Stat label="Failed payments" value={d.today.failed} href="#/payments" />
            </div>
          </Section>
          <Section title="Money (ledger)">
            <div className="cards">
              <Stat label="Platform revenue (commission)" value={fcfa(d.money.revenue)} />
              <Stat label="Promotions funded" value={fcfa(d.money.promotions)} />
              <Stat label="Owed to drivers / couriers" value={fcfa(d.money.drivers)} />
              <Stat label="Owed to restaurants" value={fcfa(d.money.restaurants)} />
              <Stat label="Payouts in progress" value={fcfa(d.money.pending)} />
              <Stat label="Held at payment providers" value={fcfa(d.money.clearing)} />
            </div>
            <p className="muted">Wallet amounts can be negative when a driver collected cash and owes the commission.</p>
          </Section>
        </>
      ) : null}
    </>
  );
}
