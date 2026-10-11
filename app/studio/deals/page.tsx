import type { Metadata } from "next";
import Link from "next/link";
import { ListingArt } from "@/components/studio/ListingCard";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { HubTabs } from "@/components/studio/hub/HubNav";
import { IconStore } from "@/components/studio/icons";
import { loadDeals } from "@/lib/deals";
import { fmtDate } from "@/lib/hub";
import { dealHref, money } from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Purchases and sales" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "sales" ? "sales" : "purchases";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;
  const [purchases, sales] = await Promise.all([loadDeals(supabase, { buyer: me }), loadDeals(supabase, { seller: me })]);
  const list = tab === "sales" ? sales : purchases;
  const total = list.reduce((sum, d) => sum + Number(d.offer.amount), 0);

  return (
    <div className="st-stack">
      <div className="st-crumbs"><Link href="/studio/marketplace">Marketplace</Link><span>/</span><span>{tab === "sales" ? "Sales" : "Purchases"}</span></div>
      <div className="st-pagehead">
        <div>
          <h1>{tab === "sales" ? "Sales" : "Purchases"}</h1>
          <p className="st-sub">{tab === "sales" ? "Offers you’ve accepted on your listings." : "Characters and services you’ve bought on the Marketplace."}</p>
        </div>
        {list.length > 0 && (
          <div className="dl-total"><span>Total agreed</span><b>{money(total)}</b></div>
        )}
      </div>
      <HubTabs current={tab} tabs={[
        { key: "purchases", label: "Purchases", href: "/studio/deals", count: purchases.length },
        { key: "sales", label: "Sales", href: "/studio/deals?tab=sales", count: sales.length },
      ]} />
      {list.length === 0 ? (
        <EmptyState
          icon={<IconStore />}
          title={tab === "sales" ? "No sales yet" : "No purchases yet"}
          action={<Link className="btn" href="/studio/marketplace">{tab === "sales" ? "Go to Marketplace" : "Browse the Marketplace"}</Link>}
        >
          {tab === "sales"
            ? "When you accept an offer on one of your listings, the sale shows up here."
            : "Make an offer on a listing. Once the seller accepts, it shows up here."}
        </EmptyState>
      ) : (
        <div className="st-table">
          <div className="st-row st-row-head dl-row" aria-hidden="true">
            <span>Item</span><span>{tab === "sales" ? "Buyer" : "Seller"}</span><span>Price</span><span>Payment</span><span>Agreed</span>
          </div>
          {list.map(({ offer, listing, buyer, seller }) => {
            const other = tab === "sales" ? buyer : seller;
            return (
              <Link key={offer.id} href={dealHref(offer.id)} className="st-row dl-row">
                <span className="st-proj">
                  <span className="dl-thumb">{listing ? <ListingArt listing={listing} /> : null}</span>
                  <span className="st-proj-text">
                    <b>{listing?.title ?? "Listing removed"}</b>
                    <small>{listing?.type === "service" ? "Service" : "Character license"}</small>
                  </span>
                </span>
                <span className="st-cell">{other?.full_name || (tab === "sales" ? "A member" : listing?.seller_name || "Seller")}</span>
                <span className="st-cell of-amount">{money(offer.amount)}</span>
                <span><span className={`st-status ${offer.paid_at ? "active" : "requested"}`}>{offer.paid_at ? "Paid" : "Awaiting payment"}</span></span>
                <span className="st-cell">{fmtDate(offer.responded_at)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
