import Link from "next/link";
import { fmtDate } from "@/lib/hub";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOverview() {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const today = new Date().toISOString().slice(0, 10);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [requested, active, mine, overdue, reports, partnerships, bans, members, listings, recent] = await Promise.all([
    supabase.from("project_services").select("project_id", head).eq("status", "requested"),
    supabase.from("project_services").select("project_id", head).eq("status", "active"),
    supabase.from("service_tickets").select("project_id", head).eq("assignee", user!.id),
    supabase.from("service_tickets").select("project_id", head).lt("due_on", today),
    supabase.from("reports").select("id", head).eq("status", "open"),
    supabase.from("projects").select("id", head).eq("type", "partnership").eq("status", "submitted"),
    supabase.from("bans").select("user_id", head),
    supabase.from("profiles").select("id", head),
    supabase.from("listings").select("id", head).eq("status", "published"),
    supabase.from("admin_actions").select("id, action, target_type, target_id, created_at").order("created_at", { ascending: false }).limit(8),
  ]);
  const tiles = [
    { label: "Service requests waiting", value: requested.count ?? 0, href: "/studio/admin/services" },
    { label: "Assigned to you", value: mine.count ?? 0, href: "/studio/admin/services?assignee=me" },
    { label: "Overdue", value: overdue.count ?? 0, href: "/studio/admin/services?due=overdue" },
    { label: "Open reports", value: reports.count ?? 0, href: "/studio/admin/reports" },
    { label: "New partnership requests", value: partnerships.count ?? 0, href: "/studio/admin/partnerships" },
    { label: "Active services", value: active.count ?? 0, href: "/studio/admin/services?status=active" },
    { label: "Members", value: members.count ?? 0, href: "/studio/admin/users" },
    { label: "Live listings", value: listings.count ?? 0, href: "/studio/marketplace" },
    { label: "Banned", value: bans.count ?? 0, href: "/studio/admin/users?filter=banned" },
  ];
  const actions = (recent.data ?? []) as { id: string; action: string; target_type: string; target_id: string; created_at: string }[];
  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Admin</h1><p className="st-sub">Run the platform: services, partnerships, reports and members.</p></div></div>
      <div className="adm-tiles">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="adm-tile"><span>{t.label}</span><b>{t.value}</b></Link>
        ))}
      </div>
      <section className="st-stack">
        <div className="dc-head"><h2>Recent staff actions</h2><Link className="dc-more" href="/studio/admin/audit">Full log</Link></div>
        {actions.length === 0 ? <p className="st-muted">Nothing yet.</p> : (
          <ul className="adm-log">
            {actions.map((a) => <li key={a.id}><b>{a.action.replace(/_/g, " ")}</b> · {a.target_type} <code>{a.target_id.slice(0, 8)}</code> · {fmtDate(a.created_at)}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
