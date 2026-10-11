import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/studio/Avatar";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { HubTabs } from "@/components/studio/hub/HubNav";
import { IconBell } from "@/components/studio/icons";
import { MarkNotificationsRead } from "@/components/studio/offers/MarkNotificationsRead";
import { OfferActions } from "@/components/studio/offers/OfferActions";
import {
  NOTIFICATION_COLUMNS, OFFER_COLUMNS, OFFER_STATUS_CLASS, OFFER_STATUS_LABEL, ago, money, offerDraft,
  type NotificationRow, type Offer,
} from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications" };

type Person = { id: string; full_name: string | null; avatar_url: string | null };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = (["unread", "received", "sent"] as const).find((t) => t === rawTab) ?? "all";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;

  const [{ data: noteRows, error }, { data: offerRows }] = await Promise.all([
    supabase.from("notifications").select(NOTIFICATION_COLUMNS).eq("user_id", me).order("created_at", { ascending: false }).limit(100),
    supabase.from("offers").select(OFFER_COLUMNS).order("created_at", { ascending: false }).limit(200),
  ]);
  const notes = (noteRows ?? []) as NotificationRow[];
  const offers = (offerRows ?? []) as Offer[];
  const offerById = new Map(offers.map((o) => [o.id, o]));
  const received = offers.filter((o) => o.seller_id === me);
  const sent = offers.filter((o) => o.buyer_id === me);
  const unreadCount = notes.filter((n) => !n.read_at).length;

  const listingIds = [...new Set([...notes.map((n) => n.listing_id), ...offers.map((o) => o.listing_id)].filter(Boolean) as string[])];
  const personIds = [...new Set([...notes.map((n) => n.actor_id), ...offers.flatMap((o) => [o.buyer_id, o.seller_id])].filter((x): x is string => Boolean(x) && x !== me))];
  const [{ data: listingRows }, { data: peopleRows }] = await Promise.all([
    listingIds.length ? supabase.from("listings").select("id, title, seller_name").in("id", listingIds) : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", personIds) : Promise.resolve({ data: [] }),
  ]);
  const listingTitle = new Map(((listingRows ?? []) as { id: string; title: string; seller_name: string | null }[]).map((l) => [l.id, l]));
  const people = new Map(((peopleRows ?? []) as Person[]).map((p) => [p.id, p]));
  const personName = (id: string | null, fallback = "A member") => (id && people.get(id)?.full_name) || fallback;
  const titleOf = (id: string | null) => (id && listingTitle.get(id)?.title) || "a listing";
  const listingLink = (id: string | null) =>
    id ? <Link href={`/studio/marketplace/${id}`}><b>{titleOf(id)}</b></Link> : <b>a listing</b>;

  function describe(n: NotificationRow): { text: ReactNode; extra?: ReactNode } {
    const who = <Link href={n.actor_id ? `/studio/u/${n.actor_id}` : "#"}><b>{personName(n.actor_id)}</b></Link>;
    const o = n.offer_id ? offerById.get(n.offer_id) : undefined;
    const amt = o ? <b>{money(o.amount)}</b> : "an";
    const otherName = personName(n.actor_id, "them");
    switch (n.type) {
      case "offer_received":
        return {
          text: <>{who} offered {amt} for {listingLink(n.listing_id)}</>,
          extra: o && (
            <>
              {o.message && <p className="of-note">“{o.message}”</p>}
              <div className="of-item-foot">
                <span className={`st-status ${OFFER_STATUS_CLASS[o.status]}`}>{OFFER_STATUS_LABEL[o.status]}</span>
                <OfferActions offerId={o.id} status={o.status} role="seller" otherId={o.buyer_id} otherName={otherName} draft={offerDraft(titleOf(o.listing_id), o.amount)} />
              </div>
            </>
          ),
        };
      case "offer_accepted":
      case "offer_declined":
        return {
          text: <>{who} {n.type === "offer_accepted" ? "accepted" : "declined"} your {amt} offer for {listingLink(n.listing_id)}</>,
          extra: o && (
            <div className="of-item-foot">
              <span className={`st-status ${OFFER_STATUS_CLASS[o.status]}`}>{OFFER_STATUS_LABEL[o.status]}</span>
              <OfferActions offerId={o.id} status={o.status} role="buyer" otherId={o.seller_id} otherName={otherName} draft={offerDraft(titleOf(o.listing_id), o.amount)} />
            </div>
          ),
        };
      case "offer_withdrawn":
        return { text: <>{who} withdrew their {amt} offer for {listingLink(n.listing_id)}</> };
      case "new_follower":
        return { text: <>{who} started following you</> };
    }
  }

  const offerTable = (list: Offer[], role: "seller" | "buyer") =>
    list.length === 0 ? (
      <EmptyState icon={<IconBell />} title={role === "seller" ? "No offers received" : "No offers sent"}>
        {role === "seller"
          ? "When someone makes an offer on one of your listings, it shows up here and in your notifications."
          : "Find something on the Marketplace and use Make an offer on the listing."}
      </EmptyState>
    ) : (
      <div className="st-table">
        <div className="st-row st-row-head nt-offer-row" aria-hidden="true">
          <span>Listing</span><span>{role === "seller" ? "From" : "To"}</span><span>Offer</span><span>Status</span><span />
        </div>
        {list.map((o) => {
          const other = role === "seller" ? o.buyer_id : o.seller_id;
          const name = personName(other, role === "seller" ? "A member" : listingTitle.get(o.listing_id)?.seller_name || "Seller");
          return (
            <div key={o.id} className="st-row nt-offer-row">
              <span className="st-proj-text">
                <Link href={`/studio/marketplace/${o.listing_id}`}><b>{titleOf(o.listing_id)}</b></Link>
                <small>{o.message ? `“${o.message}”` : ago(o.created_at)}</small>
              </span>
              <span className="st-cell"><Link href={`/studio/u/${other}`}>{name}</Link></span>
              <span className="st-cell of-amount">{money(o.amount)}</span>
              <span><span className={`st-status ${OFFER_STATUS_CLASS[o.status]}`}>{OFFER_STATUS_LABEL[o.status]}</span></span>
              <OfferActions offerId={o.id} status={o.status} role={role} otherId={other} otherName={name} draft={offerDraft(titleOf(o.listing_id), o.amount)} />
            </div>
          );
        })}
      </div>
    );

  const shown = tab === "unread" ? notes.filter((n) => !n.read_at) : notes;

  return (
    <div className="st-stack">
      <MarkNotificationsRead me={me} unread={unreadCount} />
      <div className="st-pagehead"><div><h1>Notifications</h1><p className="st-sub">Offers, replies and new followers.</p></div></div>
      <HubTabs current={tab} tabs={[
        { key: "all", label: "All", href: "/studio/notifications" },
        { key: "unread", label: "Unread", href: "/studio/notifications?tab=unread", count: unreadCount },
        { key: "received", label: "Offers received", href: "/studio/notifications?tab=received", count: received.filter((o) => o.status === "pending").length },
        { key: "sent", label: "Offers sent", href: "/studio/notifications?tab=sent", count: sent.length },
      ]} />
      {error && <p className="form-error" role="alert">Couldn’t load notifications: {error.message}. Run the latest supabase/schema.sql.</p>}

      {tab === "received" ? offerTable(received, "seller") : tab === "sent" ? offerTable(sent, "buyer") : shown.length === 0 ? (
        <EmptyState icon={<IconBell />} title={tab === "unread" ? "You’re all caught up" : "No notifications yet"}>
          Offers on your listings, replies to your offers and new followers will show up here.
        </EmptyState>
      ) : (
        <ul className="nt-list">
          {shown.map((n) => {
            const { text, extra } = describe(n);
            const actor = n.actor_id ? people.get(n.actor_id) : undefined;
            return (
              <li key={n.id} className={n.read_at ? "nt-item" : "nt-item nt-unread"}>
                <Avatar url={actor?.avatar_url} name={personName(n.actor_id)} size={36} />
                <div className="nt-body">
                  <p className="nt-text">{text}</p>
                  <small className="nt-time">{ago(n.created_at)}</small>
                  {extra}
                </div>
                {!n.read_at && <span className="nt-dot" aria-label="New" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
