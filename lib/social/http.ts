import { SocialError, type SocialEnv } from "./secure";

export const GRAPH_VERSION = "v25.0";

type Json = Record<string, unknown>;

/** Pulls a readable message out of the many error shapes the platforms use. */
export function platformMessage(body: unknown): string {
  const b = (body ?? {}) as Json;
  const err = b.error as Json | string | undefined;
  if (typeof err === "string") return String(b.error_description || err);
  if (err && typeof err === "object") {
    if (err.code === "ok") return "";
    const m = err.error_user_msg || err.message || err.code;
    if (m) return String(m);
  }
  return String(b.error_description || b.message || "");
}

/** Fetch + JSON with platform errors turned into SocialError (reconnect / retry flags set sensibly). */
export async function call(env: SocialEnv, label: string, url: string, init: RequestInit = {}): Promise<Json> {
  const f = env.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(url, init);
  } catch {
    throw new SocialError(`Couldn’t reach ${label}. Will try again.`, { retry: true, status: 502 });
  }
  const text = await res.text();
  let body: Json = {};
  try { body = text ? (JSON.parse(text) as Json) : {}; } catch { body = { message: text.slice(0, 200) }; }
  const tiktokError = body.error && typeof body.error === "object" && (body.error as Json).code && (body.error as Json).code !== "ok";
  if (!res.ok || tiktokError) {
    const msg = platformMessage(body) || `${label} said ${res.status}`;
    const code = (body.error as Json | undefined)?.code;
    const reconnect = res.status === 401 || code === 190 || code === "access_token_invalid" || code === "scope_not_authorized"
      || body.error === "invalid_grant";
    const retry = res.status === 429 || res.status >= 500 || code === "rate_limit_exceeded";
    throw new SocialError(`${label}: ${msg}`.slice(0, 480), { reconnect, retry, status: res.status });
  }
  return body;
}

export const form = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) p.set(k, String(v));
  return p;
};

export const qs = (o: Record<string, string | number | boolean | undefined | null>) => form(o).toString();

/** Downloads the post's file (for platforms that need the bytes, not a link). */
export async function download(env: SocialEnv, url: string, maxBytes = 250 * 1024 * 1024) {
  const f = env.fetch ?? fetch;
  let res: Response;
  try { res = await f(url); } catch { throw new SocialError("Couldn’t read the video file. Will try again.", { retry: true }); }
  if (!res.ok) throw new SocialError(res.status === 400 || res.status === 404 ? "The file was deleted or its link expired." : "Couldn’t read the video file.", { retry: res.status >= 500 });
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new SocialError("That file is too big to post (250 MB max).");
  return { bytes: buf, type: res.headers.get("content-type") || "video/mp4" };
}
