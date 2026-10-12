import type { Platform } from "./social/platforms";

export const STATUSES = ["idea", "draft", "ready", "scheduled", "posted", "archived"] as const;
export type ContentStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<ContentStatus, string> = {
  idea: "Ideas", draft: "Drafts", ready: "Ready", scheduled: "Scheduled", posted: "Posted", archived: "Archived",
};
export const STATUS_ONE: Record<ContentStatus, string> = {
  idea: "Idea", draft: "Draft", ready: "Ready", scheduled: "Scheduled", posted: "Posted", archived: "Archived",
};
export const FORMAT_LABEL: Record<string, string> = {
  post: "Post", reel: "Reel", short: "Short", story: "Story", carousel: "Carousel", episode: "Episode", other: "Other",
};

export type ContentItem = {
  id: string; project_id: string; title: string; body: string; caption: string; format: string; status: ContentStatus;
  platforms: Platform[]; tags: string[]; media_id: string | null; script_id: string | null; social_post_id: string | null;
  planned_at: string | null; position: number; created_at: string; updated_at: string;
};
export const CONTENT_COLUMNS = "id, project_id, title, body, caption, format, status, platforms, tags, media_id, script_id, social_post_id, planned_at, position, created_at, updated_at";

export type Character = { id: string; name: string; image_url: string | null; canEdit: boolean };
export type CalendarPost = { id: string; project_id: string; caption: string; title: string | null; scheduled_at: string; status: string; platforms: Platform[] };

/** "YYYY-MM-DDTHH:MM" in the viewer's local time, for datetime-local inputs. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
