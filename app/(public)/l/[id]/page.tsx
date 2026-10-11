import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareButton } from "@/components/ShareButton";
import { ListingArt, listingCategories } from "@/components/studio/ListingCard";
import { kindLabel } from "@/lib/content";
import { createPublicClient, SITE_URL } from "@/lib/supabase/public";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";

export const revalidate = 300;

async function getListing(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createPublicClient().from("listings").select(LISTING_COLUMNS).eq("id", id).eq("status", "published").maybeSingle();
  return data as unknown as Listing | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const listing = await getListing((await params).id);
  if (!listing) return { title: "Listing not found" };
  const description = listing.summary || `${listing.type === "character" ? "A character" : "A service"} on tsayvish${listing.seller_name ? ` by ${listing.seller_name}` : ""}.`;
  return {
    title: listing.title,
    description,
    alternates: { canonical: `${SITE_URL}/l/${listing.id}` },
    openGraph: { title: listing.title, description, url: `${SITE_URL}/l/${listing.id}`, type: "website", siteName: "tsayvish" },
    twitter: { card: "summary_large_image", title: listing.title, description },
  };
}

export default async function PublicListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();
  const offerHref = `/login?mode=signup&next=${encodeURIComponent(`/studio/marketplace/${listing.id}`)}`;
  return (
    <div className="pub-wrap pub-stack pub-listing">
      <div className="st-crumbs"><Link href="/explore">Explore</Link><span>/</span><span>{listing.type === "character" ? "Character" : "Service"}</span></div>
      <div className="pub-listing-grid">
        <div className="pub-art"><ListingArt listing={listing} /></div>
        <div className="pub-stack">
          <div>
            <span className={`st-pill ${listing.type === "character" ? "original" : "partnership"}`}>{listing.type === "character" ? "Character" : "Service"}</span>
            <h1>{listing.title}</h1>
            {listing.summary && <p className="pub-lead">{listing.summary}</p>}
          </div>
          <dl className="st-dl">
            <dt>Price</dt><dd>{listing.price || "Ask"}</dd>
            <dt>{listing.type === "character" ? "Offering" : "Categories"}</dt><dd>{listingCategories(listing).join(", ")}</dd>
            {listing.type === "character" && listing.character_info?.kind && (<><dt>Character</dt><dd>{[listing.character_info.personality, kindLabel(listing.character_info.kind).toLowerCase()].filter(Boolean).join(" · ")}</dd></>)}
            {listing.seller_name && (<><dt>By</dt><dd><Link href={`/c/${listing.owner_id}`}>{listing.seller_name}</Link></dd></>)}
          </dl>
          {listing.description && <p className="pub-body">{listing.description}</p>}
          <div className="st-actions">
            <Link className="btn" href={offerHref}>Make an offer</Link>
            <Link className="btn ghost" href={offerHref}>Message {listing.seller_name?.split(" ")[0] || "the seller"}</Link>
            <ShareButton url={`${SITE_URL}/l/${listing.id}`} title={listing.title} />
          </div>
          <p className="st-help">You’ll need a free tsayvish account to make an offer or send a message.</p>
        </div>
      </div>
    </div>
  );
}
