import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/studio/Avatar";
import { ListingCard } from "@/components/studio/ListingCard";
import { MessageButton } from "@/components/studio/MessageButton";
import { BlockButton } from "@/components/studio/social/BlockButton";
import { FollowButton } from "@/components/studio/social/FollowButton";
import { ReportButton } from "@/components/studio/social/ReportButton";
import { POST_COLUMNS, fmtDate, type Post } from "@/lib/hub";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user?.id ?? "";
  const [{ data }, { data: listingRows }, { data: postRows }, { count: followerCount }, { data: myFollow }, { data: myBlock }] = await Promise.all([
    supabase.from("profiles").select(MEMBER_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("listings").select(LISTING_COLUMNS).eq("owner_id", id).eq("status", "published").order("created_at", { ascending: false }),
    supabase.from("posts").select(POST_COLUMNS).eq("owner_id", id).eq("status", "published").order("published_at", { ascending: false }).limit(20),
    supabase.from("follows").select("creator_id", { count: "exact", head: true }).eq("creator_id", id),
    supabase.from("follows").select("creator_id").eq("creator_id", id).eq("follower_id", me).maybeSingle(),
    supabase.from("blocks").select("blocked_id").eq("blocker_id", me).eq("blocked_id", id).maybeSingle(),
  ]);
  if (!data) notFound();
  const member = data as unknown as Member;
  const listings = (listingRows ?? []) as unknown as Listing[];
  const posts = (postRows ?? []) as Post[];
  const isMe = me === member.id;
  const name = member.full_name || "tsayvish member";
  const first = name.split(" ")[0];
  const site = member.website?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="st-stack">
      <div className="st-crumbs"><Link href="/studio">Discover</Link><span>/</span><span>{name}</span></div>
      <div className="pf-head">
        <Avatar url={member.avatar_url} name={name} size={96} />
        <div className="pf-text">
          <h1>{name}</h1>
          <p className="st-meta">
            {[member.location, site].filter(Boolean).length ? (
              <>
                {member.location}
                {member.location && site ? " · " : ""}
                {site && member.website && <a href={member.website} target="_blank" rel="noopener noreferrer nofollow">{site}</a>}
              </>
            ) : (
              "Creator on tsayvish"
            )}
          </p>
          {member.bio && <p className="pf-bio">{member.bio}</p>}
        </div>
        <div className="pf-actions">
          {isMe ? (
            <>
              <Link className="btn ghost" href="/studio/settings">Edit profile</Link>
              <small className="st-muted">{followerCount ?? 0} follower{followerCount === 1 ? "" : "s"}</small>
            </>
          ) : (
            <>
              <FollowButton creatorId={member.id} initialFollowing={Boolean(myFollow)} initialCount={followerCount ?? 0} />
              {!myBlock && <MessageButton userId={member.id} label={`Message ${first}`} className="btn ghost" />}
            </>
          )}
        </div>
      </div>
      {isMe && <p className="st-help">This is how other members see your profile.</p>}

      <section className="dc-section">
        <div className="dc-head">
          <h2>Posts <span className="st-count">{posts.length}</span></h2>
          {isMe && <Link className="dc-more" href="/studio/hub/library/new">Create a post</Link>}
        </div>
        {posts.length ? (
          <div className="post-list">
            {posts.map((p) => (
              <Link key={p.id} href={`/studio/posts/${p.id}`} className="post-card">
                <span className="post-card-meta">{fmtDate(p.published_at)}{p.visibility === "followers" ? " · Followers only" : ""}</span>
                <b>{p.title}</b>
                {p.body && <span className="post-card-text">{p.body.slice(0, 220)}</span>}
              </Link>
            ))}
          </div>
        ) : (
          <p className="st-muted">{isMe ? "You haven’t posted yet." : `${first} hasn’t posted anything you can see yet.`}</p>
        )}
      </section>

      <section className="dc-section">
        <div className="dc-head"><h2>Listings <span className="st-count">{listings.length}</span></h2></div>
        {listings.length ? (
          <div className="mk-grid">{listings.map((l) => <ListingCard key={l.id} listing={l} mine={isMe} />)}</div>
        ) : (
          <p className="st-muted">{isMe ? "You haven’t listed anything yet." : `${first} hasn’t listed anything yet.`}</p>
        )}
      </section>

      {!isMe && (
        <div className="rp-bar">
          <ReportButton targetType="profile" targetId={member.id} targetLabel={name} label="Report profile" />
          <BlockButton userId={member.id} initialBlocked={Boolean(myBlock)} name={first} />
        </div>
      )}
    </div>
  );
}
