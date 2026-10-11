import type { Metadata } from "next";
import Link from "next/link";
import { ProjectArt, projectBackground } from "@/components/studio/ProjectArt";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { HubTabs } from "@/components/studio/hub/HubNav";
import { IconSpark } from "@/components/studio/icons";
import { kindLabel } from "@/lib/content";
import { characterSubtitle, isExisting } from "@/lib/existing";
import { fmtDate } from "@/lib/hub";
import { cleanQuery } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_COLUMNS, type Project } from "@/lib/types";

export const metadata: Metadata = { title: "Characters" };

export default async function CharactersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "created" || sp.tab === "uploaded" ? sp.tab : "all";
  const q = cleanQuery(sp.q).toLowerCase();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data }, { data: listingRows }] = await Promise.all([
    supabase.from("projects").select(PROJECT_COLUMNS).eq("type", "original").order("created_at", { ascending: false }),
    supabase.from("listings").select("id, project_id, status").eq("owner_id", user!.id),
  ]);
  const all = (data ?? []) as unknown as Project[];
  const listings = (listingRows ?? []) as { id: string; project_id: string | null; status: string }[];
  const listingFor = new Map(listings.filter((l) => l.project_id).map((l) => [l.project_id as string, l]));
  const uploaded = all.filter((p) => isExisting(p.details));
  const created = all.filter((p) => !isExisting(p.details));
  const list = (tab === "uploaded" ? uploaded : tab === "created" ? created : all).filter(
    (p) => !q || `${p.name} ${p.description ?? ""}`.toLowerCase().includes(q),
  );
  const href = (t: string) => `/studio/hub/characters${t === "all" ? "" : `?tab=${t}`}`;

  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div><h1>Characters</h1><p className="st-sub">Everything you’ve created or brought to tsayvish.</p></div>
        <div className="st-actions">
          <Link className="btn ghost" href="/studio/hub/characters/new?mode=upload">Upload existing</Link>
          <Link className="btn" href="/studio/hub/characters/new">Create new</Link>
        </div>
      </div>
      <HubTabs current={tab} tabs={[
        { key: "all", label: "All", href: href("all"), count: all.length },
        { key: "created", label: "Created here", href: href("created"), count: created.length },
        { key: "uploaded", label: "Uploaded", href: href("uploaded"), count: uploaded.length },
      ]} />
      {all.length > 0 && (
        <form className="hub-toolbar" action="/studio/hub/characters" role="search">
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
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
              <Link className="btn ghost" href="/studio/hub/characters/new?mode=upload">Upload existing</Link>
            </span>
          ) : undefined}
        >
          {q ? "Try a different name." : "Design a character from scratch, or upload one you already run to manage its trademarks, storefront and deals here."}
        </EmptyState>
      ) : (
        <div className="st-table">
          <div className="st-row st-row-head hub-char-row" aria-hidden="true">
            <span>Character</span><span>Services</span><span>Marketplace</span><span>Added</span><span />
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
                <span className="st-cell">{fmtDate(p.created_at)}</span>
                <span className="hub-row-actions">
                  <Link className="btn ghost st-small" href={`/studio/p/${p.id}?tab=character`}>Edit</Link>
                  <Link className="btn ghost st-small" href={`/studio/p/${p.id}`}>Manage</Link>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
