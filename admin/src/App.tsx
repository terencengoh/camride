import { useEffect, useState, type ComponentType } from "react";
import type { Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "./lib/supabase";
import { useQuery } from "./lib/useQuery";
import Overview from "./pages/Overview";
import Drivers from "./pages/Drivers";
import Restaurants from "./pages/Restaurants";
import Trips from "./pages/Trips";
import Orders from "./pages/Orders";
import Payments from "./pages/Payments";
import Refunds from "./pages/Refunds";
import Payouts from "./pages/Payouts";
import RateCards from "./pages/RateCards";
import Promos from "./pages/Promos";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import Safety from "./pages/Safety";
import Ledger from "./pages/Ledger";

const PAGES: { id: string; label: string; Component: ComponentType }[] = [
  { id: "overview", label: "Overview", Component: Overview },
  { id: "drivers", label: "Drivers & documents", Component: Drivers },
  { id: "restaurants", label: "Restaurants", Component: Restaurants },
  { id: "trips", label: "Trips", Component: Trips },
  { id: "orders", label: "Orders", Component: Orders },
  { id: "payments", label: "Payments", Component: Payments },
  { id: "refunds", label: "Refunds", Component: Refunds },
  { id: "payouts", label: "Payouts", Component: Payouts },
  { id: "rates", label: "Rate cards", Component: RateCards },
  { id: "promos", label: "Promo codes", Component: Promos },
  { id: "users", label: "Users", Component: Users },
  { id: "safety", label: "SOS & support", Component: Safety },
  { id: "ledger", label: "Ledger & audit", Component: Ledger },
  { id: "settings", label: "Settings", Component: Settings },
];

const currentHash = () => window.location.hash.replace(/^#\/?/, "") || "overview";

function useHash() {
  const [hash, setHash] = useState(currentHash);
  useEffect(() => {
    const on = () => setHash(currentHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="login" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr(null);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) setErr(error.message);
    }}>
      <h1>CamRide <span style={{ color: "#007a3d" }}>Admin</span></h1>
      {!isConfigured ? <p className="error">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in admin/.env.local.</p> : null}
      <input type="email" placeholder="admin email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button className="btn primary" disabled={busy} type="submit">{busy ? "…" : "Sign in"}</button>
      {err ? <p className="error">{err}</p> : null}
      <p className="muted">Admins only. Accounts are created in Supabase Auth and promoted with SQL (see admin/README.md).</p>
    </form>
  );
}

function Shell({ session }: { session: Session }) {
  const hash = useHash();
  const role = useQuery(`role:${session.user.id}`, () =>
    supabase.from("profiles").select("role,suspended").eq("id", session.user.id).maybeSingle());
  if (role.loading) return <p className="muted" style={{ padding: 24 }}>Checking access…</p>;
  const me = role.data as { role: string; suspended: boolean } | null;
  const ok = me?.role === "admin" && !me.suspended;
  if (!ok) {
    return (
      <div className="login">
        <h1>Access denied</h1>
        <p>{session.user.email ?? session.user.phone} is not an admin.</p>
        {role.error ? <p className="error">{role.error}</p> : null}
        <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    );
  }
  const page = PAGES.find((p) => p.id === hash) ?? PAGES[0];
  return (
    <div className="layout">
      <nav>
        <div className="brand">Cam<span>Ride</span> admin</div>
        {PAGES.map((p) => <a key={p.id} href={`#/${p.id}`} className={p.id === page.id ? "active" : ""}>{p.label}</a>)}
        <div className="foot">
          <div>{session.user.email}</div>
          <button className="btn" style={{ marginTop: 8 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </nav>
      <main>
        <h1>{page.label}</h1>
        <page.Component key={page.id} />
      </main>
    </div>
  );
}

export default function App() {
  const session = useSession();
  if (session === undefined) return null;
  return session ? <Shell session={session} /> : <Login />;
}
