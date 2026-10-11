import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { HubTabs } from "@/components/studio/hub/HubNav";
import { IconDoc } from "@/components/studio/icons";
import { POST_COLUMNS, fmtDate, type Post } from "@/lib/hub";
import { cleanQuery } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "drafts" ? "drafts" : "posts";
  const q = cleanQuery(sp.q);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase.from("posts").select(POST_COLUMNS).eq("owner_id", user!.id).order("updated_at", { ascending: false });
  const all = (data ?? []) as Post[];
  const published = all.filter((p) => p.status === "published");
  const drafts = all.filter((p) => p.status === "draft");
  const list = (tab === "drafts" ? drafts : published).filter((p) => !q || `${p.title} ${p.body}`.toLowerCase().includes(q.toLowerCase()));
  const href = (t: string) => `/studio/hub/library${t === "posts" ? "" : `?tab=${t}`}`;

  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div><h1>Library</h1><p className="st-sub">Everything you publish, in one place.</p></div>
        <div className="st-actions"><Link className="btn" href="/studio/hub/library/new">Create a post</Link></div>
      </div>
      <HubTabs current={tab} tabs={[
        { key: "posts", label: "Posts", href: href("posts"), count: published.length },
        { key: "drafts", label: "Drafts", href: href("drafts"), count: drafts.length },
      ]} />
      <form className="hub-toolbar" action="/studio/hub/library" role="search">
        {tab === "drafts" && <input type="hidden" name="tab" value="drafts" />}
        <label htmlFor="lib-q" className="visually-hidden">Search your posts</label>
        <input className="st-input hub-search" id="lib-q" name="q" type="search" placeholder="Search" defaultValue={q} />
      </form>

      {list.length === 0 ? (
        <EmptyState
          icon={<IconDoc />}
          title={q ? "Nothing matches that search" : tab === "drafts" ? "No drafts" : "No posts yet"}
          action={!q ? <Link className="btn" href="/studio/hub/library/new">Create a post</Link> : undefined}
        >
          {q ? "Try a different word." : "Use your library to keep track of everything you publish. Post an update today to kick things off."}
        </EmptyState>
      ) : (
        <div className="st-table">
          <div className="st-row st-row-head hub-post-row" aria-hidden="true">
            <span>Title</span><span>Visible to</span><span className="st-date">{tab === "drafts" ? "Last edited" : "Published"}</span>
          </div>
          {list.map((p) => (
            <Link key={p.id} href={`/studio/hub/library/${p.id}`} className="st-row hub-post-row">
              <span className="st-proj-text"><b>{p.title}</b><small>{p.body.slice(0, 120) || "No text yet"}</small></span>
              <span className="st-cell">{p.visibility === "public" ? "Everyone" : "Followers"}</span>
              <span className="st-cell st-date">{fmtDate(tab === "drafts" ? p.updated_at : p.published_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
