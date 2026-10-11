import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/studio/Avatar";
import { ListingArt } from "@/components/studio/ListingCard";
import { ProjectArt, projectBackground } from "@/components/studio/ProjectArt";
import { TopicIcon } from "@/components/studio/discover/TopicIcon";
import { RecentSearches } from "@/components/studio/search/RecentSearches";
import { SearchComposer } from "@/components/studio/search/SearchComposer";
import { kindLabel } from "@/lib/content";
import { characterSubtitle } from "@/lib/existing";
import { POST_COLUMNS, fmtDate, type Post } from "@/lib/hub";
import { MEMBER_COLUMNS, cleanQuery, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { TOPICS } from "@/lib/topics";
import { LISTING_COLUMNS, PROJECT_COLUMNS, type Listing, type Project } from "@/lib/types";

export const metadata: Metadata = { title: "Search" };

const SUGGESTIONS: [string, string][] = [["Voice actors", "voice"], ["Plush manufacturing", "plush"], ["Characters to license", "license"], ["Trademark help", "trademark"], ["Animators", "animation"]];
const TYPES = [
  { key: "all", label: "All" },
  { key: "creators", label: "Creators" },
  { key: "listings", label: "Listings" },
  { key: "posts", label: "Posts" },
  { key: "projects", label: "Your projects" },
] as const;
type TypeKey = (typeof TYPES)[number]["key"];

function Row({ href, art, title, sub, meta }: { href: string; art: ReactNode; title: string; sub?: string | null; meta: string }) {
  return (
    <Link href={href} className="sx-row">
      <span className="sx-row-art">{art}</span>
      <span className="sx-row-text">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
      <span className="sx-row-meta">{meta}</span>
    </Link>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const type: TypeKey = TYPES.some((t) => t.key === sp.type) ? (sp.type as TypeKey) : "all";

  // ── Empty: a centered prompt, like a chat start screen ──
  if (!q) {
    return (
      <div className="sx sx-home">
        <div className="sx-hero">
          <h1>What are you looking for?</h1>
          <p className="st-muted">Find creators, characters to license, services and posts across tsayvish.</p>
          <SearchComposer autoFocus />
          <div className="sx-suggestions" aria-label="Try searching">
            {SUGGESTIONS.map(([label, query]) => (
              <Link key={label} className="sx-pill" href={`/studio/search?q=${encodeURIComponent(query)}`}>{label}</Link>
            ))}
          </div>
        </div>
        <div className="sx-below">
          <RecentSearches />
          <section className="sx-block" aria-labelledby="sx-topics">
            <div className="sx-block-head"><h2 id="sx-topics">Browse by topic</h2></div>
            <div className="sx-topics">
              {TOPICS.map((t) => (
                <Link key={t.name} className="sx-topic" href={`/studio?topic=${encodeURIComponent(t.name)}`}>
                  <span className="sx-topic-icon" style={{ background: t.color }}><TopicIcon name={t.icon} /></span>
                  <span>{t.name}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ── Results ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const like = `%${q}%`;
  const [{ data: people }, { data: listings }, { data: posts }, { data: projects }] = await Promise.all([
    supabase.from("profiles").select(MEMBER_COLUMNS).eq("discoverable", true).neq("id", user!.id)
      .or(`full_name.ilike.${like},bio.ilike.${like},location.ilike.${like}`).limit(20),
    supabase.from("listings").select(LISTING_COLUMNS).eq("status", "published")
      .or(`title.ilike.${like},summary.ilike.${like},category.ilike.${like},seller_name.ilike.${like}`)
      .order("created_at", { ascending: false }).limit(30),
    supabase.from("posts").select(POST_COLUMNS).eq("status", "published")
      .or(`title.ilike.${like},body.ilike.${like}`).order("published_at", { ascending: false }).limit(20),
    supabase.from("projects").select(PROJECT_COLUMNS).ilike("name", like).order("created_at", { ascending: false }).limit(12),
  ]);
  const m = (people ?? []) as unknown as Member[];
  const l = (listings ?? []) as unknown as Listing[];
  const ps = (posts ?? []) as Post[];
  const pr = (projects ?? []) as unknown as Project[];
  const counts: Record<TypeKey, number> = { all: m.length + l.length + ps.length + pr.length, creators: m.length, listings: l.length, posts: ps.length, projects: pr.length };

  // Post authors' names.
  const authorIds = [...new Set(ps.map((p) => p.owner_id))];
  const { data: authorRows } = authorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", authorIds) : { data: [] };
  const author = new Map(((authorRows ?? []) as { id: string; full_name: string | null }[]).map((a) => [a.id, a.full_name]));

  const tabHref = (k: TypeKey) => `/studio/search?q=${encodeURIComponent(q)}${k === "all" ? "" : `&type=${k}`}`;
  const show = (k: TypeKey) => type === "all" || type === k;
  const limit = (n: number) => (type === "all" ? n : 100);

  const section = (k: TypeKey, title: string, rows: ReactNode[]) =>
    show(k) && rows.length > 0 && (
      <section className="sx-group" aria-label={title}>
        {type === "all" && (
          <div className="sx-group-head">
            <h2>{title}</h2>
            {rows.length > limit(4) || counts[k] > limit(4) ? <Link href={tabHref(k)}>See all {counts[k]}</Link> : null}
          </div>
        )}
        <div className="sx-rows">{rows.slice(0, limit(4))}</div>
      </section>
    );

  return (
    <div className="sx sx-results">
      <div className="sx-top">
        <SearchComposer defaultValue={q} size="sm" type={type} />
        <nav className="sx-tabs" aria-label="Filter results">
          {TYPES.map((t) => (
            <Link key={t.key} href={tabHref(t.key)} aria-current={type === t.key ? "page" : undefined}>
              {t.label}{t.key !== "all" && counts[t.key] > 0 && <span>{counts[t.key]}</span>}
            </Link>
          ))}
        </nav>
      </div>

      {counts[type] === 0 ? (
        <div className="sx-none">
          <h2>No {type === "all" ? "results" : TYPES.find((t) => t.key === type)!.label.toLowerCase()} for “{q}”</h2>
          <p className="st-muted">Try a shorter word, or browse a topic instead.</p>
          <div className="sx-suggestions">
            {TOPICS.slice(0, 6).map((t) => <Link key={t.name} className="sx-pill" href={`/studio?topic=${encodeURIComponent(t.name)}`}>{t.name}</Link>)}
          </div>
        </div>
      ) : (
        <div className="sx-body">
          {type === "all" && <p className="sx-count">{counts.all} result{counts.all === 1 ? "" : "s"} for “{q}”</p>}
          {section("creators", "Creators", m.map((x) => (
            <Row key={x.id} href={`/studio/u/${x.id}`} art={<Avatar url={x.avatar_url} name={x.full_name || "Member"} size={40} />}
              title={x.full_name || "tsayvish member"} sub={x.bio || x.location} meta="Creator" />
          )))}
          {section("listings", "Listings", l.map((x) => (
            <Row key={x.id} href={`/studio/marketplace/${x.id}`} art={<span className="sx-thumb"><ListingArt listing={x} /></span>}
              title={x.title} sub={[x.summary, x.seller_name && `by ${x.seller_name}`].filter(Boolean).join(" · ")}
              meta={[x.type === "character" ? "Character" : "Service", x.price].filter(Boolean).join(" · ")} />
          )))}
          {section("posts", "Posts", ps.map((x) => (
            <Row key={x.id} href={`/studio/posts/${x.id}`} art={<span className="sx-thumb sx-thumb-doc">¶</span>}
              title={x.title} sub={`${author.get(x.owner_id) || "Creator"} · ${x.body.slice(0, 120)}`} meta={fmtDate(x.published_at)} />
          )))}
          {section("projects", "Your projects", pr.map((x) => (
            <Row key={x.id} href={`/studio/p/${x.id}`} art={<span className="sx-thumb" style={{ background: projectBackground(x) }}><ProjectArt project={x} /></span>}
              title={x.name} sub={x.type === "original" ? characterSubtitle(x, kindLabel) : x.company} meta={x.type === "original" ? "Character" : "Partnership"} />
          )))}
        </div>
      )}
    </div>
  );
}
