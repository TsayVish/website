import type { Metadata } from "next";
import Link from "next/link";
import { ListingCard } from "@/components/studio/ListingCard";
import { IconPlus } from "@/components/studio/icons";
import { createClient } from "@/lib/supabase/server";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";
import { ALL_CATEGORIES } from "@/lib/topics";

export const metadata: Metadata = { title: "Marketplace" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "character", label: "Characters" },
  { key: "service", label: "Services" },
  { key: "mine", label: "My listings" },
] as const;

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; cat?: string }>;
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

  let query = supabase.from("listings").select(LISTING_COLUMNS).order("created_at", { ascending: false }).limit(60);
  if (filter === "mine") query = query.eq("owner_id", user!.id);
  else query = query.eq("status", "published");
  if (filter === "character" || filter === "service") query = query.eq("type", filter);
  if (cat) query = query.contains("categories", [cat]);
  if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%,category.ilike.%${q}%,seller_name.ilike.%${q}%`);
  const { data, error } = await query;
  const listings = (data ?? []) as unknown as Listing[];

  const link = (key: string) => {
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
        <form className="mk-search" action="/studio/marketplace" role="search">
          {filter !== "all" && <input type="hidden" name="type" value={filter} />}
          {cat && <input type="hidden" name="cat" value={cat} />}
          <label htmlFor="mk-q" className="visually-hidden">Search listings</label>
          <input className="st-input" id="mk-q" name="q" type="search" defaultValue={q} placeholder="Search listings" />
          <button className="btn ghost" type="submit">Search</button>
        </form>
      </div>

      {cat && (
        <p className="mk-active-cat">
          Showing <b>{cat}</b> · <Link href={link(filter).replace(/([?&])cat=[^&]*&?/, "$1").replace(/[?&]$/, "")}>Clear topic</Link>
        </p>
      )}

      {error ? (
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
            <ListingCard key={l.id} listing={l} mine={l.owner_id === user!.id} />
          ))}
        </div>
      )}
    </div>
  );
}
