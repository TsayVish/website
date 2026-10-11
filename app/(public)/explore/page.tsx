import type { Metadata } from "next";
import Link from "next/link";
import { PublicListingCard } from "@/components/PublicListingCard";
import { MoreLink } from "@/components/studio/MoreLink";
import { cleanQuery } from "@/lib/members";
import { moreHref, readLimit, splitPage } from "@/lib/paging";
import { createPublicClient } from "@/lib/supabase/public";
import { ALL_CATEGORIES } from "@/lib/topics";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";

export const metadata: Metadata = {
  title: "Explore characters and creators",
  description: "Characters available to license, and the illustrators, voice actors, animators and makers who bring them to life.",
};
export const revalidate = 300;

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string; topic?: string; limit?: string }> }) {
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const topic = sp.topic && ALL_CATEGORIES.includes(sp.topic) ? sp.topic : null;
  const limit = readLimit(sp.limit);
  const supabase = createPublicClient();
  const plain = () => supabase.from("listings").select(LISTING_COLUMNS);
  let query = q
    ? (supabase.rpc("search_listings", { q }).select(LISTING_COLUMNS) as unknown as ReturnType<typeof plain>)
    : (supabase.rpc("discover_listings", { p_topic: topic, p_limit: 100 }).select(LISTING_COLUMNS) as unknown as ReturnType<typeof plain>);
  if (q && topic) query = query.contains("categories", [topic]);
  const { data, error } = await query.range(0, limit);
  const page = splitPage(data as unknown as Listing[], limit);
  const chip = (t: string | null) => `/explore${t ? `?topic=${encodeURIComponent(t)}` : ""}`;

  return (
    <div className="pub-wrap pub-stack">
      <div className="pub-hero">
        <h1>Characters to license, and the people who build them</h1>
        <p>Browse what creators on tsayvish are offering. Join to make an offer or message them.</p>
        <form className="sx-box sx-sm pub-search" action="/explore" role="search">
          <label htmlFor="pub-q" className="visually-hidden">Search</label>
          <input id="pub-q" name="q" type="search" defaultValue={q} placeholder="Search characters and services" />
          {topic && <input type="hidden" name="topic" value={topic} />}
          <button type="submit" className="sx-go" aria-label="Search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>
          </button>
        </form>
      </div>
      <nav className="dc-chips" aria-label="Topics">
        <Link href={chip(null)} className="chip" aria-current={!topic ? "page" : undefined}>All</Link>
        {ALL_CATEGORIES.map((t) => <Link key={t} href={chip(t)} className="chip" aria-current={topic === t ? "page" : undefined}>{t}</Link>)}
      </nav>
      {error ? (
        <p className="form-error">Couldn’t load listings right now.</p>
      ) : page.items.length === 0 ? (
        <div className="hub-empty"><h2>{q ? `Nothing matches “${q}”` : "No listings here yet"}</h2><p>Be the first: <Link href="/login?mode=signup">join tsayvish</Link> and list a character or service.</p></div>
      ) : (
        <div className="mk-grid">{page.items.map((l) => <PublicListingCard key={l.id} listing={l} />)}</div>
      )}
      {page.hasMore && <MoreLink href={moreHref("/explore", { q: q || null, topic }, limit)} />}
    </div>
  );
}
