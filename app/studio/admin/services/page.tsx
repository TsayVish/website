import type { Metadata } from "next";
import Link from "next/link";
import { MoreLink } from "@/components/studio/MoreLink";
import { ageLabel, isOverdue, type StaffMember } from "@/lib/admin";
import { fmtDate } from "@/lib/hub";
import { moreHref, readLimit, splitPage } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Service requests" };

type Row = { project_id: string; service: string; status: string; updated_at: string; projects: { name: string; owner_id: string } | null };
type Ticket = { project_id: string; service: string; assignee: string | null; due_on: string | null };

export default async function AdminServices({ searchParams }: { searchParams: Promise<{ status?: string; assignee?: string; due?: string; limit?: string }> }) {
  const sp = await searchParams;
  const status = sp.status === "active" || sp.status === "all" ? sp.status : "requested";
  const limit = readLimit(sp.limit, 50);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let q = supabase.from("project_services").select("project_id, service, status, updated_at, projects(name, owner_id)").order("updated_at", { ascending: true });
  if (status !== "all") q = q.eq("status", status);
  const [{ data }, { data: tk }, { data: staffRows }] = await Promise.all([
    q.range(0, 500),
    supabase.from("service_tickets").select("project_id, service, assignee, due_on"),
    supabase.rpc("admin_staff_list"),
  ]);
  const tickets = new Map(((tk ?? []) as Ticket[]).map((t) => [`${t.project_id}:${t.service}`, t]));
  const staff = (staffRows ?? []) as StaffMember[];
  const staffName = new Map(staff.map((s) => [s.user_id, s.full_name || s.email]));
  let rows = ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, ticket: tickets.get(`${r.project_id}:${r.service}`) }));
  if (sp.assignee === "me") rows = rows.filter((r) => r.ticket?.assignee === user!.id);
  if (sp.assignee === "none") rows = rows.filter((r) => !r.ticket?.assignee);
  if (sp.due === "overdue") rows = rows.filter((r) => isOverdue(r.ticket?.due_on ?? null));
  const page = splitPage(rows, limit);
  const ownerIds = [...new Set(page.items.map((r) => r.projects?.owner_id).filter(Boolean) as string[])];
  const { data: owners } = ownerIds.length ? await supabase.from("profiles").select("id, full_name").in("id", ownerIds) : { data: [] };
  const ownerName = new Map(((owners ?? []) as { id: string; full_name: string | null }[]).map((o) => [o.id, o.full_name]));
  const link = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { status: status === "requested" ? null : status, assignee: sp.assignee ?? null, due: sp.due ?? null, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const str = p.toString();
    return `/studio/admin/services${str ? `?${str}` : ""}`;
  };

  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Service requests</h1><p className="st-sub">Oldest first. Open one to assign it, set a due date, post updates the creator sees, or mark it active.</p></div></div>
      <div className="hub-toolbar">
        <nav className="st-tabs" aria-label="Status">
          {(["requested", "active", "all"] as const).map((s) => (
            <Link key={s} href={link({ status: s === "requested" ? null : s })} aria-current={status === s ? "page" : undefined}>{s === "requested" ? "Waiting" : s === "active" ? "Active" : "All"}</Link>
          ))}
        </nav>
        <nav className="st-tabs" aria-label="Assignee">
          <Link href={link({ assignee: null, due: null })} aria-current={!sp.assignee && !sp.due ? "page" : undefined}>Everyone</Link>
          <Link href={link({ assignee: "me", due: null })} aria-current={sp.assignee === "me" ? "page" : undefined}>Mine</Link>
          <Link href={link({ assignee: "none", due: null })} aria-current={sp.assignee === "none" ? "page" : undefined}>Unassigned</Link>
          <Link href={link({ due: "overdue", assignee: null })} aria-current={sp.due === "overdue" ? "page" : undefined}>Overdue</Link>
        </nav>
      </div>
      {page.items.length === 0 ? (
        <div className="hub-empty"><h2>Nothing here</h2><p>No service requests match these filters.</p></div>
      ) : (
        <div className="st-table">
          <div className="st-row st-row-head adm-svc-row" aria-hidden="true"><span>Character · service</span><span>Creator</span><span>Assignee</span><span>Due</span><span>Waiting</span></div>
          {page.items.map((r) => (
            <Link key={`${r.project_id}:${r.service}`} href={`/studio/admin/services/${r.project_id}?service=${encodeURIComponent(r.service)}`} className="st-row adm-svc-row">
              <span className="st-proj-text"><b>{r.projects?.name ?? "Project"}</b><small>{r.service} · <span className={`st-status ${r.status}`}>{r.status}</span></small></span>
              <span className="st-cell">{ownerName.get(r.projects?.owner_id ?? "") || "Member"}</span>
              <span className="st-cell">{r.ticket?.assignee ? staffName.get(r.ticket.assignee) ?? "Staff" : <span className="st-muted">Unassigned</span>}</span>
              <span className={`st-cell ${isOverdue(r.ticket?.due_on ?? null) ? "adm-overdue" : ""}`}>{r.ticket?.due_on ? fmtDate(`${r.ticket.due_on}T12:00:00`) : "—"}</span>
              <span className="st-cell">{ageLabel(r.updated_at)}</span>
            </Link>
          ))}
        </div>
      )}
      {page.hasMore && <MoreLink href={moreHref("/studio/admin/services", { status: status === "requested" ? null : status, assignee: sp.assignee, due: sp.due }, limit, 50)} />}
    </div>
  );
}
