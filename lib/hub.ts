export type Post = {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  visibility: "public" | "followers";
  status: "draft" | "published";
  project_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};
export const POST_COLUMNS = "id, owner_id, title, body, visibility, status, project_id, created_at, updated_at, published_at";

export const REPORT_REASONS = ["Spam", "Harassment", "Stolen or copied work", "Inappropriate content", "Scam or fraud", "Something else"] as const;
export type ReportTarget = "profile" | "listing" | "post" | "message";
export type ReportRow = {
  id: string;
  target_type: ReportTarget;
  target_id: string;
  target_label: string | null;
  reason: string;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};

export type PromoCode = {
  id: string;
  code: string;
  percent_off: number;
  listing_id: string | null;
  max_uses: number | null;
  expires_on: string | null;
  active: boolean;
  created_at: string;
};

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

/** Where a reported item lives in the app. */
export function reportHref(r: Pick<ReportRow, "target_type" | "target_id">) {
  if (r.target_type === "listing") return `/studio/marketplace/${r.target_id}`;
  if (r.target_type === "post") return `/studio/posts/${r.target_id}`;
  if (r.target_type === "profile") return `/studio/u/${r.target_id}`;
  return null;
}
