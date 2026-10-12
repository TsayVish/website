/*
 * One step of sending a post to one platform. Platforms that process media in the
 * background (Instagram, TikTok) take several steps; the state between them is saved
 * on the delivery, and the publisher calls step() again until it's posted or fails.
 */
import type { Platform, PostOptions, TikTokPrivacy } from "./platforms";
import { call, download, form, GRAPH_VERSION } from "./http";
import { SocialError, type SocialEnv } from "./secure";

export type Job = {
  platform: Platform;
  externalId: string;             // IG user id, Page id, channel id, TikTok open_id
  handle?: string | null;
  token: string;
  media: { kind: "image" | "video"; url: string; mime?: string | null; bytes?: number | null };
  caption: string;
  title?: string | null;
  options: PostOptions;
  state: Record<string, unknown>;
};

export type StepResult =
  | { status: "posted"; externalId: string; url: string | null }
  | { status: "processing"; state: Record<string, unknown>; retryIn: number }
  | { status: "failed"; error: string };

const now = (env: SocialEnv) => env.now?.() ?? Date.now();
const captionFor = (job: Job) => (job.options.captions?.[job.platform] ?? job.caption ?? "").trim();
const gaveUp = (env: SocialEnv, job: Job, minutes: number) => now(env) - Number(job.state.since ?? now(env)) > minutes * 60_000;

export async function step(env: SocialEnv, job: Job): Promise<StepResult> {
  switch (job.platform) {
    case "instagram": return instagram(env, job);
    case "facebook": return facebook(env, job);
    case "youtube": return youtube(env, job);
    case "tiktok": return tiktok(env, job);
  }
}

// ── Instagram: create a container, wait for it to finish, then publish ──
async function instagram(env: SocialEnv, job: Job): Promise<StepResult> {
  const base = `https://graph.instagram.com/${GRAPH_VERSION}`;
  const container = job.state.container as string | undefined;
  if (!container) {
    const params = job.media.kind === "video"
      ? { media_type: "REELS", video_url: job.media.url, caption: captionFor(job), share_to_feed: "true" }
      : { image_url: job.media.url, caption: captionFor(job) };
    const r = await call(env, "Instagram", `${base}/${job.externalId}/media`, { method: "POST", body: form({ ...params, access_token: job.token }) });
    return { status: "processing", state: { container: String(r.id), since: now(env) }, retryIn: job.media.kind === "video" ? 30 : 5 };
  }
  const s = await call(env, "Instagram", `${base}/${container}?fields=status_code,status&access_token=${encodeURIComponent(job.token)}`);
  const code = String(s.status_code ?? "");
  if (code === "IN_PROGRESS") {
    if (gaveUp(env, job, 20)) return { status: "failed", error: "Instagram took too long to process the video." };
    return { status: "processing", state: job.state, retryIn: 30 };
  }
  if (code !== "FINISHED") return { status: "failed", error: `Instagram couldn’t use this file${s.status ? `: ${s.status}` : "."}` };
  const pub = await call(env, "Instagram", `${base}/${job.externalId}/media_publish`, { method: "POST", body: form({ creation_id: container, access_token: job.token }) });
  const id = String(pub.id);
  const link = await call(env, "Instagram", `${base}/${id}?fields=permalink&access_token=${encodeURIComponent(job.token)}`).catch(() => ({} as Record<string, unknown>));
  return { status: "posted", externalId: id, url: (link.permalink as string) || null };
}

// ── Facebook Page: one call; Facebook fetches the file itself ──
async function facebook(env: SocialEnv, job: Job): Promise<StepResult> {
  if (job.media.kind === "video") {
    const r = await call(env, "Facebook", `https://graph-video.facebook.com/${GRAPH_VERSION}/${job.externalId}/videos`, {
      method: "POST",
      body: form({ file_url: job.media.url, description: captionFor(job), title: job.title || undefined, access_token: job.token }),
    });
    return { status: "posted", externalId: String(r.id), url: `https://www.facebook.com/${job.externalId}/videos/${r.id}` };
  }
  const r = await call(env, "Facebook", `https://graph.facebook.com/${GRAPH_VERSION}/${job.externalId}/photos`, {
    method: "POST", body: form({ url: job.media.url, message: captionFor(job), access_token: job.token }),
  });
  const id = String(r.post_id || r.id);
  return { status: "posted", externalId: id, url: `https://www.facebook.com/${id}` };
}

// ── YouTube: resumable upload of the bytes ──
export function youtubeTitle(job: Pick<Job, "title" | "caption">) {
  const t = (job.title || job.caption.split("\n")[0] || "").replace(/[<>]/g, "").trim();
  return (t || "New video").slice(0, 100);
}

