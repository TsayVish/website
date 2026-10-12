import type { Metadata } from "next";
import Link from "next/link";
import { DeleteProject } from "@/components/studio/DeleteProject";
import { ProjectArt, projectBackground } from "@/components/studio/ProjectArt";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { HubTabs } from "@/components/studio/hub/HubNav";
import { IconSpark } from "@/components/studio/icons";
import { kindLabel } from "@/lib/content";
import { characterSubtitle } from "@/lib/existing";
import { cleanQuery } from "@/lib/members";
import { MoreLink } from "@/components/studio/MoreLink";
import { moreHref, readLimit, splitPage } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_COLUMNS, type Project } from "@/lib/types";

export const metadata: Metadata = { title: "Characters" };

export default async function CharactersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; ws?: string; limit?: string }> }) {
  const sp = await searchParams;
  const limit = readLimit(sp.limit, 50);
  const tab = sp.tab === "created" || sp.tab === "uploaded" ? sp.tab : "all";
  const q = cleanQuery(sp.q).toLowerCase();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: wsRows } = await supabase.from("workspaces").select("id, name").order("name");
  const workspaces = (wsRows ?? []) as { id: string; name: string }[];
  const ws = sp.ws === "mine" ? "mine" : workspaces.some((w) => w.id === sp.ws) ? (sp.ws as string) : null;

  // Filters run in the database, so hundreds of characters stay fast.
  const base = () => {
    let query = supabase.from("projects").select(PROJECT_COLUMNS, { count: "exact" }).eq("type", "original");
    if (ws === "mine") query = query.is("workspace_id", null).eq("owner_id", user!.id);
    else if (ws) query = query.eq("workspace_id", ws);
    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    return query;
  };
  let listQuery = base();
  if (tab === "uploaded") listQuery = listQuery.eq("details->>origin", "existing");
  if (tab === "created") listQuery = listQuery.or("details->>origin.is.null,details->>origin.neq.existing");
  const head = { count: "exact" as const, head: true };
  const [{ data, count: shownCount }, { data: listingRows }, allRes, upRes] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).range(0, limit),
    supabase.from("listings").select("id, project_id, status").eq("owner_id", user!.id),
    (() => { let c = supabase.from("projects").select("id", head).eq("type", "original"); if (ws === "mine") c = c.is("workspace_id", null).eq("owner_id", user!.id); else if (ws) c = c.eq("workspace_id", ws); return c; })(),
    (() => { let c = supabase.from("projects").select("id", head).eq("type", "original").eq("details->>origin", "existing"); if (ws === "mine") c = c.is("workspace_id", null).eq("owner_id", user!.id); else if (ws) c = c.eq("workspace_id", ws); return c; })(),
  ]);
  const page = splitPage(data as unknown as Project[], limit);
  const list = page.items;
  const listings = (listingRows ?? []) as { id: string; project_id: string | null; status: string }[];
  const listingFor = new Map(listings.filter((l) => l.project_id).map((l) => [l.project_id as string, l]));
  const total = allRes.count ?? 0;
  const uploadedCount = upRes.count ?? 0;
  const wsName = new Map(workspaces.map((w) => [w.id, w.name]));
  const keep = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (tab !== "all") p.set("tab", tab);
    if (ws) p.set("ws", ws);
    if (q) p.set("q", q);
    for (const [k, v] of Object.entries(extra)) { if (v) p.set(k, v); else p.delete(k); }
    const str = p.toString();
    return `/studio/hub/characters${str ? `?${str}` : ""}`;
  };
  const href = (t: string) => keep({ tab: t === "all" ? null : t });

  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div><h1>Characters</h1><p className="st-sub">Everything you’ve created or brought to tsayvish.</p></div>
        <div className="st-actions">
          <Link className="btn ghost" href="/studio/hub/characters/import">Import CSV</Link>
          <Link className="btn ghost" href="/studio/hub/characters/new?mode=upload">Upload existing</Link>
          <Link className="btn" href={`/studio/hub/characters/new${ws && ws !== "mine" ? `?ws=${ws}` : ""}`}>Create new</Link>
        </div>
      </div>
      <HubTabs current={tab} tabs={[
        { key: "all", label: "All", href: href("all"), count: total },
        { key: "created", label: "Created here", href: href("created"), count: total - uploadedCount },
        { key: "uploaded", label: "Uploaded", href: href("uploaded"), count: uploadedCount },
      ]} />
      {(total > 0 || q || workspaces.length > 0) && (
        <form className="hub-toolbar" action="/studio/hub/characters" role="search">
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          {workspaces.length > 0 && (
            <>
              <label htmlFor="ch-ws" className="visually-hidden">Workspace</label>
              <select id="ch-ws" name="ws" className="st-input ch-ws" defaultValue={ws ?? ""}>
                <option value="">All workspaces</option>
                <option value="mine">Just mine</option>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </>
          )}
          <label htmlFor="ch-q" className="visually-hidden">Search characters</label>
          <input className="st-input hub-search" id="ch-q" name="q" type="search" placeholder="Search characters" defaultValue={q} />
        </form>
      )}

      {list.length === 0 ? (
        <EmptyState
          icon={<IconSpark />}
          title={q ? "No characters match" : tab === "uploaded" ? "No uploaded characters" : "No characters yet"}
          action={!q ? (
            <span className="st-actions">
              <Link className="btn" href="/studio/hub/characters/new">Create new</Link>
              <Link className="btn ghost" href="/studio/hub/characters/import">Import CSV</Link>
          <Link className="btn ghost" href="/studio/hub/characters/new?mode=upload">Upload existing</Link>
            </span>
          ) : undefined}
        >
          {q ? "Try a different name." : "Design a character from scratch, or upload one you already run to manage its trademarks, storefront and deals here."}
        </EmptyState>
      ) : (
        <>
        <p className="st-help">Showing {list.length} of {shownCount ?? list.length}</p>
        <div className="st-table">
          <div className="st-row st-row-head hub-char-row" aria-hidden="true">
            <span>Character</span><span>Services</span><span>Marketplace</span><span>Workspace</span><span />
          </div>
          {list.map((p) => {
            const services = p.project_services ?? [];
            const on = services.filter((s) => s.status !== "off").length;
            const active = services.filter((s) => s.status === "active").length;
            const listing = listingFor.get(p.id);
            return (
              <div key={p.id} className="st-row hub-char-row">
                <Link href={`/studio/p/${p.id}`} className="st-proj">
                  <span className="st-thumb" style={{ background: projectBackground(p) }}><ProjectArt project={p} /></span>
                  <span className="st-proj-text">
                    <b>{p.name}</b>
                    <small>{characterSubtitle(p, kindLabel)}</small>
                  </span>
                </Link>
                <span className="st-cell">{on ? `${on} on${active ? ` · ${active} active` : ""}` : "None yet"}</span>
                <span className="st-cell">
                  {listing ? (
                    <Link href={`/studio/marketplace/${listing.id}`}>{listing.status === "published" ? "Listed" : "Draft listing"}</Link>
                  ) : (
                    <span className="st-muted">Not listed</span>
                  )}
                </span>
                <span className="st-cell">{p.workspace_id ? wsName.get(p.workspace_id) ?? "Shared" : "Just you"}</span>
                <span className="hub-row-actions">
                  <Link className="btn ghost st-small" href={`/studio/p/${p.id}/ai`}>AI Studio</Link>
                  <Link className="btn ghost st-small" href={`/studio/p/${p.id}?tab=character`}>Edit</Link>
                  <Link className="btn ghost st-small" href={`/studio/p/${p.id}`}>Manage</Link>
                  {p.owner_id === user!.id && <DeleteProject projectId={p.id} label="Delete" name={p.name} compact after={null} message="Delete for good?" />}
                </span>
              </div>
            );
          })}
        </div>
        {page.hasMore && <MoreLink href={moreHref("/studio/hub/characters", { tab: tab === "all" ? null : tab, ws, q: q || null }, limit, 50)} />}
        </>
      )}
    </div>
  );
}
