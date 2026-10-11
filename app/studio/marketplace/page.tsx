import type { Metadata } from "next";
import Link from "next/link";
import { ListingCard } from "@/components/studio/ListingCard";
import { DealsTable } from "@/components/studio/deals/DealsTable";
import { loadDeals } from "@/lib/deals";
import { IconPlus } from "@/components/studio/icons";
import { createClient } from "@/lib/supabase/server";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";
import { ALL_CATEGORIES } from "@/lib/topics";
import { MoreLink } from "@/components/studio/MoreLink";
import { moreHref, readLimit, splitPage } from "@/lib/paging";

export const metadata: Metadata = { title: "Marketplace" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "character", label: "Characters" },
  { key: "service", label: "Services" },
  { key: "mine", label: "My listings" },
  { key: "purchases", label: "Purchases" },
  { key: "sales", label: "Sales" },
] as const;

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; cat?: string; limit?: string }>;
}) {
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.key === sp.type) ? (sp.type as string) : "all";
  // Keep only characters that are safe inside a PostgREST filter.
  const q = (sp.q ?? "").replace(/[^\p{L}\p{N}\s&'-]/gu, " ").trim().slice(0, 60);
  const cat = sp.cat && ALL_CATEGORIES.includes(sp.cat) ? sp.cat : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const limit = readLimit(sp.limit);
  // Searching published listings uses ranked full-text search; "My listings" filters your own (including hidden).
  const plain = () => supabase.from("listings").select(LISTING_COLUMNS);
  let query = q && filter !== "mine"
    ? (supabase.rpc("search_listings", { q }).select(LISTING_COLUMNS) as unknown as ReturnType<typeof plain>)
    : plain().order("created_at", { ascending: false });
  if (filter === "mine") query = query.eq("owner_id", user!.id);
  else query = query.eq("status", "published");
  if (filter === "character" || filter === "service") query = query.eq("type", filter);
  if (cat) query = query.contains("categories", [cat]);
  if (q && filter === "mine") query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);
  query = query.range(0, limit);
  const dealsTab = filter === "purchases" || filter === "sales" ? filter : null;
  const [{ data, error }, { data: boughtRows }, deals] = await Promise.all([
    dealsTab ? Promise.resolve({ data: [], error: null }) : query,
    supabase.from("offers").select("listing_id").eq("buyer_id", user!.id).eq("status", "accepted"),
    dealsTab ? loadDeals(supabase, dealsTab === "sales" ? { seller: user!.id } : { buyer: user!.id }) : Promise.resolve([]),
  ]);
  const page = splitPage(data as unknown as Listing[], limit);
  const listings = page.items;
  const bought = new Set(((boughtRows ?? []) as { listing_id: string }[]).map((r) => r.listing_id));

  const link = (key: string) => {
    if (key === "purchases" || key === "sales") return `/studio/marketplace?type=${key}`;
    const params = new URLSearchParams();
    if (key !== "all") params.set("type", key);
    if (q) params.set("q", q);
    if (cat) params.set("cat", cat);
    const s = params.toString();
    return s ? `/studio/marketplace?${s}` : "/studio/marketplace";
  };

  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div>
          <h1>Marketplace</h1>
          <p className="st-sub">Find characters to license and people to help build them. List your own characters and services.</p>
        </div>
        <div className="st-actions">
          <Link className="btn" href="/studio/marketplace/new"><IconPlus /> New listing</Link>
        </div>
      </div>

      <div className="st-section-head">
        <nav className="st-tabs" aria-label="Filter listings">
          {FILTERS.map((f) => (
            <Link key={f.key} href={link(f.key)} aria-current={filter === f.key ? "page" : undefined}>{f.label}</Link>
          ))}
        </nav>
        {!dealsTab && <form className="mk-search" action="/studio/marketplace" role="search">
          {filter !== "all" && <input type="hidden" name="type" value={filter} />}
          {cat && <input type="hidden" name="cat" value={cat} />}
          <label htmlFor="mk-q" className="visually-hidden">Search listings</label>
          <input className="st-input" id="mk-q" name="q" type="search" defaultValue={q} placeholder="Search listings" />
          <button className="btn ghost" type="submit">Search</button>
        </form>}
      </div>

      {dealsTab && <DealsTable deals={deals} kind={dealsTab} />}

      {!dealsTab && cat && (
        <p className="mk-active-cat">
          Showing <b>{cat}</b> · <Link href={link(filter).replace(/([?&])cat=[^&]*&?/, "$1").replace(/[?&]$/, "")}>Clear topic</Link>
        </p>
      )}

      {dealsTab ? null : error ? (
        <p className="form-error" role="alert">
          Couldn’t load the marketplace: {error.message}. If this is new, run the latest supabase/schema.sql in the Supabase SQL Editor.
        </p>
      ) : listings.length === 0 ? (
        <div className="st-empty">
          <h3>{q ? `No listings match “${q}”` : filter === "mine" ? "You haven’t listed anything yet" : "No listings here yet"}</h3>
          <p>List a character you’d like to license, or a service you offer to other creators.</p>
          <Link className="btn st-small" href="/studio/marketplace/new">Create a listing</Link>
        </div>
      ) : (
        <div className="mk-grid">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} mine={l.owner_id === user!.id} purchased={bought.has(l.id)} />
          ))}
        </div>
      )}
      {!dealsTab && page.hasMore && (
        <MoreLink href={moreHref("/studio/marketplace", { type: filter === "all" ? null : filter, q, cat }, limit)} />
      )}
    </div>
  );
}
