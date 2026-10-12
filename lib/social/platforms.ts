// Shared by the browser and the server: what each platform is called and what it accepts.

export type Platform = "instagram" | "facebook" | "youtube" | "tiktok";
export type MediaKind = "image" | "video";

export const PLATFORMS: Platform[] = ["instagram", "facebook", "youtube", "tiktok"];

export const PLATFORM_INFO: Record<Platform, {
  label: string;
  account: string;         // what you connect
  takes: MediaKind[];
  captionMax: number;
  note: string;            // shown when connecting
}> = {
  instagram: {
    label: "Instagram", account: "Professional account", takes: ["image", "video"], captionMax: 2200,
    note: "Needs an Instagram professional (business or creator) account. Videos post as Reels; pictures must be JPEG.",
  },
  facebook: {
    label: "Facebook", account: "Page", takes: ["image", "video"], captionMax: 5000,
    note: "Posts to a Facebook Page you manage.",
  },
  youtube: {
    label: "YouTube", account: "Channel", takes: ["video"], captionMax: 5000,
    note: "Uploads to your channel. Vertical videos under 3 minutes show as Shorts.",
  },
  tiktok: {
    label: "TikTok", account: "Account", takes: ["video"], captionMax: 2200,
    note: "Posts straight to your TikTok profile.",
  },
};

export type TikTokPrivacy = "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
export const TIKTOK_PRIVACY_LABEL: Record<TikTokPrivacy, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};
export type YouTubePrivacy = "public" | "unlisted" | "private";

/** Per-platform choices saved with a post. */
export type PostOptions = {
  aiGenerated?: boolean;                 // label as AI-generated where the platform supports it
  youtube?: { privacy?: YouTubePrivacy; madeForKids?: boolean };
  tiktok?: { privacy?: TikTokPrivacy; allowComments?: boolean; allowDuet?: boolean; allowStitch?: boolean; brandOwn?: boolean; brandPaid?: boolean };
  captions?: Partial<Record<Platform, string>>;  // per-platform caption overrides
};

export const takes = (p: Platform, kind: string) => (PLATFORM_INFO[p].takes as string[]).includes(kind);

/** Why a post can't go to this platform, or "" if it can. */
export function platformProblem(p: Platform, media: { kind: string; mime?: string | null }, caption: string): string {
  const info = PLATFORM_INFO[p];
  if (!takes(p, media.kind)) return `${info.label} only takes videos.`;
  if (p === "instagram" && media.kind === "image" && media.mime && !/jpe?g/i.test(media.mime)) return "Instagram only takes JPEG pictures.";
  if (caption.length > info.captionMax) return `${info.label} captions can be up to ${info.captionMax.toLocaleString("en-US")} characters.`;
  return "";
}

export const TARGET_STATUS_TEXT: Record<string, string> = {
  pending: "Scheduled", publishing: "Posting", processing: "Processing", posted: "Posted", failed: "Failed", canceled: "Canceled",
};
export const POST_STATUS_TEXT: Record<string, string> = {
  scheduled: "Scheduled", publishing: "Posting", posted: "Posted", partial: "Partly posted", failed: "Failed", canceled: "Canceled",
};
