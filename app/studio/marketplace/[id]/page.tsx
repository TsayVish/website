import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyEmail } from "@/components/CopyEmail";
import { ListingArt, listingCategories } from "@/components/studio/ListingCard";
import { ListingOwnerActions } from "@/components/studio/ListingOwnerActions";
import { MessageButton } from "@/components/studio/MessageButton";
import { Avatar } from "@/components/studio/Avatar";
import { MakeOffer } from "@/components/studio/offers/MakeOffer";
import { OfferActions } from "@/components/studio/offers/OfferActions";
import { OFFER_COLUMNS, OFFER_STATUS_CLASS, OFFER_STATUS_LABEL, ago, agoInline, dealHref, money, offerDraft, type Offer } from "@/lib/offers";
import { ReportButton } from "@/components/studio/social/ReportButton";
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

  // Offers: the seller sees every offer on this listing; a buyer sees their own (row-level security).
  const { data: offerRows } = await supabase.from("offers").select(OFFER_COLUMNS).eq("listing_id", listing.id).order("created_at", { ascending: false });
  const offers = (offerRows ?? []) as Offer[];
  const buyerIds = [...new Set(offers.map((o) => o.buyer_id))];
  const { data: buyerRows } = mine && buyerIds.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", buyerIds) : { data: [] };
  const buyers = new Map(((buyerRows ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]).map((b) => [b.id, b]));
  const myOpen = !mine ? offers.find((o) => o.status === "pending") : undefined;
  const myLatest = !mine ? offers[0] : undefined;
  const sellerName = listing.seller_name || "the seller";
  const accepted = offers.filter((o) => o.status === "accepted");
  const myPurchase = !mine ? accepted[0] : undefined;
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
            {" · "}{listingCategories(listing).join(", ")}{listing.seller_name ? ` · by ${listing.seller_name}` : ""} · listed {listed}
          </p>
        </div>
      </div>

      {myPurchase && (
        <div className="dl-banner">
          <span className="dl-banner-mark" aria-hidden="true">✓</span>
          <span className="dl-banner-text">
            <b>You {listing.type === "service" ? "hired" : "licensed"} this for {money(myPurchase.amount)}</b>
            <small>{sellerName} accepted your offer {agoInline(myPurchase.responded_at ?? myPurchase.created_at)} · {myPurchase.paid_at ? "Paid" : "Awaiting payment"}</small>
          </span>
          <Link className="btn st-small" href={dealHref(myPurchase.id)}>View purchase</Link>
        </div>
      )}
      {mine && accepted.length > 0 && (
        <div className="dl-banner">
          <span className="dl-banner-mark" aria-hidden="true">✓</span>
          <span className="dl-banner-text">
            <b>{accepted.length === 1 ? `Sold to ${buyers.get(accepted[0].buyer_id)?.full_name || "a member"} for ${money(accepted[0].amount)}` : `${accepted.length} accepted offers · ${money(accepted.reduce((a, o) => a + Number(o.amount), 0))} total`}</b>
            <small>{accepted.length === 1 ? `Accepted ${agoInline(accepted[0].responded_at ?? accepted[0].created_at)} · ${accepted[0].paid_at ? "Paid" : "Awaiting payment"}` : "See each sale for payment status."}</small>
          </span>
          <Link className="btn st-small" href={accepted.length === 1 ? dealHref(accepted[0].id) : "/studio/marketplace?type=sales"}>{accepted.length === 1 ? "View sale" : "View sales"}</Link>
        </div>
      )}

      <div className="st-two">
        <div className="panel">
          {listing.summary && <p className="mk-lead">{listing.summary}</p>}
          <p className="st-message">{listing.description || "No description yet."}</p>
          <dl className="st-dl">
            <dt>Price</dt><dd>{listing.price || "Ask"}</dd>
            <dt>{listing.type === "character" ? "Offering" : "Categories"}</dt>
            <dd>
              <span className="mk-cats">
                {listingCategories(listing).map((c) => <span key={c} className="mk-cat">{c}</span>)}
              </span>
            </dd>
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
          {!mine && (
            <div className="panel st-next of-panel">
              <b className="st-panel-title">Make an offer</b>
              {myLatest && (
                <div className="of-mine">
                  <div className="of-mine-top">
                    <span>Your offer <b>{money(myLatest.amount)}</b></span>
                    <span className={`st-status ${OFFER_STATUS_CLASS[myLatest.status]}`}>{OFFER_STATUS_LABEL[myLatest.status]}</span>
                  </div>
                  <small className="st-muted">Sent {agoInline(myLatest.created_at)}{myLatest.responded_at ? ` · updated ${agoInline(myLatest.responded_at)}` : ""}</small>
                  <OfferActions
                    offerId={myLatest.id} status={myLatest.status} role="buyer" otherId={listing.owner_id} otherName={sellerName}
                    draft={offerDraft(listing.title, myLatest.amount)}
                  />
                </div>
              )}
              {!myOpen && <MakeOffer listingId={listing.id} sellerName={sellerName} askingPrice={listing.price} />}
            </div>
          )}
          {mine && (
            <div className="panel st-next of-panel">
              <b className="st-panel-title">Offers <span className="st-count">{offers.length}</span></b>
              {offers.length === 0 ? (
                <p>No offers yet. When someone makes one, you’ll get a notification.</p>
              ) : (
                <ul className="of-list">
                  {offers.map((o) => {
                    const b = buyers.get(o.buyer_id);
                    const name = b?.full_name || "A member";
                    return (
                      <li key={o.id} className="of-item">
                        <div className="of-item-top">
                          <Avatar url={b?.avatar_url} name={name} size={28} />
                          <span className="of-who"><Link href={`/studio/u/${o.buyer_id}`}>{name}</Link><small>{ago(o.created_at)}</small></span>
                          <b className="of-amount">{money(o.amount)}</b>
                        </div>
                        {o.message && <p className="of-note">“{o.message}”</p>}
                        <div className="of-item-foot">
                          <span className={`st-status ${OFFER_STATUS_CLASS[o.status]}`}>{OFFER_STATUS_LABEL[o.status]}</span>
                          <OfferActions offerId={o.id} status={o.status} role="seller" otherId={o.buyer_id} otherName={name} draft={offerDraft(listing.title, o.amount)} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <div className="panel st-next">
            <b className="st-panel-title">{mine ? "How people reach you" : `Contact ${listing.seller_name || "the seller"}`}</b>
            {!mine && (
              <>
                <MessageButton userId={listing.owner_id} label={`Message ${listing.seller_name?.split(" ")[0] || "seller"}`} />
                <Link className="st-help" href={`/studio/u/${listing.owner_id}`}>View {listing.seller_name || "their"} profile</Link>
              </>
            )}
            {listing.contact_email ? (
              <>
                <p>{mine ? "Members can message you here, or email:" : "Or email them:"}</p>
                <CopyEmail email={listing.contact_email} />
              </>
            ) : (
              mine && <p>Members can message you on tsayvish. Add a contact email to show one here too.</p>
            )}
          </div>
          {!mine && <ReportButton targetType="listing" targetId={listing.id} targetLabel={listing.title} label="Report this listing" />}
        </div>
      </div>
    </div>
  );
}
