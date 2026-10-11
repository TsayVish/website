import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/studio/Avatar";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { HubTabs } from "@/components/studio/hub/HubNav";
import { IconBell } from "@/components/studio/icons";
import { LiveRefresh } from "@/components/studio/LiveRefresh";
import { MarkNotificationsRead } from "@/components/studio/offers/MarkNotificationsRead";
import { OfferActions } from "@/components/studio/offers/OfferActions";
import {
  NOTIFICATION_COLUMNS, OFFER_COLUMNS, OFFER_STATUS_CLASS, OFFER_STATUS_LABEL, ago, money, offerDraft,
  type NotificationRow, type Offer,
} from "@/lib/offers";
import { MoreLink } from "@/components/studio/MoreLink";
import { moreHref, readLimit, splitPage } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications" };

type Person = { id: string; full_name: string | null; avatar_url: string | null };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string; limit?: string }> }) {
  const { tab: rawTab, limit: rawLimit } = await searchParams;
  const limit = readLimit(rawLimit);
  const tab = (["unread", "received", "sent"] as const).find((t) => t === rawTab) ?? "all";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;

  // Only load what this tab shows, a page at a time.
  const offersTab = tab === "received" || tab === "sent";
  let notesQuery = supabase.from("notifications").select(NOTIFICATION_COLUMNS).eq("user_id", me).order("created_at", { ascending: false });
  if (tab === "unread") notesQuery = notesQuery.is("read_at", null);
  const head = { count: "exact" as const, head: true };
  const [{ data: noteRows, error }, { data: tabOfferRows }, unreadRes, pendingRes, sentRes] = await Promise.all([
    offersTab ? Promise.resolve({ data: [], error: null }) : notesQuery.range(0, limit),
    offersTab
      ? supabase.from("offers").select(OFFER_COLUMNS).eq(tab === "received" ? "seller_id" : "buyer_id", me).order("created_at", { ascending: false }).range(0, limit)
      : Promise.resolve({ data: [] }),
    supabase.from("notifications").select("id", head).eq("user_id", me).is("read_at", null),
    supabase.from("offers").select("id", head).eq("seller_id", me).eq("status", "pending"),
    supabase.from("offers").select("id", head).eq("buyer_id", me),
  ]);
  const notePage = splitPage(noteRows as NotificationRow[], limit);
  const notes = notePage.items;
  const offerPage = splitPage(tabOfferRows as Offer[], limit);
  // Offers mentioned by the notifications on this page.
  const noteOfferIds = [...new Set(notes.map((n) => n.offer_id).filter(Boolean) as string[])];
  const { data: noteOfferRows } = noteOfferIds.length
    ? await supabase.from("offers").select(OFFER_COLUMNS).in("id", noteOfferIds)
    : { data: [] };
  const offers = [...offerPage.items, ...((noteOfferRows ?? []) as Offer[])];
  const offerById = new Map(offers.map((o) => [o.id, o]));
  const received = tab === "received" ? offerPage.items : [];
  const sent = tab === "sent" ? offerPage.items : [];
  const unreadCount = unreadRes.count ?? notes.filter((n) => !n.read_at).length;

  const listingIds = [...new Set([...notes.map((n) => n.listing_id), ...offers.map((o) => o.listing_id)].filter(Boolean) as string[])];
  const personIds = [...new Set([...notes.map((n) => n.actor_id), ...offers.flatMap((o) => [o.buyer_id, o.seller_id])].filter((x): x is string => Boolean(x) && x !== me))];
  const [{ data: listingRows }, { data: peopleRows }] = await Promise.all([
    listingIds.length ? supabase.from("listings").select("id, title, seller_name").in("id", listingIds) : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", personIds) : Promise.resolve({ data: [] }),
  ]);
  const projectIds = [...new Set(notes.map((n) => n.project_id).filter(Boolean) as string[])];
  const { data: projectRows } = projectIds.length ? await supabase.from("projects").select("id, name").in("id", projectIds) : { data: [] };
  const projectName = new Map(((projectRows ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const projectLink = (id: string | null) =>
    id ? <Link href={`/studio/p/${id}`}><b>{projectName.get(id) ?? "your project"}</b></Link> : <b>your project</b>;
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
      case "offer_paid":
        return {
          text: <>{who} confirmed your {amt} payment for {listingLink(n.listing_id)}</>,
          extra: o && <div className="of-item-foot"><span className="st-status active">Paid</span><Link className="btn ghost st-small" href={`/studio/deals/${o.id}`}>View purchase</Link></div>,
        };
      case "offer_withdrawn":
        return { text: <>{who} withdrew their {amt} offer for {listingLink(n.listing_id)}</> };
      case "new_follower":
        return { text: <>{who} started following you</> };
      case "service_active":
        return { text: <>The tsayvish team switched on <b>{n.body?.replace(/ is now active$/, "") || "a service"}</b> for {projectLink(n.project_id)}</> };
      case "service_update":
        return { text: <>Update on {projectLink(n.project_id)} from the tsayvish team</>, extra: n.body && <p className="of-note">{n.body}</p> };
      case "partnership_update":
        return { text: <>Your partnership request {projectLink(n.project_id)} was updated</>, extra: n.body && <p className="of-note">{n.body}</p> };
      case "agreement_proposed":
        return {
          text: <>{who} sent a license agreement for {listingLink(n.listing_id)}</>,
          extra: n.offer_id && <div className="of-item-foot"><Link className="btn st-small" href={`/studio/deals/${n.offer_id}#agreement`}>Review agreement</Link></div>,
        };
      case "agreement_signed":
        return {
          text: <>The license agreement for {listingLink(n.listing_id)} is signed by both sides</>,
          extra: n.offer_id && <div className="of-item-foot"><Link className="btn ghost st-small" href={`/studio/deals/${n.offer_id}/agreement`}>View agreement</Link></div>,
        };
      default:
        return { text: <>{n.body || "Something happened on your account"}</> };
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

  const shown = notes;
  const hasMore = offersTab ? offerPage.hasMore : notePage.hasMore;

  return (
    <div className="st-stack">
      <MarkNotificationsRead me={me} unread={unreadCount} />
      <LiveRefresh table="notifications" filter={`user_id=eq.${me}`} />
      <div className="st-pagehead"><div><h1>Notifications</h1><p className="st-sub">Offers, purchases and new followers.</p></div></div>
      <HubTabs current={tab} tabs={[
        { key: "all", label: "All", href: "/studio/notifications" },
        { key: "unread", label: "Unread", href: "/studio/notifications?tab=unread", count: unreadCount },
        { key: "received", label: "Offers received", href: "/studio/notifications?tab=received", count: pendingRes.count ?? 0 },
        { key: "sent", label: "Offers sent", href: "/studio/notifications?tab=sent", count: sentRes.count ?? 0 },
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
      {hasMore && <MoreLink href={moreHref("/studio/notifications", { tab: tab === "all" ? null : tab }, limit)} />}
    </div>
  );
}
