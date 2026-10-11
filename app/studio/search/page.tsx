import type { Metadata } from "next";
import Link from "next/link";
import { ListingCard } from "@/components/studio/ListingCard";
import { ProjectRow } from "@/components/studio/ProjectCard";
import { MemberRow } from "@/components/studio/discover/MemberRow";
import { SearchBar } from "@/components/studio/discover/SearchBar";
import { MEMBER_COLUMNS, cleanQuery, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { TOPICS } from "@/lib/topics";
import { LISTING_COLUMNS, PROJECT_COLUMNS, type Listing, type Project } from "@/lib/types";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw } = await searchParams;
  const q = cleanQuery(raw);

  if (!q) {
    return (
      <div className="st-stack dc">
        <div className="dc-top">
          <h1>Search</h1>
          <SearchBar autoFocus />
        </div>
        <section className="dc-section">
          <div className="dc-head"><h2>Or browse a topic</h2></div>
          <nav className="dc-chips dc-chips-wrap" aria-label="Topics">
            {TOPICS.map((t) => <Link key={t.name} className="chip" href={`/studio?topic=${encodeURIComponent(t.name)}`}>{t.name}</Link>)}
          </nav>
        </section>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const like = `%${q}%`;
  const [{ data: people }, { data: listings }, { data: projects }] = await Promise.all([
    supabase.from("profiles").select(MEMBER_COLUMNS).eq("discoverable", true).neq("id", user!.id)
      .or(`full_name.ilike.${like},bio.ilike.${like},location.ilike.${like}`).limit(12),
    supabase.from("listings").select(LISTING_COLUMNS).eq("status", "published")
      .or(`title.ilike.${like},summary.ilike.${like},category.ilike.${like},seller_name.ilike.${like}`)
      .order("created_at", { ascending: false }).limit(24),
    supabase.from("projects").select(PROJECT_COLUMNS).ilike("name", like).order("created_at", { ascending: false }).limit(12),
  ]);
  const m = (people ?? []) as unknown as Member[];
  const l = (listings ?? []) as unknown as Listing[];
  const p = (projects ?? []) as unknown as Project[];
  const total = m.length + l.length + p.length;

  return (
    <div className="st-stack dc">
      <div className="dc-top">
        <h1>Search</h1>
        <SearchBar defaultValue={q} />
        <p className="st-muted">{total ? `${total} result${total === 1 ? "" : "s"} for “${q}”` : `Nothing found for “${q}”. Try a shorter word or a topic.`}</p>
      </div>

      {m.length > 0 && (
        <section className="dc-section">
          <div className="dc-head"><h2>Creators <span className="st-count">{m.length}</span></h2></div>
          <div className="dc-members">{m.map((x) => <MemberRow key={x.id} member={x} />)}</div>
        </section>
      )}
      {l.length > 0 && (
        <section className="dc-section">
          <div className="dc-head"><h2>Listings <span className="st-count">{l.length}</span></h2></div>
          <div className="mk-grid">{l.map((x) => <ListingCard key={x.id} listing={x} mine={x.owner_id === user!.id} />)}</div>
        </section>
      )}
      {p.length > 0 && (
        <section className="dc-section">
          <div className="dc-head"><h2>Your projects <span className="st-count">{p.length}</span></h2></div>
          <div className="st-table">{p.map((x) => <ProjectRow key={x.id} project={x} />)}</div>
        </section>
      )}
    </div>
  );
}
