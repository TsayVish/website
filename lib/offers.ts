export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn";
export type Offer = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  message: string | null;
  status: OfferStatus;
  created_at: string;
  responded_at: string | null;
};
export const OFFER_COLUMNS = "id, listing_id, buyer_id, seller_id, amount, message, status, created_at, responded_at";

export type NotificationType = "offer_received" | "offer_accepted" | "offer_declined" | "offer_withdrawn" | "new_follower";
export type NotificationRow = {
  id: string;
  type: NotificationType;
  actor_id: string | null;
  offer_id: string | null;
  listing_id: string | null;
  read_at: string | null;
  created_at: string;
};
export const NOTIFICATION_COLUMNS = "id, type, actor_id, offer_id, listing_id, read_at, created_at";

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  pending: "Pending", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn",
};
/** Maps to the shared status-pill colors. */
export const OFFER_STATUS_CLASS: Record<OfferStatus, string> = {
  pending: "requested", accepted: "active", declined: "off", withdrawn: "off",
};

export const money = (n: number | string) =>
  Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number(n) % 1 ? 2 : 0 });

/** "2h ago", "Yesterday", "Oct 3". */
export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A first message for the chat about an offer, so the other person sees what it's about. */
export const offerDraft = (title: string, amount: number) => `Hi! About the ${money(amount)} offer on “${title}”: `;

/** ago() for use mid-sentence ("Sent just now"). */
export const agoInline = (iso: string) => {
  const a = ago(iso);
  return a === "Just now" || a === "Yesterday" ? a.toLowerCase() : a;
};
