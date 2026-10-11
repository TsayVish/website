import type { Metadata } from "next";
import Link from "next/link";
import { BanToggle, BillingToggle, CreditsAdjust, StudioLimit } from "@/components/studio/admin/AdminActions";
import { fmtDate } from "@/lib/hub";
import { cleanQuery } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Members" };

type U = { id: string; email: string; full_name: string | null; created_at: string; banned: boolean; staff_role: string | null };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_find_users", { q });
  let rows = (data ?? []) as U[];
  if (sp.filter === "banned") rows = rows.filter((r) => r.banned);
  const { data: ex } = await supabase.from("billing_exempt").select("user_id");
  const free = new Set(((ex ?? []) as { user_id: string }[]).map((e) => e.user_id));
  if (sp.filter === "free") rows = rows.filter((r) => free.has(r.id));
  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Members</h1><p className="st-sub">Find anyone by name or email. Banning hides their listings and stops them posting, listing, offering or messaging.</p></div></div>
      <form className="hub-toolbar" action="/studio/admin/users" role="search">
        <label htmlFor="adm-q" className="visually-hidden">Search members</label>
        <input id="adm-q" name="q" className="st-input hub-search" type="search" placeholder="Name or email" defaultValue={q} />
        <Link className="chip" href={sp.filter === "banned" ? "/studio/admin/users" : "/studio/admin/users?filter=banned"} aria-current={sp.filter === "banned" ? "page" : undefined}>Banned only</Link>
        <Link className="chip" href={sp.filter === "free" ? "/studio/admin/users" : "/studio/admin/users?filter=free"} aria-current={sp.filter === "free" ? "page" : undefined}>Billing off</Link>
      </form>
      {error && <p className="form-error">{error.message}</p>}
      <div className="st-table">
        <div className="st-row st-row-head adm-user-row" aria-hidden="true"><span>Member</span><span>Joined</span><span>Status</span><span /></div>
        {rows.map((u) => (
          <div key={u.id} className="st-row adm-user-row">
            <span className="st-proj-text"><Link href={`/studio/u/${u.id}`}><b>{u.full_name || "No name"}</b></Link><small>{u.email}</small></span>
            <span className="st-cell">{fmtDate(u.created_at)}</span>
            <span>
              {u.staff_role ? <span className="st-status active">Staff · {u.staff_role}</span> : u.banned ? <span className="st-status off">Banned</span> : <span className="st-status">Active</span>}
              {free.has(u.id) && <span className="st-status requested">Billing off</span>}
            </span>
            <span className="hub-row-actions">
              <BillingToggle userId={u.id} exempt={free.has(u.id)} />
              <CreditsAdjust userId={u.id} />
              <StudioLimit userId={u.id} />
              {!u.staff_role && <BanToggle userId={u.id} banned={u.banned} />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