async function youtube(env: SocialEnv, job: Job): Promise<StepResult> {
  const f = env.fetch ?? fetch;
  const file = await download(env, job.media.url);
  const type = job.media.mime || file.type || "video/mp4";
  const meta = {
    snippet: { title: youtubeTitle(job), description: captionFor(job).replace(/[<>]/g, "").slice(0, 5000), categoryId: "24" },
    status: {
      privacyStatus: job.options.youtube?.privacy ?? "public",
      selfDeclaredMadeForKids: job.options.youtube?.madeForKids ?? false,
      containsSyntheticMedia: job.options.aiGenerated ?? true,
    },
  };
  let init: Response;
  try {
    init = await f("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${job.token}`, "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": type, "X-Upload-Content-Length": String(file.bytes.byteLength),
      },
      body: JSON.stringify(meta),
    });
  } catch {
    throw new SocialError("Couldn’t reach YouTube. Will try again.", { retry: true });
  }
  const location = init.headers.get("location");
  if (!init.ok || !location) {
    const body = await init.json().catch(() => ({}));
    const msg = (body as { error?: { message?: string } }).error?.message ?? `status ${init.status}`;
    throw new SocialError(`YouTube: ${msg}`, { reconnect: init.status === 401, retry: init.status >= 500 || init.status === 429 });
  }
  const up = await call(env, "YouTube", location, { method: "PUT", headers: { "Content-Type": type }, body: file.bytes as unknown as BodyInit });
  const id = String(up.id);
  return { status: "posted", externalId: id, url: `https://youtu.be/${id}` };
}

// ── TikTok: check what the creator allows, upload the bytes, then wait for TikTok to publish ──
/** TikTok's chunk rules: 5–64 MB chunks, the last may be bigger; files up to 64 MB go in one piece. */
export function tiktokChunks(size: number) {
  const MB = 1024 * 1024;
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

async function tiktok(env: SocialEnv, job: Job): Promise<StepResult> {
  const api = "https://open.tiktokapis.com/v2/post/publish";
  const headers = { Authorization: `Bearer ${job.token}`, "Content-Type": "application/json; charset=UTF-8" };
  const publishId = job.state.publish_id as string | undefined;

  if (publishId) {
    const r = await call(env, "TikTok", `${api}/status/fetch/`, { method: "POST", headers, body: JSON.stringify({ publish_id: publishId }) });
    const d = (r.data ?? {}) as { status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] };
    if (d.status === "PUBLISH_COMPLETE") {
      const id = d.publicaly_available_post_id?.[0];
      const handle = job.handle?.replace(/^@/, "");
      return { status: "posted", externalId: String(id ?? publishId), url: id && handle ? `https://www.tiktok.com/@${handle}/video/${id}` : null };
    }
    if (d.status === "FAILED") return { status: "failed", error: `TikTok couldn’t publish it${d.fail_reason ? ` (${d.fail_reason})` : ""}.` };
    if (gaveUp(env, job, 30)) return { status: "failed", error: "TikTok took too long to publish the video." };
    return { status: "processing", state: job.state, retryIn: 20 };
  }

  const ci = await call(env, "TikTok", `${api}/creator_info/query/`, { method: "POST", headers, body: "{}" });
  const creator = (ci.data ?? {}) as {
    privacy_level_options?: TikTokPrivacy[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean;
  };
  const o = job.options.tiktok ?? {};
  const privacy = o.privacy;
  if (!privacy || !(creator.privacy_level_options ?? []).includes(privacy)) {
    return { status: "failed", error: `Choose who can see it on TikTok. Allowed right now: ${(creator.privacy_level_options ?? []).join(", ") || "none"}.` };
  }
  const file = await download(env, job.media.url);
  const size = file.bytes.byteLength;
  const { chunkSize, count } = tiktokChunks(size);
  const init = await call(env, "TikTok", `${api}/video/init/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      post_info: {
        title: captionFor(job).slice(0, 2200),
        privacy_level: privacy,
        disable_comment: o.allowComments === false || !!creator.comment_disabled,
        disable_duet: o.allowDuet === false || !!creator.duet_disabled,
        disable_stitch: o.allowStitch === false || !!creator.stitch_disabled,
        brand_content_toggle: !!o.brandPaid,
        brand_organic_toggle: !!o.brandOwn,
        is_aigc: job.options.aiGenerated ?? true,
      },
      source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: count },
    }),
  });
  const data = (init.data ?? {}) as { publish_id?: string; upload_url?: string };
  if (!data.publish_id || !data.upload_url) return { status: "failed", error: "TikTok didn’t accept the upload." };
  const f = env.fetch ?? fetch;
  const type = /quicktime|webm/.test(job.media.mime ?? "") ? job.media.mime! : "video/mp4";
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = i === count - 1 ? size : start + chunkSize;
    const res = await f(data.upload_url, {
      method: "PUT",
      headers: { "Content-Type": type, "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${size}` },
      body: file.bytes.subarray(start, end) as unknown as BodyInit,
    }).catch(() => null);
    if (!res || !res.ok) throw new SocialError("Uploading to TikTok failed. Will try again.", { retry: true });
  }
  return { status: "processing", state: { publish_id: data.publish_id, since: now(env) }, retryIn: 15 };
}
