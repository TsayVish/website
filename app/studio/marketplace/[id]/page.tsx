import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyEmail } from "@/components/CopyEmail";
import { ListingArt } from "@/components/studio/ListingCard";
import { ListingOwnerActions } from "@/components/studio/ListingOwnerActions";
import { kindLabel } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: { user } }, { data }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("listings").select(LISTING_COLUMNS).eq("id", id).maybeSingle(),
  ]);
  if (!data) notFound();
  const listing = data as unknown as Listing;
  const mine = listing.owner_id === user?.id;
  const listed = new Date(listing.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="st-stack">
      <div className="st-crumbs"><Link href="/studio/marketplace">Marketplace</Link><span>/</span><span>{listing.type === "character" ? "Character" : "Service"}</span></div>

      <div className="st-project-head">
        <div className="st-project-pic mk-detail-art"><ListingArt listing={listing} /></div>
        <div className="st-project-meta">
          <h1>{listing.title}</h1>
          <p className="st-meta">
            <span className={`st-pill ${listing.type === "character" ? "original" : "partnership"}`}>{listing.type === "character" ? "Character" : "Service"}</span>
            {" · "}{listing.category}{listing.seller_name ? ` · by ${listing.seller_name}` : ""} · listed {listed}
          </p>
        </div>
      </div>

      <div className="st-two">
        <div className="panel">
          {listing.summary && <p className="mk-lead">{listing.summary}</p>}
          <p className="st-message">{listing.description || "No description yet."}</p>
          <dl className="st-dl">
            <dt>Price</dt><dd>{listing.price || "Ask"}</dd>
            <dt>{listing.type === "character" ? "Offering" : "Category"}</dt><dd>{listing.category}</dd>
            {listing.type === "character" && (
              <>
                <dt>Character</dt>
                <dd>{[listing.character_info.personality, kindLabel(listing.character_info.kind).toLowerCase()].filter(Boolean).join(" · ")}</dd>
              </>
            )}
          </dl>
          {mine && listing.project_id && <Link className="st-help" href={`/studio/p/${listing.project_id}`}>Open the project behind this listing →</Link>}
        </div>

        <div className="st-stack mk-side">
          {mine && <ListingOwnerActions id={listing.id} status={listing.status} />}
          <div className="panel st-next">
            <b className="st-panel-title">{mine ? "How people reach you" : `Contact ${listing.seller_name || "the seller"}`}</b>
            {listing.contact_email ? (
              <>
                <p>Email them directly. tsayvish isn’t part of the conversation yet.</p>
                <CopyEmail email={listing.contact_email} />
              </>
            ) : (
              <p>No contact email on this listing.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
