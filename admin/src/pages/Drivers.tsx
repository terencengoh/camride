import { Fragment, useState } from "react";
import { supabase } from "../lib/supabase";
import { when } from "../lib/format";
import { useQuery } from "../lib/useQuery";
import { Action, Badge, Filter, Loading, Section } from "../components/ui";
import { must } from "../lib/must";

interface Doc { id: string; doc_type: string; storage_path: string; status: string; reviewer_note: string | null; created_at: string }
interface DriverRow {
  id: string; vehicle_type: string; is_courier: boolean; status: string; documents_verified: boolean; rating_avg: number; rating_count: number;
  created_at: string;
  profiles: { full_name: string | null; phone: string | null; suspended: boolean } | null;
  vehicles: { id: string; make_model: string; plate: string; color: string | null; verified: boolean } | null;
}

function Documents({ driverId, onChange }: { driverId: string; onChange: () => void }) {
  const q = useQuery(`docs:${driverId}`, () =>
    supabase.from("driver_documents").select("*").eq("driver_id", driverId).order("created_at", { ascending: false }));
  const docs = (q.data ?? []) as Doc[];
  const open = async (path: string) => {
    const { data, error } = await supabase.storage.from("driver-documents").createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const review = async (id: string, approve: boolean) => {
    const note = approve ? null : window.prompt("Reason shown to the driver (e.g. photo blurry, document expired)");
    if (!approve && !note) return;
    await must(supabase.rpc("admin_review_document", { p_document_id: id, p_approve: approve, p_note: note }));
    q.reload(); onChange();
  };
  return (
    <div>
      <Loading loading={q.loading} error={q.error} empty={!docs.length} />
      {docs.map((d) => (
        <div className="doc row" key={d.id}>
          <b>{d.doc_type}</b> <Badge value={d.status} /> <span className="muted">{when(d.created_at)}</span>
          {d.reviewer_note ? <span className="muted">“{d.reviewer_note}”</span> : null}
          <Action label="View" run={() => open(d.storage_path)} />
          {d.status === "pending" ? (
            <>
              <Action label="Approve" kind="primary" run={() => review(d.id, true)} />
              <Action label="Reject" kind="danger" run={() => review(d.id, false)} />
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function Drivers() {
  const [verified, setVerified] = useState("no");
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery(`drivers:${verified}`, () => {
    let b = supabase.from("drivers")
      .select("id,vehicle_type,is_courier,status,documents_verified,rating_avg,rating_count,created_at,profiles(full_name,phone,suspended),vehicles(id,make_model,plate,color,verified)")
      .order("created_at", { ascending: false }).limit(200);
    if (verified) b = b.eq("documents_verified", verified === "yes");
    return b;
  });
  const rows = (q.data ?? []) as unknown as DriverRow[];
  return (
    <Section title="Drivers & couriers" actions={<>Verified: <Filter value={verified} options={["no", "yes"]} onChange={setVerified} /></>}>
      <Loading loading={q.loading} error={q.error} empty={!rows.length} />
      {rows.length ? (
        <table>
          <thead><tr><th>Driver</th><th>Type</th><th>Vehicle</th><th>Status</th><th>Rating</th><th>Verified</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td>{r.profiles?.full_name ?? "—"}<br /><span className="muted">{r.profiles?.phone}</span>{r.profiles?.suspended ? <> <Badge value="suspended" /></> : null}</td>
                  <td>{r.vehicle_type}{r.is_courier ? " · courier" : ""}</td>
                  <td>{r.vehicles ? <>{r.vehicles.make_model} {r.vehicles.color ?? ""}<br /><b>{r.vehicles.plate}</b> <Badge value={r.vehicles.verified} /></> : "—"}</td>
                  <td><Badge value={r.status} /></td>
                  <td>{Number(r.rating_avg).toFixed(2)} ({r.rating_count})</td>
                  <td><Badge value={r.documents_verified} /></td>
                  <td className="row">
                    <button className="btn" onClick={() => setOpenId(openId === r.id ? null : r.id)}>{openId === r.id ? "Hide docs" : "Documents"}</button>
                    {r.vehicles && !r.vehicles.verified ? (
                      <Action label="Verify vehicle" run={async () => { await must(supabase.from("vehicles").update({ verified: true }).eq("id", r.vehicles!.id)); q.reload(); }} />
                    ) : null}
                    {r.documents_verified
                      ? <Action label="Unverify" kind="danger" confirm="Remove verification? The driver cannot go online." run={async () => { await must(supabase.rpc("admin_set_driver_verified", { p_driver: r.id, p_verified: false })); q.reload(); }} />
                      : <Action label="Verify driver" kind="primary" run={async () => { await must(supabase.rpc("admin_set_driver_verified", { p_driver: r.id, p_verified: true })); q.reload(); }} />}
                  </td>
                </tr>
                {openId === r.id ? <tr><td colSpan={7}><Documents driverId={r.id} onChange={q.reload} /></td></tr> : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="muted">“Verify driver” requires every required document to be approved (enforced in the database).</p>
    </Section>
  );
}
