import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/studio/Avatar";
import { ListingCard } from "@/components/studio/ListingCard";
import { MessageButton } from "@/components/studio/MessageButton";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: { user } }, { data }, { data: listingRows }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select(MEMBER_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("listings").select(LISTING_COLUMNS).eq("owner_id", id).eq("status", "published").order("created_at", { ascending: false }),
  ]);
  if (!data) notFound();
  const member = data as unknown as Member;
  const listings = (listingRows ?? []) as unknown as Listing[];
  const isMe = user?.id === member.id;
  const name = member.full_name || "tsayvish member";
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
            <Link className="btn ghost" href="/studio/settings">Edit profile</Link>
          ) : (
            <MessageButton userId={member.id} label={`Message ${name.split(" ")[0]}`} />
          )}
        </div>
      </div>
      {isMe && <p className="st-help">This is how other members see your profile.</p>}

      <section className="dc-section">
        <div className="dc-head"><h2>Listings <span className="st-count">{listings.length}</span></h2></div>
        {listings.length ? (
          <div className="mk-grid">{listings.map((l) => <ListingCard key={l.id} listing={l} mine={isMe} />)}</div>
        ) : (
          <p className="st-muted">{isMe ? "You haven’t listed anything yet." : `${name.split(" ")[0]} hasn’t listed anything yet.`}</p>
        )}
      </section>
    </div>
  );
}
