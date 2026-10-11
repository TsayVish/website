import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingForm } from "@/components/studio/ListingForm";
import { listingFormData } from "@/lib/listing-data";
import { createClient } from "@/lib/supabase/server";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";

export const metadata: Metadata = { title: "Edit listing" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { user, characters, sellerName, defaultEmail } = await listingFormData(supabase);
  const { data } = await supabase.from("listings").select(LISTING_COLUMNS).eq("id", id).maybeSingle();
  const listing = data as unknown as Listing | null;
  if (!listing || listing.owner_id !== user.id) notFound();

  return (
    <div className="st-stack">
      <div className="st-hello">
        <div className="st-crumbs">
          <Link href="/studio/marketplace">Marketplace</Link><span>/</span>
          <Link href={`/studio/marketplace/${listing.id}`}>{listing.title}</Link><span>/</span><span>Edit</span>
        </div>
        <h1>Edit listing</h1>
      </div>
      <ListingForm characters={characters} sellerName={sellerName} defaultEmail={defaultEmail} initial={listing} />
    </div>
  );
}
