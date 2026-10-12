import type { Platform, PostOptions } from "./platforms";

export type SocialAccount = {
  id: string; platform: Platform; external_id: string; name: string | null; handle: string | null; avatar_url: string | null;
  status: "active" | "reconnect"; last_error: string | null; has_choices: boolean; updated_at: string;
};
export const ACCOUNT_COLUMNS = "id, platform, external_id, name, handle, avatar_url, status, last_error, has_choices, updated_at";

export type SocialTarget = {
  id: string; post_id: string; platform: Platform; account_name: string | null; status: string;
  external_url: string | null; error: string | null; posted_at: string | null;
};
export const TARGET_COLUMNS = "id, post_id, platform, account_name, status, external_url, error, posted_at";

export type SocialPost = {
  id: string; media_id: string | null; media_kind: "image" | "video"; media_label: string | null; caption: string; title: string | null;
  options: PostOptions; scheduled_at: string; status: string; created_at: string;
};
export const POST_COLUMNS = "id, media_id, media_kind, media_label, caption, title, options, scheduled_at, status, created_at";

export type PostableMedia = { id: string; kind: "image" | "video"; label: string | null; mime: string | null; url: string | null; duration_ms: number | null };
