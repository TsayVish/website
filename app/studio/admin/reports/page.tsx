import type { Metadata } from "next";
import Link from "next/link";
import { ReportAdminActions } from "@/components/studio/admin/AdminActions";
import { HubTabs } from "@/components/studio/hub/HubNav";
import { fmtDate, reportHref, type ReportRow } from "@/lib/hub";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab = raw === "closed" ? "closed" : "open";
  const supabase = await createClient();
  let q = supabase.from("reports").select("id, target_type, target_id, target_label, target_owner, reporter_id, reason, details, status, created_at").order("created_at", { ascending: tab === "open" }).limit(200);
  q = tab === "open" ? q.eq("status", "open") : q.neq("status", "open");
  const { data } = await q;
  const rows = (data ?? []) as (ReportRow & { target_owner: string | null; reporter_id: string })[];
  const ids = [...new Set(rows.flatMap((r) => [r.target_owner, r.reporter_id]).filter(Boolean) as string[])];
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map(((ppl ?? []) as { id: string; full_name: string | null }[]).map((x) => [x.id, x.full_name]));
  // How many reports each owner has had, to spot repeat offenders.
  const ownerCounts = new Map<string, number>();
  rows.forEach((r) => r.target_owner && ownerCounts.set(r.target_owner, (ownerCounts.get(r.target_owner) ?? 0) + 1));
  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Reports</h1><p className="st-sub">Everything members have reported. Reporters stay anonymous to creators, but you can see them here.</p></div></div>
      <HubTabs current={tab} tabs={[{ key: "open", label: "Open", href: "/studio/admin/reports" }, { key: "closed", label: "Closed", href: "/studio/admin/reports?tab=closed" }]} />
      {rows.length === 0 ? <div className="hub-empty"><h2>No {tab} reports</h2><p>Nothing to review right now.</p></div> : (
        <ul className="adm-cards">
          {rows.map((r) => {
            const href = reportHref(r);
            return (
              <li key={r.id} className="panel adm-card">
                <div className="adm-card-head">
                  <b>{href ? <Link href={href}>{r.target_label || r.target_type}</Link> : r.target_label || r.target_type}</b>
                  <span className="st-muted">{r.target_type} by {names.get(r.target_owner ?? "") || "member"}{(ownerCounts.get(r.target_owner ?? "") ?? 0) > 1 ? ` (${ownerCounts.get(r.target_owner ?? "")} reports)` : ""} · reported by {names.get(r.reporter_id) || "member"} · {fmtDate(r.created_at)}</span>
                </div>
                <p><span className="st-status requested">{r.reason}</span>{r.details && <span className="of-note"> “{r.details}”</span>}</p>
                <ReportAdminActions reportId={r.id} status={r.status} targetType={r.target_type} targetId={r.target_id} ownerId={r.target_owner} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
