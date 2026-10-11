import Link from "next/link";
import { SavedCharacter, tint } from "./ProjectArt";
import { colorValue } from "@/lib/content";
import type { Listing } from "@/lib/types";

/** The picture for a listing: the character, or a lettered tile for a service. */
export function ListingArt({ listing }: { listing: Listing }) {
  if (listing.type === "character") {
    return (
      <span className="mk-art" style={{ background: tint(colorValue(listing.character_info.color)) }}>
        <SavedCharacter info={listing.character_info} fallbackName={listing.title} />
      </span>
    );
  }
  return (
    <span className="mk-art mk-art-service" aria-hidden="true">
      {listing.title.trim().charAt(0).toUpperCase() || "S"}
    </span>
  );
}

export function ListingCard({ listing, mine }: { listing: Listing; mine: boolean }) {
  return (
    <Link href={`/studio/marketplace/${listing.id}`} className="mk-card">
      <ListingArt listing={listing} />
      <span className="mk-card-body">
        <span className="mk-card-top">
          <span className={`st-pill ${listing.type === "character" ? "original" : "partnership"}`}>
            {listing.type === "character" ? "Character" : "Service"}
          </span>
          {mine && <span className="mk-mine">{listing.status === "hidden" ? "Yours · hidden" : "Yours"}</span>}
        </span>
        <b>{listing.title}</b>
        {listing.summary && <span className="mk-summary">{listing.summary}</span>}
        <span className="mk-foot">
          <span>{listing.category}</span>
          {listing.price && <span className="mk-price">{listing.price}</span>}
        </span>
        {listing.seller_name && <small className="st-help">by {listing.seller_name}</small>}
      </span>
    </Link>
  );
}
