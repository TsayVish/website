import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Critter } from "@/components/art";
import { Carousel } from "@/components/studio/discover/Carousel";
import { ListingTile } from "@/components/studio/discover/ListingTile";
import { MemberRow } from "@/components/studio/discover/MemberRow";
import { SearchBar } from "@/components/studio/discover/SearchBar";
import { TopicIcon } from "@/components/studio/discover/TopicIcon";
import { CAST } from "@/lib/content";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { ALL_CATEGORIES, TOPICS } from "@/lib/topics";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";

export const metadata: Metadata = { title: "Discover" };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic: rawTopic } = await searchParams;
  const topic = rawTopic && ALL_CATEGORIES.includes(rawTopic) ? rawTopic : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let listingQuery = supabase.from("listings").select(LISTING_COLUMNS).eq("status", "published").order("created_at", { ascending: false }).limit(16);
  if (topic) listingQuery = listingQuery.contains("categories", [topic]);
  const [{ data: listingRows, error: listingError }, { data: me }] = await Promise.all([
    listingQuery,
    supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle(),
  ]);
  const listings = (listingRows ?? []) as unknown as Listing[];

  // Creators: with a topic, the people listing in it; otherwise the newest members.
  let peopleQuery = supabase
    .from("profiles")
    .select(MEMBER_COLUMNS)
    .eq("discoverable", true)
    .neq("id", user!.id)
    .not("full_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(9);
  if (topic) {
    const owners = [...new Set(listings.map((l) => l.owner_id))].filter((id) => id !== user!.id);
    peopleQuery = peopleQuery.in("id", owners.length ? owners : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data: peopleRows } = await peopleQuery;
  const people = (peopleRows ?? []) as unknown as Member[];

  const firstName = (me as { full_name: string | null } | null)?.full_name?.split(" ")[0];
  const chip = (t: string | null) => (t ? `/studio?topic=${encodeURIComponent(t)}` : "/studio");

  return (
    <div className="st-stack dc">
      <div className="dc-top">
        <p className="dc-hello">{firstName ? `Hi ${firstName}. ` : ""}Find creators, characters and the people who help build them.</p>
        <SearchBar />
      </div>

      <nav className="dc-chips" aria-label="Topics">
        <Link href={chip(null)} className="chip" aria-current={!topic ? "page" : undefined}>All</Link>
        {ALL_CATEGORIES.map((t) => (
          <Link key={t} href={chip(t)} className="chip" aria-current={topic === t ? "page" : undefined}>{t}</Link>
        ))}
      </nav>

      {listingError && (
        <p className="form-error" role="alert">
          Couldn’t load Discover: {listingError.message}. Run the latest supabase/schema.sql in the Supabase SQL Editor.
        </p>
      )}

      <section className="dc-section" aria-labelledby="dc-creators">
        <div className="dc-head">
          <h2 id="dc-creators">{topic ? `Creators in ${topic}` : "Creators on tsayvish"}</h2>
          <Link href="/studio/search" className="dc-more">Search all</Link>
        </div>
        {people.length ? (
          <div className="dc-members">
            {people.map((m) => <MemberRow key={m.id} member={m} />)}
          </div>
        ) : (
          <p className="st-muted">
            {topic ? "No creators listed here yet." : "You’re early. As more creators join, they’ll show up here."}
          </p>
        )}
      </section>

      {!topic && (
        <section className="dc-section" aria-labelledby="dc-topics">
          <div className="dc-head"><h2 id="dc-topics">Explore topics</h2></div>
          <div className="dc-topics">
            {TOPICS.map((t) => (
              <Link key={t.name} href={chip(t.name)} className="dc-topic" style={{ "--tc": t.color } as CSSProperties}>
                <span className="dc-topic-text">
                  <b>{t.name}</b>
                  <small>{t.blurb}</small>
                </span>
                <span className="dc-topic-icon"><TopicIcon name={t.icon} /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Carousel
        title={topic ? `New in ${topic}` : "New on tsayvish"}
        action={<Link href={topic ? `/studio/marketplace?cat=${encodeURIComponent(topic)}` : "/studio/marketplace"} className="dc-more">See all</Link>}
      >
        {listings.length ? (
          listings.map((l) => <ListingTile key={l.id} listing={l} />)
        ) : (
          <div className="dc-empty-tile">
            <p>No listings yet.</p>
            <Link className="btn st-small" href="/studio/marketplace/new">Be the first to list</Link>
          </div>
        )}
      </Carousel>

      <Carousel title="The tsayvish cast" action={<Link href="/studio/new/partner" className="dc-more">Partner with us</Link>}>
        {CAST.map((c) => (
          <Link key={c.name} href="/studio/new/partner" className="dc-tile">
            <span className="dc-tile-art" style={{ background: `color-mix(in srgb, ${c.body} 35%, var(--st-panel))` }}><Critter {...c} /></span>
            <span className="dc-tile-body">
              <b>{c.name}</b>
              <span>{c.line}</span>
            </span>
          </Link>
        ))}
      </Carousel>
    </div>
  );
}
