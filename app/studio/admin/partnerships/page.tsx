import type { Metadata } from "next";
import { PartnershipStatusForm } from "@/components/studio/admin/AdminActions";
import { fmtDate } from "@/lib/hub";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Partnerships" };

type P = { id: string; name: string; owner_id: string; company: string | null; interest: string | null; cast_members: string[]; message: string | null; status: string; created_at: string };

export default async function AdminPartnerships({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("projects").select("id, name, owner_id, company, interest, cast_members, message, status, created_at").eq("type", "partnership").order("created_at", { ascending: true }).limit(200);
  if (!all) q = q.in("status", ["submitted", "in_review"]);
  const { data } = await q;
  const rows = (data ?? []) as P[];
  const ids = [...new Set(rows.map((r) => r.owner_id))];
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map(((ppl ?? []) as { id: string; full_name: string | null }[]).map((x) => [x.id, x.full_name]));
  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div><h1>Partnership requests</h1><p className="st-sub">Brands asking to work with the tsayvish cast. Changing the status notifies them.</p></div>
        <div className="st-actions"><a className="btn ghost st-small" href={all ? "/studio/admin/partnerships" : "/studio/admin/partnerships?all=1"}>{all ? "Show open only" : "Show all"}</a></div>
      </div>
      {rows.length === 0 ? <div className="hub-empty"><h2>No open requests</h2><p>New partnership requests show up here.</p></div> : (
        <ul className="adm-cards">
          {rows.map((r) => (
            <li key={r.id} className="panel adm-card">
              <div className="adm-card-head">
                <b>{r.company || r.name}</b>
                <span className="st-muted">{r.interest} · {r.cast_members.join(", ")} · from {names.get(r.owner_id) || "a member"} · {fmtDate(r.created_at)}</span>
              </div>
              {r.message && <p className="of-note">“{r.message}”</p>}
              <PartnershipStatusForm projectId={r.id} status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
