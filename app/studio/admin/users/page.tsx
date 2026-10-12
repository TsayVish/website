import type { Metadata } from "next";
import Link from "next/link";
import { MemberRow, type Member } from "@/components/studio/admin/MemberRow";
import { fmtDate } from "@/lib/hub";
import { cleanQuery } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Members" };

type U = { id: string; email: string; full_name: string | null; created_at: string; banned: boolean; staff_role: string | null };

const FILTERS = [
  { key: "", label: "All" },
  { key: "staff", label: "Staff" },
  { key: "free", label: "Billing off" },
  { key: "banned", label: "Banned" },
];

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const filter = FILTERS.some((f) => f.key === sp.filter) ? sp.filter ?? "" : "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("admin_find_users", { q });
  const all = (data ?? []) as U[];
  const ids = all.map((u) => u.id);
  const [{ data: ex }, { data: ledger }, { data: caps }] = await Promise.all([
    supabase.from("billing_exempt").select("user_id"),
    ids.length ? supabase.from("credit_ledger").select("user_id, amount_cents").in("user_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("studio_limits").select("user_id, monthly_cents").in("user_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const free = new Set(((ex ?? []) as { user_id: string }[]).map((e) => e.user_id));
  const balance = new Map<string, number>();
  for (const r of (ledger ?? []) as { user_id: string; amount_cents: number }[]) balance.set(r.user_id, (balance.get(r.user_id) ?? 0) + r.amount_cents);
  const capOf = new Map(((caps ?? []) as { user_id: string; monthly_cents: number }[]).map((c) => [c.user_id, c.monthly_cents]));

  const rows = all.filter((u) =>
    filter === "staff" ? !!u.staff_role : filter === "free" ? free.has(u.id) : filter === "banned" ? u.banned : true);
  const href = (key: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (key) p.set("filter", key);
    const s = p.toString();
    return `/studio/admin/users${s ? `?${s}` : ""}`;
  };
  const members: Member[] = rows.map((u) => ({
    id: u.id, email: u.email, full_name: u.full_name, joined: fmtDate(u.created_at), banned: u.banned, staff_role: u.staff_role,
    free: free.has(u.id), balance: balance.get(u.id) ?? 0, cap: capOf.get(u.id) ?? null,
  }));

  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div>
          <h1>Members</h1>
          <p className="st-sub">Find anyone by name or email. Switch AI Studio billing off for people who shouldn’t pay, add credits, set spend caps or ban accounts.</p>
        </div>
      </div>

      <div className="adm-m-toolbar">
        <form action="/studio/admin/users" role="search">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <label htmlFor="adm-q" className="visually-hidden">Search members</label>
          <input id="adm-q" name="q" className="st-input hub-search" type="search" placeholder="Name or email" defaultValue={q} />
        </form>
        <nav className="st-tabs" aria-label="Filter members">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href(f.key)} aria-current={filter === f.key ? "page" : undefined}>
              {f.label}
              <span className="st-count">
                {f.key === "" ? all.length : all.filter((u) => (f.key === "staff" ? !!u.staff_role : f.key === "free" ? free.has(u.id) : u.banned)).length}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {error && <p className="form-error">{error.message}</p>}
      <div className="st-table adm-members">
        <div className="st-row st-row-head adm-member" aria-hidden="true">
          <span>Member</span><span>Joined</span><span>Role</span><span>AI billing</span><span>Credits</span><span />
        </div>
        {members.map((m) => <MemberRow key={m.id} m={m} isMe={m.id === user?.id} />)}
        {members.length === 0 && <div className="st-row"><span className="st-cell">No members match.</span></div>}
      </div>
      <p className="ai-hint">“Charged” members pay for AI Studio with credits. “Free” members don’t; what their jobs cost you still shows in Billing.</p>
    </div>
  );
}
