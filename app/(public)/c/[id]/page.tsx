import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicListingCard } from "@/components/PublicListingCard";
import { ShareButton } from "@/components/ShareButton";
import { Avatar } from "@/components/studio/Avatar";
import { fmtDate } from "@/lib/hub";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createPublicClient, SITE_URL } from "@/lib/supabase/public";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";

export const revalidate = 300;

async function getCreator(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createPublicClient().from("profiles").select(MEMBER_COLUMNS).eq("id", id).maybeSingle();
  return data as unknown as Member | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const m = await getCreator((await params).id);
  if (!m) return { title: "Creator not found" };
  const name = m.full_name || "Creator";
  const description = m.bio || `${name} on tsayvish.`;
  return {
    title: name,
    description,
    alternates: { canonical: `${SITE_URL}/c/${m.id}` },
    openGraph: { title: `${name} on tsayvish`, description, url: `${SITE_URL}/c/${m.id}`, type: "profile", siteName: "tsayvish" },
    twitter: { card: "summary_large_image", title: `${name} on tsayvish`, description },
  };
}

export default async function PublicCreator({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await getCreator(id);
  if (!member) notFound();
  const supabase = createPublicClient();
  const [{ data: ls }, { data: ps }, { data: followers }] = await Promise.all([
    supabase.from("listings").select(LISTING_COLUMNS).eq("owner_id", id).eq("status", "published").order("created_at", { ascending: false }).limit(24),
    supabase.from("posts").select("id, title, body, published_at").eq("owner_id", id).eq("status", "published").eq("visibility", "public").order("published_at", { ascending: false }).limit(6),
    supabase.rpc("follower_count", { creator: id }),
  ]);
  const listings = (ls ?? []) as unknown as Listing[];
  const posts = (ps ?? []) as { id: string; title: string; body: string; published_at: string | null }[];
  const name = member.full_name || "tsayvish creator";
  const join = `/login?mode=signup&next=${encodeURIComponent(`/studio/u/${id}`)}`;
  return (
    <div className="pub-wrap pub-stack">
      <div className="pf-head">
        <Avatar url={member.avatar_url} name={name} size={88} />
        <div className="pf-text">
          <h1>{name}</h1>
          <p className="st-meta">{[member.location, typeof followers === "number" ? `${followers} follower${followers === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</p>
          {member.bio && <p className="pf-bio">{member.bio}</p>}
        </div>
        <div className="pf-actions">
          <Link className="btn" href={join}>Follow</Link>
          <Link className="btn ghost" href={join}>Message</Link>
          <ShareButton url={`${SITE_URL}/c/${id}`} title={name} />
        </div>
      </div>
      <section className="dc-section">
        <div className="dc-head"><h2>Listings <span className="st-count">{listings.length}</span></h2></div>
        {listings.length ? <div className="mk-grid">{listings.map((l) => <PublicListingCard key={l.id} listing={l} />)}</div> : <p className="st-muted">Nothing listed right now.</p>}
      </section>
      {posts.length > 0 && (
        <section className="dc-section">
          <div className="dc-head"><h2>Posts</h2></div>
          <div className="post-list post-list-grid">
            {posts.map((p) => (
              <Link key={p.id} href={`/login?mode=signup&next=${encodeURIComponent(`/studio/posts/${p.id}`)}`} className="post-card">
                <span className="post-card-meta">{fmtDate(p.published_at)}</span>
                <b>{p.title}</b>
                <span className="post-card-text">{p.body.slice(0, 200)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
