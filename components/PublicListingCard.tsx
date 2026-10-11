import Link from "next/link";
import { ListingArt, listingCategories } from "@/components/studio/ListingCard";
import type { Listing } from "@/lib/types";

/** A listing card for public pages: links to the public listing page. */
export function PublicListingCard({ listing }: { listing: Listing }) {
  return (
    <Link href={`/l/${listing.id}`} className="mk-card">
      <ListingArt listing={listing} />
      <span className="mk-card-body">
        <span className={`st-pill ${listing.type === "character" ? "original" : "partnership"}`}>{listing.type === "character" ? "Character" : "Service"}</span>
        <b>{listing.title}</b>
        {listing.summary && <span className="mk-summary">{listing.summary}</span>}
        <span className="mk-foot">
          <span>{listingCategories(listing).join(" · ")}</span>
          {listing.price && <span className="mk-price">{listing.price}</span>}
          {listing.seller_name && <span>by {listing.seller_name}</span>}
        </span>
      </span>
    </Link>
  );
}
