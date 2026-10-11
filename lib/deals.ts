import { OFFER_COLUMNS, type Offer } from "./offers";
import { LISTING_COLUMNS, type Listing } from "./types";

type Supa = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
export type Person = { id: string; full_name: string | null; avatar_url: string | null };
export type Deal = { offer: Offer; listing: Listing | null; buyer: Person | null; seller: Person | null };

/** Accepted offers, with their listing and both people. Row-level security limits this to deals you're part of. */
export async function loadDeals(supabase: Supa, filter: { id?: string; buyer?: string; seller?: string }): Promise<Deal[]> {
  let q = supabase.from("offers").select(OFFER_COLUMNS).eq("status", "accepted").order("responded_at", { ascending: false }).limit(200);
  if (filter.id) q = q.eq("id", filter.id);
  if (filter.buyer) q = q.eq("buyer_id", filter.buyer);
  if (filter.seller) q = q.eq("seller_id", filter.seller);
  const { data } = await q;
  const offers = (data ?? []) as Offer[];
  if (!offers.length) return [];
  const listingIds = [...new Set(offers.map((o) => o.listing_id))];
  const peopleIds = [...new Set(offers.flatMap((o) => [o.buyer_id, o.seller_id]))];
  const [{ data: ls }, { data: ps }] = await Promise.all([
    supabase.from("listings").select(LISTING_COLUMNS).in("id", listingIds),
    supabase.from("profiles").select("id, full_name, avatar_url").in("id", peopleIds),
  ]);
  const listings = new Map(((ls ?? []) as unknown as Listing[]).map((l) => [l.id, l]));
  const people = new Map(((ps ?? []) as Person[]).map((p) => [p.id, p]));
  return offers.map((offer) => ({
    offer,
    listing: listings.get(offer.listing_id) ?? null,
    buyer: people.get(offer.buyer_id) ?? null,
    seller: people.get(offer.seller_id) ?? null,
  }));
}

/** "Licensed" for characters, "Hired" for services. */
export const dealVerb = (listing: Listing | null) => (listing?.type === "service" ? "Hired" : "Licensed");
