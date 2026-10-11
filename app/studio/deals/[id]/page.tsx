import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/studio/Avatar";
import { ListingArt, listingCategories } from "@/components/studio/ListingCard";
import { MessageButton } from "@/components/studio/MessageButton";
import { MarkPaidButton } from "@/components/studio/offers/MarkPaidButton";
import { IconCheck } from "@/components/studio/icons";
import { dealVerb, loadDeals, type Person } from "@/lib/deals";
import { fmtDate } from "@/lib/hub";
import { money, offerDraft } from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deal" };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : null;

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [deal] = await loadDeals(supabase, { id });
  if (!deal) notFound();
  const { offer, listing, buyer, seller } = deal;
  const iAmSeller = offer.seller_id === user!.id;
  const other = iAmSeller ? buyer : seller;
  const otherId = iAmSeller ? offer.buyer_id : offer.seller_id;
  const otherName = other?.full_name || (iAmSeller ? "the buyer" : listing?.seller_name || "the seller");
  const title = listing?.title ?? "this listing";
  const verb = dealVerb(listing);

  const steps = [
    { label: "Offer made", at: offer.created_at, done: true },
    { label: "Offer accepted", at: offer.responded_at, done: true },
    { label: iAmSeller ? "Payment received" : "Payment confirmed by seller", at: offer.paid_at, done: Boolean(offer.paid_at) },
  ];

  const party = (role: string, p: Person | null, pid: string, fallback: string) => (
    <div className="dl-party">
      <Avatar url={p?.avatar_url} name={p?.full_name || fallback} size={32} />
      <span>
        <small>{role}</small>
        <Link href={`/studio/u/${pid}`}><b>{p?.full_name || fallback}</b></Link>
      </span>
    </div>
  );

  return (
    <div className="st-stack dl-page">
      <div className="st-crumbs">
        <Link href={iAmSeller ? "/studio/deals?tab=sales" : "/studio/deals"}>{iAmSeller ? "Sales" : "Purchases"}</Link><span>/</span><span>{title}</span>
      </div>

      <section className={`dl-hero ${offer.paid_at ? "is-paid" : ""}`}>
        <span className="dl-hero-mark" aria-hidden="true"><IconCheck /></span>
        <div className="dl-hero-text">
          <p className="dl-eyebrow">{iAmSeller ? "Sale" : "Purchase"} · {offer.paid_at ? "Paid" : "Accepted"}</p>
          <h1>{iAmSeller ? `You sold ${title} to ${otherName}` : `You ${verb.toLowerCase()} ${title}`}</h1>
          <p className="st-muted">
            {iAmSeller
              ? `${otherName.split(" ")[0]}’s ${money(offer.amount)} offer was accepted on ${fmtDate(offer.responded_at)}.`
              : `${otherName} accepted your ${money(offer.amount)} offer on ${fmtDate(offer.responded_at)}.`}
          </p>
        </div>
        <div className="dl-hero-amount"><small>Agreed price</small><b>{money(offer.amount)}</b><small>USD</small></div>
      </section>

      <div className="st-two">
        <div className="st-stack">
          <section className="panel dl-item">
            <b className="st-panel-title">{verb === "Hired" ? "Service" : "Character"}</b>
            <div className="dl-item-row">
              <span className="dl-item-art">{listing ? <ListingArt listing={listing} /> : null}</span>
              <span className="st-proj-text">
                {listing ? <Link href={`/studio/marketplace/${listing.id}`}><b>{listing.title}</b></Link> : <b>Listing removed</b>}
                {listing?.summary && <small>{listing.summary}</small>}
                {listing && <small>{listingCategories(listing).join(", ")}{listing.price ? ` · listed at ${listing.price}` : ""}</small>}
              </span>
            </div>
            {offer.message && (
              <>
                <b className="st-panel-title">Buyer’s note</b>
                <p className="of-note">“{offer.message}”</p>
              </>
            )}
          </section>

          <section className="panel">
            <b className="st-panel-title">Progress</b>
            <ol className="dl-steps">
              {steps.map((s) => (
                <li key={s.label} className={s.done ? "done" : ""}>
                  <span className="dl-step-dot" aria-hidden="true">{s.done ? <IconCheck /> : null}</span>
                  <span className="dl-step-text">
                    <b>{s.label}</b>
                    <small>{s.done ? when(s.at) : iAmSeller ? "Mark as paid once the money arrives." : `Waiting for ${otherName.split(" ")[0]} to confirm payment.`}</small>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="st-stack">
          <section className="panel dl-side">
            <b className="st-panel-title">People</b>
            {party("Seller", seller, offer.seller_id, listing?.seller_name || "Seller")}
            {party("Buyer", buyer, offer.buyer_id, "Buyer")}
            <MessageButton userId={otherId} label={`Message ${otherName.split(" ")[0]}`} className="btn ghost" draft={offerDraft(title, offer.amount)} />
          </section>
          <section className="panel dl-side">
            <b className="st-panel-title">Payment</b>
            {offer.paid_at ? (
              <p>Marked as paid on {fmtDate(offer.paid_at)}.</p>
            ) : (
              <>
                <p>
                  Checkout on tsayvish isn’t live yet, so arrange payment with {otherName.split(" ")[0]} directly.
                  {iAmSeller ? " When the money arrives, mark it here and the buyer is notified." : " The seller marks it as paid once it arrives."}
                </p>
                {iAmSeller && <MarkPaidButton offerId={offer.id} />}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
