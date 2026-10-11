import Link from "next/link";
import { ListingArt } from "@/components/studio/ListingCard";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { IconStore } from "@/components/studio/icons";
import type { Deal } from "@/lib/deals";
import { fmtDate } from "@/lib/hub";
import { dealHref, money } from "@/lib/offers";

/** Accepted offers as a table: what you bought (purchases) or sold (sales). */
export function DealsTable({ deals, kind }: { deals: Deal[]; kind: "purchases" | "sales" }) {
  const sales = kind === "sales";
  if (deals.length === 0) {
    return (
      <EmptyState
        icon={<IconStore />}
        title={sales ? "No sales yet" : "No purchases yet"}
        action={<Link className="btn st-small" href={sales ? "/studio/marketplace?type=mine" : "/studio/marketplace"}>{sales ? "See my listings" : "Browse listings"}</Link>}
      >
        {sales
          ? "When you accept an offer on one of your listings, the sale shows up here."
          : "Make an offer on a listing. Once the seller accepts, it shows up here."}
      </EmptyState>
    );
  }
  const total = deals.reduce((sum, d) => sum + Number(d.offer.amount), 0);
  return (
    <div className="st-stack dl-list">
      <p className="st-help">{deals.length} {sales ? (deals.length === 1 ? "sale" : "sales") : deals.length === 1 ? "purchase" : "purchases"} · {money(total)} agreed in total</p>
      <div className="st-table">
        <div className="st-row st-row-head dl-row" aria-hidden="true">
          <span>Item</span><span>{sales ? "Buyer" : "Seller"}</span><span>Price</span><span>Payment</span><span>Agreed</span>
        </div>
        {deals.map(({ offer, listing, buyer, seller }) => {
          const other = sales ? buyer : seller;
          return (
            <Link key={offer.id} href={dealHref(offer.id)} className="st-row dl-row">
              <span className="st-proj">
                <span className="dl-thumb">{listing ? <ListingArt listing={listing} /> : null}</span>
                <span className="st-proj-text">
                  <b>{listing?.title ?? "Listing removed"}</b>
                  <small>{listing?.type === "service" ? "Service" : "Character license"}</small>
                </span>
              </span>
              <span className="st-cell">{other?.full_name || (sales ? "A member" : listing?.seller_name || "Seller")}</span>
              <span className="st-cell of-amount">{money(offer.amount)}</span>
              <span><span className={`st-status ${offer.paid_at ? "active" : "requested"}`}>{offer.paid_at ? "Paid" : "Awaiting payment"}</span></span>
              <span className="st-cell">{fmtDate(offer.responded_at)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
