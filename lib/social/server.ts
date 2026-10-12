/*
 * Server-side actions behind the Social page's API routes.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanOptions } from "./options";
import { PLATFORMS, platformProblem, type Platform, type PostOptions, type TikTokPrivacy } from "./platforms";
import { call } from "./http";
import { needsRefresh, refreshTokens, type FacebookPage } from "./oauth";
import { seal, SocialError, unseal, type SocialEnv } from "./secure";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const isPlatform = (p: string): p is Platform => (PLATFORMS as string[]).includes(p);
const UUID = /^[0-9a-f-]{36}$/i;

/** Runs a handler for a signed-in person and turns errors into JSON. */
export async function withSocial(handler: (db: Db, uid: string) => Promise<unknown>) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "You’ve been logged out. Log in again." }, { status: 401 });
    return NextResponse.json(await handler(db, user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const known = e instanceof SocialError;
    if (!known) console.error("[social]", e);
    return NextResponse.json({ error: known ? e.message : "Something went wrong. Try again." }, { status: known ? e.status : 500 });
  }
}

export type CreatePostBody = {
  projectId: string; mediaId: string; caption?: string; title?: string; accountIds: string[];
  scheduledAt?: string | null; options?: PostOptions; contentId?: string | null;
};

/** Validates and saves a post. The file link is signed to outlive the scheduled time. */
export async function createPost(db: Db, body: CreatePostBody) {
  if (!body || !UUID.test(body.projectId ?? "") || !UUID.test(body.mediaId ?? "")) throw new SocialError("Pick something from the library to post.");
  const accountIds = (Array.isArray(body.accountIds) ? body.accountIds : []).filter((x) => UUID.test(String(x))).slice(0, 4);
  if (!accountIds.length) throw new SocialError("Choose at least one account.");
  const caption = String(body.caption ?? "").slice(0, 5000);
  const options = cleanOptions(body.options);
  const when = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
  if (Number.isNaN(when.getTime())) throw new SocialError("That date isn’t valid.");

  const [{ data: media }, { data: accounts }] = await Promise.all([
    db.from("studio_media").select("id, kind, path, mime").eq("id", body.mediaId).eq("project_id", body.projectId).maybeSingle(),
    db.from("social_accounts").select("id, platform, status").eq("project_id", body.projectId).in("id", accountIds),
  ]);
  if (!media) throw new SocialError("That file isn’t in this character’s library.");
  for (const a of (accounts ?? []) as { platform: Platform; status: string }[]) {
    const problem = platformProblem(a.platform, media, options.captions?.[a.platform] ?? caption);
    if (problem) throw new SocialError(problem);
    if (a.status === "reconnect") throw new SocialError(`Reconnect ${a.platform} before posting to it.`);
    if (a.platform === "tiktok" && !options.tiktok?.privacy) throw new SocialError("Choose who can see it on TikTok.");
  }
  if (!(body.title ?? "").trim() && (accounts ?? []).some((a: { platform: string }) => a.platform === "youtube") && !caption.trim()) {
    throw new SocialError("Add a title or caption for YouTube.");
  }

  // Valid until three days after it's due, so retries still work.
  const seconds = Math.ceil((Math.max(when.getTime(), Date.now()) - Date.now()) / 1000) + 3 * 86400;
  const { data: signed, error: signErr } = await db.storage.from("studio-media").createSignedUrl(media.path, seconds);
  if (signErr || !signed?.signedUrl) throw new SocialError("Couldn’t prepare the file. Try again.", { status: 500 });

  const { data: id, error } = await db.rpc("social_create_post", {
    p_project: body.projectId, p_media: body.mediaId, p_media_url: signed.signedUrl, p_caption: caption,
    p_title: (body.title ?? "").slice(0, 100) || null, p_options: options, p_scheduled_at: when.toISOString(), p_accounts: accountIds,
  });
  if (error) throw new SocialError(error.message);
  if (body.contentId && UUID.test(body.contentId)) {
    const { error: linkErr } = await db.rpc("content_link_post", { p_item: body.contentId, p_post: id });
    if (linkErr) console.error("[social] link content", linkErr.message);
  }
  return { id: id as string, now: when.getTime() <= Date.now() + 5_000 };
}

