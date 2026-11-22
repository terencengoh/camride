import { useState } from "react";
import { supabase } from "../lib/supabase";
import { osm, short, when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Action, Badge, Filter, Loading, Section } from "../components/ui";
import { must } from "../lib/must";

interface Sos { id: string; created_at: string; trip_id: string | null; lat: number | null; lng: number | null; note: string | null; status: string; resolved_at: string | null; profiles: { full_name: string | null; phone: string | null } | null }
interface Ticket { id: string; created_at: string; subject: string; message: string; status: string; admin_reply: string | null; trip_id: string | null; order_id: string | null; profiles: { full_name: string | null; phone: string | null } | null }

function TicketRow({ t, onSaved }: { t: Ticket; onSaved: () => void }) {
  const [reply, setReply] = useState(t.admin_reply ?? "");
  return (
    <tr>
      <td>{when(t.created_at)}</td>
      <td>{t.profiles?.full_name ?? "—"}<br /><span className="muted">{t.profiles?.phone}</span></td>
      <td><b>{t.subject}</b><br />{t.message}
        {t.trip_id || t.order_id ? <div className="muted">{t.trip_id ? `trip ${short(t.trip_id)}` : `order ${short(t.order_id)}`}</div> : null}</td>
      <td><textarea rows={3} cols={34} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply (the user gets a push notification)" /></td>
      <td><Badge value={t.status} /></td>
      <td className="row">
        <Action label="Send reply" kind="primary" disabled={!reply.trim() || reply === t.admin_reply} run={async () => {
          await must(supabase.from("support_tickets").update({ admin_reply: reply.trim(), status: "in_progress" }).eq("id", t.id)); onSaved();
        }} />
        {t.status !== "closed" ? <Action label="Close" run={async () => { await must(supabase.from("support_tickets").update({ status: "closed" }).eq("id", t.id)); onSaved(); }} /> : null}
      </td>
    </tr>
  );
}

export default function Safety() {
  const [sosStatus, setSosStatus] = useState("open");
  const [ticketStatus, setTicketStatus] = useState("open");
  const sos = useQuery(`sos:${sosStatus}`, () => {
    let b = supabase.from("sos_events").select("id,created_at,trip_id,lat,lng,note,status,resolved_at,profiles!sos_events_user_id_fkey(full_name,phone)").order("created_at", { ascending: false }).limit(100);
    if (sosStatus) b = b.eq("status", sosStatus);
    return b;
  });
  const tickets = useQuery(`tickets:${ticketStatus}`, () => {
    let b = supabase.from("support_tickets").select("id,created_at,subject,message,status,admin_reply,trip_id,order_id,profiles(full_name,phone)").order("created_at", { ascending: false }).limit(100);
    if (ticketStatus) b = b.eq("status", ticketStatus);
    return b;
  });
  const sosRows = (sos.data ?? []) as unknown as Sos[];
  const ticketRows = (tickets.data ?? []) as unknown as Ticket[];
  return (
    <>
      <Section title="🚨 SOS alerts" actions={<>Status: <Filter value={sosStatus} options={["open", "resolved"]} onChange={setSosStatus} /><button className="btn" onClick={sos.reload}>Refresh</button></>}>
        <Loading loading={sos.loading} error={sos.error} empty={!sosRows.length} />
        {sosRows.length ? (
          <table>
            <thead><tr><th>When</th><th>User</th><th>Trip</th><th>Where</th><th>Note</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {sosRows.map((s) => (
                <tr key={s.id}>
                  <td>{when(s.created_at)}</td>
                  <td>{s.profiles?.full_name ?? "—"}<br /><a href={`tel:+${(s.profiles?.phone ?? "").replace(/\D/g, "")}`}>{s.profiles?.phone}</a></td>
                  <td>{s.trip_id ? <a href={`#/trips`}>{short(s.trip_id)}</a> : "—"}</td>
                  <td>{s.lat != null && s.lng != null ? <a href={osm(s.lat, s.lng)} target="_blank" rel="noopener">map</a> : "—"}</td>
                  <td>{s.note ?? ""}</td>
                  <td><Badge value={s.status} /></td>
                  <td>{s.status === "open" ? <Action label="Mark resolved" kind="primary" confirm="Confirm the user is safe / the case is handled?" run={async () => {
                    const { data } = await supabase.auth.getUser();
                    await must(supabase.from("sos_events").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: data.user?.id }).eq("id", s.id)); sos.reload();
                  }} /> : when(s.resolved_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p className="muted">Call the user first. Emergency services in Cameroon: Police 117 · Fire 118 · SAMU 119.</p>
      </Section>
      <Section title="Support tickets" actions={<>Status: <Filter value={ticketStatus} options={["open", "in_progress", "closed"]} onChange={setTicketStatus} /><button className="btn" onClick={tickets.reload}>Refresh</button></>}>
        <Loading loading={tickets.loading} error={tickets.error} empty={!ticketRows.length} />
        {ticketRows.length ? (
          <table>
            <thead><tr><th>When</th><th>User</th><th>Message</th><th>Reply</th><th>Status</th><th></th></tr></thead>
            <tbody>{ticketRows.map((t) => <TicketRow key={`${t.id}-${t.admin_reply}-${t.status}`} t={t} onSaved={tickets.reload} />)}</tbody>
          </table>
        ) : null}
      </Section>
    </>
  );
}
