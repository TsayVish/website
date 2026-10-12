/*
 * The publisher: claims deliveries that are due, refreshes tokens when needed, runs one
 * step for each and records the result. Runs from the scheduler (every minute) and right
 * after someone presses "Post now".
 */
import type { Platform, PostOptions } from "./platforms";
import { needsRefresh, refreshTokens } from "./oauth";
import { step, type StepResult } from "./publish";
import { seal, SocialError, unseal, type SocialEnv } from "./secure";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

type Claimed = {
  target_id: string; post_id: string; platform: Platform; status: string; state: Record<string, unknown> | null; attempts: number;
  account_id: string | null; external_id: string | null; handle: string | null; token_enc: string | null; refresh_enc: string | null; expires_at: string | null;
  media_kind: "image" | "video"; media_url: string; media_mime: string | null; media_bytes: number | null;
  caption: string; title: string | null; options: PostOptions | null;
};

const MAX_TRIES = 5;
const LABEL: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };

async function report(db: Db, env: SocialEnv, id: string, status: "posted" | "processing" | "retry" | "failed",
  extra: { state?: Record<string, unknown>; externalId?: string; url?: string | null; error?: string; retryIn?: number } = {}) {
  const { error } = await db.rpc("social_report", {
    p_secret: env.dbSecret, p_target: id, p_status: status, p_state: extra.state ?? null, p_external_id: extra.externalId ?? null,
    p_url: extra.url ?? null, p_error: extra.error ?? null, p_retry_seconds: extra.retryIn ?? 60,
  });
  if (error) console.error("[social] report", error.message);
}

/** Runs one delivery. Exported for tests. */
export async function runOne(db: Db, env: SocialEnv, c: Claimed): Promise<StepResult | { status: "retry"; error: string }> {
  if (!c.account_id || !c.token_enc || !c.external_id) {
    const r = { status: "failed" as const, error: `The ${LABEL[c.platform]} account was disconnected.` };
    await report(db, env, c.target_id, "failed", { error: r.error });
    return r;
  }
  try {
    let token = unseal(env, c.token_enc)!;
    if (needsRefresh(env, c.platform, c.expires_at)) {
      const fresh = await refreshTokens(env, c.platform, { token, refresh: unseal(env, c.refresh_enc), expiresAt: c.expires_at ? new Date(c.expires_at) : null });
      token = fresh.token;
      const { error } = await db.rpc("social_update_account", {
        p_secret: env.dbSecret, p_account: c.account_id, p_token_enc: seal(env, fresh.token),
        p_refresh_enc: fresh.refresh ? seal(env, fresh.refresh) : null, p_expires_at: fresh.expiresAt?.toISOString() ?? null,
      });
      if (error) console.error("[social] save refreshed token", error.message);
    }
    const result = await step(env, {
      platform: c.platform, externalId: c.external_id, handle: c.handle, token,
      media: { kind: c.media_kind, url: c.media_url, mime: c.media_mime, bytes: c.media_bytes },
      caption: c.caption ?? "", title: c.title, options: c.options ?? {}, state: c.state ?? {},
    });
    if (result.status === "posted") await report(db, env, c.target_id, "posted", { externalId: result.externalId, url: result.url });
    else if (result.status === "processing") await report(db, env, c.target_id, "processing", { state: result.state, retryIn: result.retryIn });
    else await report(db, env, c.target_id, "failed", { error: result.error });
    return result;
  } catch (e) {
    const err = e instanceof SocialError ? e : new SocialError("Something went wrong while posting.", { retry: true });
    if (!(e instanceof SocialError)) console.error("[social] step", e);
    if (err.reconnect) {
      const msg = `Sign in to ${LABEL[c.platform]} again to keep posting.`;
      await db.rpc("social_update_account", { p_secret: env.dbSecret, p_account: c.account_id, p_reconnect_error: err.message });
      await report(db, env, c.target_id, "failed", { error: msg });
      return { status: "failed", error: msg };
    }
    if (err.retry && c.attempts < MAX_TRIES) {
      await report(db, env, c.target_id, "retry", { error: err.message, retryIn: 60 * 2 ** Math.min(c.attempts, 5) });
      return { status: "retry", error: err.message };
    }
    await report(db, env, c.target_id, "failed", { error: err.message });
    return { status: "failed", error: err.message };
  }
}

/** Claims and runs due deliveries until the time budget runs out. Returns how many it handled. */
export async function runPublisher(db: Db, env: SocialEnv, opts: { postId?: string; limit?: number; budgetMs?: number } = {}) {
  if (!env.dbSecret || !env.tokenKey) throw new SocialError("Social posting isn’t set up yet.", { status: 503 });
  const started = env.now?.() ?? Date.now();
  const budget = opts.budgetMs ?? 240_000;
  let handled = 0;
  while ((env.now?.() ?? Date.now()) - started < budget) {
    const { data, error } = await db.rpc("social_claim", { p_secret: env.dbSecret, p_limit: opts.limit ?? 5, p_post: opts.postId ?? null });
    if (error) throw new SocialError(error.message, { status: 500 });
    const rows = (data ?? []) as Claimed[];
    if (!rows.length) break;
    for (const c of rows) {
      await runOne(db, env, c);
      handled++;
    }
    if (opts.postId) break;
  }
  return handled;
}