/** Moves a scheduled post to a new time, with a fresh file link that outlives it. */
export async function reschedulePost(db: Db, postId: string, scheduledAt: string) {
  if (!UUID.test(postId)) throw new SocialError("Post not found.", { status: 404 });
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) throw new SocialError("That date isn’t valid.");
  const { data: post } = await db.from("social_posts").select("id, media_id").eq("id", postId).maybeSingle();
  if (!post?.media_id) throw new SocialError("Post not found.", { status: 404 });
  const { data: media } = await db.from("studio_media").select("path").eq("id", post.media_id).maybeSingle();
  if (!media) throw new SocialError("The file for this post was deleted.");
  const seconds = Math.ceil((Math.max(when.getTime(), Date.now()) - Date.now()) / 1000) + 3 * 86400;
  const { data: signed } = await db.storage.from("studio-media").createSignedUrl(media.path, seconds);
  if (!signed?.signedUrl) throw new SocialError("Couldn’t prepare the file. Try again.", { status: 500 });
  const { error } = await db.rpc("social_reschedule", { p_post: postId, p_when: when.toISOString(), p_media_url: signed.signedUrl });
  if (error) throw new SocialError(error.message);
  return { id: postId, scheduledAt: when.toISOString() };
}

/** Encrypted account details, only after checking the person may edit the character. */
export async function accountForEditor(db: Db, pub: Db, env: SocialEnv, accountId: string) {
  if (!UUID.test(accountId)) throw new SocialError("Account not found.", { status: 404 });
  const { data: acct } = await db.from("social_accounts").select("id, project_id, platform").eq("id", accountId).maybeSingle();
  if (!acct) throw new SocialError("Account not found.", { status: 404 });
  const { data: canEdit } = await db.rpc("can_edit_project", { pid: acct.project_id });
  if (canEdit !== true) throw new SocialError("Only the character’s owner or editors can do that.", { status: 403 });
  const { data, error } = await pub.rpc("social_account_secret", { p_secret: env.dbSecret, p_account: accountId });
  if (error) throw new SocialError(error.message, { status: 500 });
  const row = ((data ?? []) as Record<string, string | null>[])[0];
  if (!row) throw new SocialError("Account not found.", { status: 404 });
  return row;
}

/** Facebook: the Pages this connection can post to. */
export function pagesOf(env: SocialEnv, row: Record<string, string | null>): FacebookPage[] {
  const raw = unseal(env, row.choices_enc);
  return raw ? (JSON.parse(raw) as FacebookPage[]) : [];
}

export async function choosePage(pub: Db, env: SocialEnv, row: Record<string, string | null>, pageId: string) {
  const pg = pagesOf(env, row).find((p) => p.id === pageId);
  if (!pg) throw new SocialError("That Page isn’t available. Reconnect Facebook to add it.");
  const { error } = await pub.rpc("social_update_account", {
    p_secret: env.dbSecret, p_account: row.id, p_token_enc: seal(env, pg.token), p_expires_at: null,
    p_external_id: pg.id, p_name: pg.name, p_avatar: pg.avatar,
  });
  if (error) throw new SocialError(error.message, { status: 500 });
  return { id: pg.id, name: pg.name };
}

/** The account's access token, refreshed (and saved) first if it's about to expire. */
async function freshToken(pub: Db, env: SocialEnv, row: Record<string, string | null>) {
  const token = unseal(env, row.token_enc);
  if (!token) throw new SocialError("Reconnect this account.");
  if (!needsRefresh(env, row.platform as Platform, row.expires_at)) return token;
  const fresh = await refreshTokens(env, row.platform as Platform, { token, refresh: unseal(env, row.refresh_enc) });
  await pub.rpc("social_update_account", {
    p_secret: env.dbSecret, p_account: row.id, p_token_enc: seal(env, fresh.token),
    p_refresh_enc: fresh.refresh ? seal(env, fresh.refresh) : null, p_expires_at: fresh.expiresAt?.toISOString() ?? null,
  });
  return fresh.token;
}

/** TikTok: what this creator allows right now (TikTok requires showing these before posting). */
export async function tiktokCreator(pub: Db, env: SocialEnv, row: Record<string, string | null>) {
  const token = await freshToken(pub, env, row);
  const r = await call(env, "TikTok", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: "{}",
  });
  const d = (r.data ?? {}) as Record<string, unknown>;
  return {
    nickname: (d.creator_nickname as string) ?? null,
    username: (d.creator_username as string) ?? null,
    privacyOptions: (d.privacy_level_options as TikTokPrivacy[]) ?? [],
    commentDisabled: !!d.comment_disabled, duetDisabled: !!d.duet_disabled, stitchDisabled: !!d.stitch_disabled,
    maxSeconds: (d.max_video_post_duration_sec as number) ?? null,
  };
}
