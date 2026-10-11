import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CastArt } from "@/components/CastArt";
import { Carousel } from "@/components/studio/discover/Carousel";
import { ListingTile } from "@/components/studio/discover/ListingTile";
import { MemberRow } from "@/components/studio/discover/MemberRow";
import { SearchBar } from "@/components/studio/discover/SearchBar";
import { TopicIcon } from "@/components/studio/discover/TopicIcon";
import { CAST } from "@/lib/content";
import { POST_COLUMNS, fmtDate, type Post } from "@/lib/hub";
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

  // Ranked by recent views, offers, freshness and your interests.
  const listingQuery = supabase.rpc("discover_listings", { p_topic: topic, p_limit: 16 }).select(LISTING_COLUMNS);
  const [{ data: listingRows, error: listingError }, { data: me }] = await Promise.all([
    listingQuery,
    supabase.from("profiles").select("full_name, onboarded_at").eq("id", user!.id).maybeSingle(),
  ]);
  const listings = (listingRows ?? []) as unknown as Listing[];
  // New members start with a short welcome.
  if (me && !(me as { onboarded_at: string | null }).onboarded_at && !listingError) redirect("/studio/welcome");

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
  // Without a topic, creators are ranked (followers, complete profile, activity, newness).
  const { data: peopleRows } = topic ? await peopleQuery : await supabase.rpc("discover_creators", { p_limit: 9 });
  const people = (peopleRows ?? []) as unknown as Member[];

  // Latest posts from people you follow.
  const { data: followRows } = await supabase.from("follows").select("creator_id").eq("follower_id", user!.id);
  const followed = ((followRows ?? []) as { creator_id: string }[]).map((f) => f.creator_id);
  const [{ data: feedRows }, { data: authorRows }] = followed.length && !topic
    ? await Promise.all([
        supabase.from("posts").select(POST_COLUMNS).in("owner_id", followed).eq("status", "published").order("published_at", { ascending: false }).limit(6),
        supabase.from("profiles").select("id, full_name").in("id", followed),
      ])
    : [{ data: [] }, { data: [] }];
  const feed = (feedRows ?? []) as Post[];
  const authorName = new Map(((authorRows ?? []) as { id: string; full_name: string | null }[]).map((a) => [a.id, a.full_name]));

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

      {feed.length > 0 && (
        <section className="dc-section" aria-labelledby="dc-feed">
          <div className="dc-head"><h2 id="dc-feed">From creators you follow</h2></div>
          <div className="post-list post-list-grid">
            {feed.map((p) => (
              <Link key={p.id} href={`/studio/posts/${p.id}`} className="post-card">
                <span className="post-card-meta">{authorName.get(p.owner_id) || "Creator"} · {fmtDate(p.published_at)}</span>
                <b>{p.title}</b>
                {p.body && <span className="post-card-text">{p.body.slice(0, 160)}</span>}
              </Link>
            ))}
          </div>
        </section>
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
            <span className="dc-tile-art cast-pic"><CastArt member={c} /></span>
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
