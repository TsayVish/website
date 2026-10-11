import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostServiceUpdate, ServiceTicketForm } from "@/components/studio/admin/AdminActions";
import { Avatar } from "@/components/studio/Avatar";
import type { StaffMember } from "@/lib/admin";
import { fmtDate } from "@/lib/hub";
import { SERVICE_DEFS } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import type { Details } from "@/lib/types";

export const metadata: Metadata = { title: "Service request" };

export default async function AdminServiceDetail({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ service?: string }> }) {
  const [{ project: projectId }, { service = "" }] = await Promise.all([params, searchParams]);
  const def = SERVICE_DEFS.find((d) => d.name === service);
  if (!def) notFound();
  const supabase = await createClient();
  const [{ data: proj }, { data: svc }, { data: ticket }, { data: updates }, { data: staffRows }] = await Promise.all([
    supabase.from("projects").select("id, name, owner_id, description, kind, created_at").eq("id", projectId).maybeSingle(),
    supabase.from("project_services").select("status, details, updated_at").eq("project_id", projectId).eq("service", service).maybeSingle(),
    supabase.from("service_tickets").select("assignee, due_on, internal_note").eq("project_id", projectId).eq("service", service).maybeSingle(),
    supabase.from("service_updates").select("id, body, author_id, created_at").eq("project_id", projectId).eq("service", service).order("created_at", { ascending: false }),
    supabase.rpc("admin_staff_list"),
  ]);
  if (!proj || !svc) notFound();
  const p = proj as { id: string; name: string; owner_id: string; description: string | null; kind: string | null; created_at: string };
  const s = svc as { status: string; details: Details; updated_at: string };
  const t = ticket as { assignee: string | null; due_on: string | null; internal_note: string | null } | null;
  const staff = (staffRows ?? []) as StaffMember[];
  const { data: owner } = await supabase.from("profiles").select("id, full_name, avatar_url").eq("id", p.owner_id).maybeSingle();
  const o = owner as { id: string; full_name: string | null; avatar_url: string | null } | null;
  const ups = (updates ?? []) as { id: string; body: string; author_id: string | null; created_at: string }[];
  const staffName = new Map(staff.map((x) => [x.user_id, x.full_name || x.email]));
  const answer = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v ?? "")).trim();

  return (
    <div className="st-stack">
      <div className="st-crumbs"><Link href="/studio/admin/services">Service requests</Link><span>/</span><span>{p.name} · {service}</span></div>
      <div className="st-pagehead">
        <div>
          <h1>{service} for {p.name}</h1>
          <p className="st-sub">Requested by {o?.full_name || "a member"} · last change {fmtDate(s.updated_at)} · <span className={`st-status ${s.status}`}>{s.status}</span></p>
        </div>
        <div className="st-actions"><Link className="btn ghost st-small" href={`/studio/p/${p.id}?tab=${def.slug}`}>Open as creator sees it</Link></div>
      </div>
      <div className="st-two">
        <div className="st-stack">
          <section className="panel">
            <b className="st-panel-title">What they asked for</b>
            <dl className="st-dl adm-answers">
              {def.fields.map((f) => (
                <div key={f.key} className="adm-answer"><dt>{f.label}</dt><dd>{answer(s.details?.[f.key]) || <span className="st-muted">—</span>}</dd></div>
              ))}
            </dl>
          </section>
          <section className="panel">
            <b className="st-panel-title">Updates the creator sees</b>
            <PostServiceUpdate projectId={p.id} service={service} />
            {ups.length === 0 ? <p className="st-muted">No updates posted yet.</p> : (
              <ul className="adm-updates">
                {ups.map((u) => <li key={u.id}><p>{u.body}</p><small className="st-muted">{staffName.get(u.author_id ?? "") ?? "Staff"} · {fmtDate(u.created_at)}</small></li>)}
              </ul>
            )}
          </section>
        </div>
        <div className="st-stack">
          <ServiceTicketForm projectId={p.id} service={service} status={s.status} assignee={t?.assignee ?? null} due={t?.due_on ?? null} note={t?.internal_note ?? null} staff={staff} />
          <section className="panel">
            <b className="st-panel-title">Creator</b>
            <div className="dl-party">
              <Avatar url={o?.avatar_url} name={o?.full_name || "Member"} size={32} />
              <span><b>{o?.full_name || "Member"}</b><small>Character created {fmtDate(p.created_at)}</small></span>
            </div>
            {p.description && <p className="st-muted">{p.description}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
