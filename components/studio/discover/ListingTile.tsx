import Link from "next/link";
import { ListingArt, listingCategories } from "../ListingCard";
import type { Listing } from "@/lib/types";

/** A larger listing card for Discover rows. */
export function ListingTile({ listing }: { listing: Listing }) {
  return (
    <Link href={`/studio/marketplace/${listing.id}`} className="dc-tile">
      <span className="dc-tile-art"><ListingArt listing={listing} /></span>
      <span className="dc-tile-body">
        <b>{listing.title}</b>
        <span>{listing.seller_name ? `by ${listing.seller_name}` : listingCategories(listing)[0]}</span>
        {listing.price && <small>{listing.price}</small>}
      </span>
    </Link>
  );
}
