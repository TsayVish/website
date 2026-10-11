import type { Metadata } from "next";
import { MoreLink } from "@/components/studio/MoreLink";
import { moreHref, readLimit, splitPage } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

type A = { id: string; actor_id: string | null; action: string; target_type: string; target_id: string; details: Record<string, unknown>; created_at: string };

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ limit?: string }> }) {
  const { limit: raw } = await searchParams;
  const limit = readLimit(raw, 50);
  const supabase = await createClient();
  const { data } = await supabase.from("admin_actions").select("id, actor_id, action, target_type, target_id, details, created_at").order("created_at", { ascending: false }).range(0, limit);
  const page = splitPage(data as A[], limit);
  const ids = [...new Set(page.items.map((a) => a.actor_id).filter(Boolean) as string[])];
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map(((ppl ?? []) as { id: string; full_name: string | null }[]).map((x) => [x.id, x.full_name]));
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Audit log</h1><p className="st-sub">Every staff action, newest first. Nobody can edit or delete these entries from the app.</p></div></div>
      <div className="st-table">
        <div className="st-row st-row-head adm-audit-row" aria-hidden="true"><span>When</span><span>Who</span><span>Action</span><span>Details</span></div>
        {page.items.map((a) => (
          <div key={a.id} className="st-row adm-audit-row">
            <span className="st-cell">{when(a.created_at)}</span>
            <span className="st-cell">{names.get(a.actor_id ?? "") || "Staff"}</span>
            <span className="st-proj-text"><b>{a.action.replace(/_/g, " ")}</b><small>{a.target_type} · {a.target_id}</small></span>
            <span className="st-cell adm-json">{Object.entries(a.details ?? {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${String(v)}`).join(" · ") || "—"}</span>
          </div>
        ))}
      </div>
      {page.hasMore && <MoreLink href={moreHref("/studio/admin/audit", {}, limit, 50)} />}
    </div>
  );
}
