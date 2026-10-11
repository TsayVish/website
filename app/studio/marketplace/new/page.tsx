import type { Metadata } from "next";
import Link from "next/link";
import { ListingForm } from "@/components/studio/ListingForm";
import { listingFormData } from "@/lib/listing-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New listing" };

export default async function NewListingPage() {
  const { characters, sellerName, defaultEmail } = await listingFormData(await createClient());
  return (
    <div className="st-stack">
      <div className="st-hello">
        <div className="st-crumbs"><Link href="/studio/marketplace">Marketplace</Link><span>/</span><span>New listing</span></div>
        <h1>Create a listing</h1>
        <p className="st-sub">Offer one of your characters for licensing or collaboration, or list a service you provide.</p>
      </div>
      <ListingForm characters={characters} sellerName={sellerName} defaultEmail={defaultEmail} />
    </div>
  );
}
