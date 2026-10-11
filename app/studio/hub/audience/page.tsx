import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/studio/Avatar";
import { MessageButton } from "@/components/studio/MessageButton";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { HubTabs } from "@/components/studio/hub/HubNav";
import { UnblockButton } from "@/components/studio/hub/SmallActions";
import { IconPeople } from "@/components/studio/icons";
import { fmtDate } from "@/lib/hub";
import { MEMBER_COLUMNS, cleanQuery, type Member } from "@/lib/members";
import { MoreLink } from "@/components/studio/MoreLink";
import { moreHref, readLimit, splitPage } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audience" };

export default async function AudiencePage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; new?: string; limit?: string }> }) {
  const sp = await searchParams;
  const limit = readLimit(sp.limit, 50);
  const tab = sp.tab === "blocked" ? "blocked" : "followers";
  const q = cleanQuery(sp.q).toLowerCase();
  const onlyNew = sp.new === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;

  const monthAgoIso = new Date(Date.now() - 30 * 864e5).toISOString();
  let followsQuery = supabase.from("follows").select("follower_id, created_at", { count: "exact" }).eq("creator_id", me).order("created_at", { ascending: false });
  if (onlyNew) followsQuery = followsQuery.gte("created_at", monthAgoIso);
  const [{ data: follows, count: followCount }, { data: blocks }, { count: allFollowers }] = await Promise.all([
    followsQuery.range(0, limit),
    supabase.from("blocks").select("blocked_id, created_at").eq("blocker_id", me).order("created_at", { ascending: false }).limit(500),
    supabase.from("follows").select("creator_id", { count: "exact", head: true }).eq("creator_id", me),
  ]);
  const followPage = splitPage(follows as { follower_id: string; created_at: string }[], limit);
  const f = followPage.items;
  const b = (blocks ?? []) as { blocked_id: string; created_at: string }[];
  const ids = tab === "followers" ? f.map((x) => x.follower_id) : b.map((x) => x.blocked_id);
  const { data: profs } = ids.length ? await supabase.from("profiles").select(MEMBER_COLUMNS).in("id", ids) : { data: [] };
  const byId = new Map(((profs ?? []) as unknown as Member[]).map((p) => [p.id, p]));

  const monthAgo = Date.now() - 30 * 864e5;
  const rows = (tab === "followers" ? f.map((x) => ({ id: x.follower_id, at: x.created_at })) : b.map((x) => ({ id: x.blocked_id, at: x.created_at })))
    .map((r) => ({ ...r, member: byId.get(r.id) }))
    .filter((r) => !onlyNew || new Date(r.at).getTime() >= monthAgo)
    .filter((r) => !q || `${r.member?.full_name ?? ""} ${r.member?.location ?? ""}`.toLowerCase().includes(q));
  const base = `/studio/hub/audience${tab === "blocked" ? "?tab=blocked" : ""}`;
  const withParam = (k: string, v: string | null) => {
    const p = new URLSearchParams();
    if (tab === "blocked") p.set("tab", "blocked");
    if (q && k !== "q") p.set("q", q);
    if (onlyNew && k !== "new") p.set("new", "1");
    if (v) p.set(k, v);
    const s = p.toString();
    return `/studio/hub/audience${s ? `?${s}` : ""}`;
  };

  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Audience</h1><p className="st-sub">The people following your work.</p></div></div>
      <HubTabs current={tab} tabs={[
        { key: "followers", label: "Followers", href: "/studio/hub/audience", count: allFollowers ?? f.length },
        { key: "blocked", label: "Blocked", href: "/studio/hub/audience?tab=blocked", count: b.length },
      ]} />
      <div className="hub-toolbar">
        <form action="/studio/hub/audience" role="search">
          {tab === "blocked" && <input type="hidden" name="tab" value="blocked" />}
          {onlyNew && <input type="hidden" name="new" value="1" />}
          <label htmlFor="aud-q" className="visually-hidden">Search by name</label>
          <input className="st-input hub-search" id="aud-q" name="q" type="search" placeholder="Search by name or location" defaultValue={q} />
        </form>
        {tab === "followers" && (
          <Link className="chip" aria-current={onlyNew ? "page" : undefined} href={withParam("new", onlyNew ? null : "1")}>New this month</Link>
        )}
        {(q || onlyNew) && <Link className="hub-clear" href={base}>Clear all</Link>}
      </div>
      <p className="st-help">Showing {rows.length} of {tab === "followers" ? (followCount ?? f.length) : b.length}</p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconPeople />}
          title={tab === "followers" ? (q || onlyNew ? "No followers match" : "No followers yet") : "You haven’t blocked anyone"}
          action={tab === "followers" && !q && !onlyNew ? <Link className="btn" href={`/studio/u/${me}`}>Share your profile</Link> : undefined}
        >
          {tab === "followers"
            ? "When people follow you, they’ll appear here. Share your profile to start growing your community."
            : "People you block can’t message you. You can block someone from their profile or from a chat."}
        </EmptyState>
      ) : (
        <div className="st-table">
          <div className="st-row st-row-head hub-aud-row" aria-hidden="true">
            <span>Name</span><span>Location</span><span>{tab === "followers" ? "Followed" : "Blocked"}</span><span />
          </div>
          {rows.map((r) => {
            const name = r.member?.full_name || "Private member";
            return (
              <div key={r.id} className="st-row hub-aud-row">
                <span className="st-proj">
                  <Avatar url={r.member?.avatar_url} name={name} size={36} />
                  <span className="st-proj-text">
                    {r.member ? <Link href={`/studio/u/${r.id}`}><b>{name}</b></Link> : <b>{name}</b>}
                    {r.member?.bio && <small>{r.member.bio}</small>}
                  </span>
                </span>
                <span className="st-cell">{r.member?.location || "—"}</span>
                <span className="st-cell">{fmtDate(r.at)}</span>
                <span className="hub-row-actions">
                  {tab === "followers" ? <MessageButton userId={r.id} className="btn ghost st-small" /> : <UnblockButton userId={r.id} />}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {tab === "followers" && followPage.hasMore && <MoreLink href={moreHref("/studio/hub/audience", { q: q || null, new: onlyNew ? "1" : null }, limit, 50)} />}
    </div>
  );
}