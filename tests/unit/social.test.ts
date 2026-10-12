import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanOptions } from "../../lib/social/options.ts";
import { platformProblem } from "../../lib/social/platforms.ts";
import { authorizeUrl, exchangeCode, needsRefresh, refreshTokens } from "../../lib/social/oauth.ts";
import { step, tiktokChunks, youtubeTitle, type Job } from "../../lib/social/publish.ts";
import { bearerOk, readState, seal, signState, SocialError, unseal, type SocialEnv } from "../../lib/social/secure.ts";
import { runOne } from "../../lib/social/worker.ts";

type Call = { url: string; method: string; body: string; headers: Record<string, string> };

/** A fake internet: routes are matched by "METHOD urlprefix"; every request is recorded. */
function fakeNet(routes: Record<string, (c: Call) => { status?: number; json?: unknown; text?: string; headers?: Record<string, string>; bytes?: number }>) {
  const calls: Call[] = [];
  const f = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const body = init.body instanceof URLSearchParams ? init.body.toString() : typeof init.body === "string" ? init.body : init.body ? `[bytes:${(init.body as Uint8Array).byteLength}]` : "";
    const c = { url, method, body, headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)) };
    calls.push(c);
    const key = Object.keys(routes).filter((k) => { const [m, u] = k.split(" "); return m === method && url.startsWith(u); }).sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response(JSON.stringify({ error: { message: `no route ${method} ${url}` } }), { status: 404 });
    const r = routes[key](c);
    if (r.bytes != null) return new Response(new Uint8Array(r.bytes), { status: r.status ?? 200, headers: { "content-type": "video/mp4" } });
    return new Response(r.text ?? JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  return { f, calls };
}

const T0 = Date.UTC(2026, 9, 12, 12);
const baseEnv = (f?: typeof fetch, now = T0): SocialEnv => ({
  tokenKey: "a-long-enough-test-key-1234567890", dbSecret: "db", cronSecret: "cron", siteUrl: "https://tsayvish.com",
  meta: { appId: "meta", appSecret: "metasecret" }, instagram: { appId: "ig", appSecret: "igsecret" },
  google: { clientId: "g", clientSecret: "gsecret" }, tiktok: { clientKey: "tk", clientSecret: "tksecret" },
  fetch: f, now: () => now,
});

const job = (over: Partial<Job>): Job => ({
  platform: "instagram", externalId: "IG1", token: "tok", handle: null,
  media: { kind: "video", url: "https://files/clip.mp4", mime: "video/mp4", bytes: 1000 },
  caption: "Hello", title: null, options: cleanOptions({ tiktok: { privacy: "SELF_ONLY" } }), state: {}, ...over,
});

test("tokens are encrypted and tamper-proof", () => {
  const env = baseEnv();
  const s = seal(env, "secret-token");
  assert.match(s, /^v1\./);
  assert.ok(!s.includes("secret-token"));
  assert.equal(unseal(env, s), "secret-token");
  assert.notEqual(seal(env, "secret-token"), s, "random IV");
  const bad = s.slice(0, -4) + (s.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.throws(() => unseal(env, bad), (e: unknown) => e instanceof SocialError && e.reconnect);
  assert.throws(() => unseal({ ...env, tokenKey: "another-long-enough-key-0000000" }, s), /SOCIAL_TOKEN_KEY/);
  assert.throws(() => seal({ ...env, tokenKey: "short" }, "x"), /isn’t set up/);
});

test("OAuth state is signed and expires", () => {
  const env = baseEnv();
  const st = signState(env, { u: "user", p: "proj", pl: "tiktok", n: "nonce" });
  assert.deepEqual({ ...readState(env, st), e: 0 }, { u: "user", p: "proj", pl: "tiktok", n: "nonce", e: 0 });
  const [body] = st.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "evil", p: "proj", pl: "tiktok", n: "nonce", e: T0 + 1e6 })).toString("base64url");
  assert.throws(() => readState(env, `${forged}.${st.split(".")[1]}`), /isn’t valid/);
  assert.throws(() => readState(env, body), /isn’t valid/);
  assert.throws(() => readState(baseEnv(undefined, T0 + 16 * 60_000), st), /too long/);
  assert.ok(bearerOk("Bearer cron", "cron"));
  assert.ok(!bearerOk("Bearer nope", "cron") && !bearerOk(null, "cron") && !bearerOk("Bearer cron", undefined));
});

test("platform rules, options and helpers", () => {
  assert.equal(platformProblem("tiktok", { kind: "image" }, ""), "TikTok only takes videos.");
  assert.equal(platformProblem("instagram", { kind: "image", mime: "image/png" }, ""), "Instagram only takes JPEG pictures.");
  assert.equal(platformProblem("instagram", { kind: "image", mime: "image/jpeg" }, ""), "");
  assert.match(platformProblem("instagram", { kind: "video" }, "x".repeat(2201)), /2,200/);
  const o = cleanOptions({ aiGenerated: "yes", youtube: { privacy: "secret" }, tiktok: { privacy: "SELF_ONLY", allowDuet: false, junk: 1 }, captions: { tiktok: " hi ", bogus: "x" } });
  assert.equal(o.aiGenerated, true);
  assert.equal(o.youtube?.privacy, "public");
  assert.deepEqual(o.tiktok, { privacy: "SELF_ONLY", allowComments: true, allowDuet: false, allowStitch: true, brandOwn: false, brandPaid: false });
  assert.deepEqual(o.captions, { tiktok: " hi " });
  assert.equal(cleanOptions({ aiGenerated: false }).aiGenerated, false);
  assert.deepEqual(tiktokChunks(3_000_000), { chunkSize: 3_000_000, count: 1 });
  assert.deepEqual(tiktokChunks(100 * 1024 * 1024), { chunkSize: 10 * 1024 * 1024, count: 10 });
  assert.equal(youtubeTitle({ title: null, caption: "First line <b>\nsecond" }), "First line b");
  assert.equal(youtubeTitle({ title: "", caption: "" }), "New video");
  assert.ok(authorizeUrl(baseEnv(), "youtube", "https://tsayvish.com/api/social/callback/youtube", "S").includes("access_type=offline"));
  assert.ok(authorizeUrl(baseEnv(), "tiktok", "https://r", "S").includes("scope=user.info.basic%2Cuser.info.profile%2Cvideo.publish"));
  assert.ok(needsRefresh(baseEnv(), "youtube", new Date(T0 + 60_000)));
  assert.ok(!needsRefresh(baseEnv(), "youtube", new Date(T0 + 3600_000)));
  assert.ok(needsRefresh(baseEnv(), "instagram", new Date(T0 + 5 * 864e5)));
  assert.ok(!needsRefresh(baseEnv(), "facebook", new Date(T0)));
});

test("Instagram: container, wait, publish", async () => {
  let status = "IN_PROGRESS";
  const { f, calls } = fakeNet({
    "POST https://graph.instagram.com/v25.0/IG1/media_publish": () => ({ json: { id: "M1" } }),
    "POST https://graph.instagram.com/v25.0/IG1/media": () => ({ json: { id: "C1" } }),
    "GET https://graph.instagram.com/v25.0/C1": () => ({ json: { status_code: status } }),
    "GET https://graph.instagram.com/v25.0/M1": () => ({ json: { permalink: "https://www.instagram.com/reel/abc/" } }),
  });
  const env = baseEnv(f);
  const r1 = await step(env, job({}));
  assert.equal(r1.status, "processing");
  assert.match(calls[0].body, /media_type=REELS/);
  assert.match(calls[0].body, /video_url=https%3A%2F%2Ffiles%2Fclip.mp4/);
  const state = (r1 as { state: Record<string, unknown> }).state;
  assert.equal((await step(env, job({ state }))).status, "processing");
  status = "FINISHED";
  assert.deepEqual(await step(env, job({ state })), { status: "posted", externalId: "M1", url: "https://www.instagram.com/reel/abc/" });
  status = "ERROR";
  assert.equal((await step(env, job({ state }))).status, "failed");
  status = "IN_PROGRESS";
  assert.equal((await step(baseEnv(f, T0 + 25 * 60_000), job({ state }))).status, "failed", "gives up after 20 minutes");
});

test("Facebook: video by link, photo with message", async () => {
  const { f, calls } = fakeNet({
    "POST https://graph-video.facebook.com/v25.0/PG/videos": () => ({ json: { id: "V9" } }),
    "POST https://graph.facebook.com/v25.0/PG/photos": () => ({ json: { id: "P1", post_id: "PG_P1" } }),
  });
  const env = baseEnv(f);
  assert.deepEqual(await step(env, job({ platform: "facebook", externalId: "PG" })), { status: "posted", externalId: "V9", url: "https://www.facebook.com/PG/videos/V9" });
  assert.match(calls[0].body, /file_url=/);
  const r = await step(env, job({ platform: "facebook", externalId: "PG", media: { kind: "image", url: "https://files/a.jpg", mime: "image/jpeg" } }));
  assert.deepEqual(r, { status: "posted", externalId: "PG_P1", url: "https://www.facebook.com/PG_P1" });
  assert.match(calls[1].body, /message=Hello/);
});

test("YouTube: resumable upload marked as synthetic media", async () => {
  const { f, calls } = fakeNet({
    "GET https://files/": () => ({ bytes: 2048 }),
    "POST https://www.googleapis.com/upload/youtube/v3/videos": () => ({ json: {}, headers: { location: "https://upload.example/session1" } }),
    "PUT https://upload.example/session1": () => ({ json: { id: "YT1" } }),
  });
  const r = await step(baseEnv(f), job({ platform: "youtube", externalId: "CH", title: "Bear day", options: cleanOptions({ youtube: { privacy: "unlisted" } }) }));
  assert.deepEqual(r, { status: "posted", externalId: "YT1", url: "https://youtu.be/YT1" });
  const meta = JSON.parse(calls[1].body);
  assert.equal(meta.snippet.title, "Bear day");
  assert.deepEqual(meta.status, { privacyStatus: "unlisted", selfDeclaredMadeForKids: false, containsSyntheticMedia: true });
  assert.equal(calls[1].headers["X-Upload-Content-Length"], "2048");
  assert.equal(calls[2].body, "[bytes:2048]");
});

test("TikTok: honors creator options, uploads, then waits for publish", async () => {
  let pub = "PROCESSING_UPLOAD";
  const { f, calls } = fakeNet({
    "POST https://open.tiktokapis.com/v2/post/publish/creator_info/query/": () => ({ json: { data: { privacy_level_options: ["SELF_ONLY"], duet_disabled: true }, error: { code: "ok" } } }),
    "GET https://files/": () => ({ bytes: 4096 }),
    "POST https://open.tiktokapis.com/v2/post/publish/video/init/": () => ({ json: { data: { publish_id: "PUB1", upload_url: "https://up.tiktok/x" }, error: { code: "ok" } } }),
    "PUT https://up.tiktok/x": () => ({ json: {} }),
    "POST https://open.tiktokapis.com/v2/post/publish/status/fetch/": () => ({ json: { data: { status: pub, publicaly_available_post_id: pub === "PUBLISH_COMPLETE" ? [777] : [] }, error: { code: "ok" } } }),
  });
  const env = baseEnv(f);
  const j = job({ platform: "tiktok", externalId: "OPEN", handle: "@mango" });
  const r1 = await step(env, j);
  assert.equal(r1.status, "processing");
  const init = JSON.parse(calls.find((c) => c.url.endsWith("/video/init/"))!.body);
  assert.equal(init.post_info.privacy_level, "SELF_ONLY");
  assert.equal(init.post_info.disable_duet, true, "creator's own setting wins");
  assert.equal(init.post_info.is_aigc, true);
  assert.deepEqual(init.source_info, { source: "FILE_UPLOAD", video_size: 4096, chunk_size: 4096, total_chunk_count: 1 });
  assert.equal(calls.find((c) => c.method === "PUT")!.headers["Content-Range"], "bytes 0-4095/4096");
  const state = (r1 as { state: Record<string, unknown> }).state;
  assert.equal((await step(env, job({ ...j, state }))).status, "processing");
  pub = "PUBLISH_COMPLETE";
  assert.deepEqual(await step(env, job({ ...j, state })), { status: "posted", externalId: "777", url: "https://www.tiktok.com/@mango/video/777" });
  pub = "FAILED";
  assert.equal((await step(env, job({ ...j, state }))).status, "failed");
  // a privacy level the creator can't use is refused before uploading
  const r2 = await step(env, job({ ...j, options: cleanOptions({ tiktok: { privacy: "PUBLIC_TO_EVERYONE" } }) }));
  assert.equal(r2.status, "failed");
  assert.match((r2 as { error: string }).error, /Allowed right now: SELF_ONLY/);
});

test("platform errors: expired token means reconnect, 5xx means retry", async () => {
  const { f } = fakeNet({
    "POST https://graph.instagram.com/v25.0/IG1/media": () => ({ status: 400, json: { error: { message: "Error validating access token", code: 190 } } }),
    "POST https://graph-video.facebook.com/v25.0/PG/videos": () => ({ status: 503, json: { error: { message: "busy" } } }),
  });
  await assert.rejects(step(baseEnv(f), job({})), (e: unknown) => e instanceof SocialError && e.reconnect && /access token/.test(e.message));
  await assert.rejects(step(baseEnv(f), job({ platform: "facebook", externalId: "PG" })), (e: unknown) => e instanceof SocialError && e.retry);
});

test("connect: Facebook keeps every Page; YouTube needs a channel and offline access", async () => {
  const { f } = fakeNet({
    "GET https://graph.facebook.com/v25.0/oauth/access_token": (c) => ({ json: { access_token: c.url.includes("fb_exchange_token") ? "LONG" : "SHORT", expires_in: 5000000 } }),
    "GET https://graph.facebook.com/v25.0/me/accounts": () => ({ json: { data: [
      { id: "1", name: "Bear Page", access_token: "PT1", picture: { data: { url: "https://pic/1" } } },
      { id: "2", name: "Duck Page", access_token: "PT2" }] } }),
    "POST https://oauth2.googleapis.com/token": () => ({ json: { access_token: "GA", expires_in: 3599, refresh_token: "GR" } }),
    "GET https://www.googleapis.com/youtube/v3/channels": () => ({ json: { items: [{ id: "UC1", snippet: { title: "Bear TV", customUrl: "@beartv" } }] } }),
  });
  const env = baseEnv(f);
  const fb = await exchangeCode(env, "facebook", "code", "https://r");
  assert.equal(fb.externalId, "1");
  assert.equal(fb.tokens.token, "PT1");
  assert.equal(fb.pages?.length, 2);
  const yt = await exchangeCode(env, "youtube", "code", "https://r");
  assert.deepEqual([yt.externalId, yt.handle, yt.tokens.refresh], ["UC1", "@beartv", "GR"]);
  assert.equal(yt.tokens.expiresAt?.getTime(), T0 + 3599_000);
  const r = await refreshTokens(env, "youtube", { token: "old", refresh: "GR" });
  assert.equal(r.refresh, "GR");
  const { f: f2 } = fakeNet({ "POST https://oauth2.googleapis.com/token": () => ({ status: 400, json: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }) });
  await assert.rejects(refreshTokens(baseEnv(f2), "youtube", { token: "old", refresh: "GR" }), (e: unknown) => e instanceof SocialError && e.reconnect);
});

test("publisher: refreshes tokens, records results, flags reconnects", async () => {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const db = { rpc: async (fn: string, args: Record<string, unknown>) => { rpcs.push({ fn, args }); return { data: null, error: null }; } };
  const { f } = fakeNet({
    "POST https://open.tiktokapis.com/v2/oauth/token/": () => ({ json: { access_token: "NEW", refresh_token: "R2", expires_in: 86400 } }),
    "POST https://open.tiktokapis.com/v2/post/publish/creator_info/query/": (c) => (c.headers.Authorization === "Bearer NEW"
      ? { json: { data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } } }
      : { status: 401, json: { error: { code: "access_token_invalid", message: "expired" } } }),
    "GET https://files/": () => ({ bytes: 10 }),
    "POST https://open.tiktokapis.com/v2/post/publish/video/init/": () => ({ json: { data: { publish_id: "P", upload_url: "https://up/x" }, error: { code: "ok" } } }),
    "PUT https://up/x": () => ({ json: {} }),
  });
  const env = baseEnv(f);
  const row = {
    target_id: "T1", post_id: "P1", platform: "tiktok" as const, status: "publishing", state: {}, attempts: 1,
    account_id: "A1", external_id: "OPEN", handle: "@m", token_enc: seal(env, "OLD"), refresh_enc: seal(env, "R1"), expires_at: new Date(T0 + 60_000).toISOString(),
    media_kind: "video" as const, media_url: "https://files/c.mp4", media_mime: "video/mp4", media_bytes: 10,
    caption: "hi", title: null, options: cleanOptions({ tiktok: { privacy: "SELF_ONLY" } }),
  };
  const r = await runOne(db, env, row);
  assert.equal(r.status, "processing");
  const saved = rpcs.find((x) => x.fn === "social_update_account")!;
  assert.equal(unseal(env, saved.args.p_token_enc as string), "NEW");
  assert.equal(rpcs.at(-1)!.args.p_status, "processing");

  rpcs.length = 0;
  const r2 = await runOne(db, env, { ...row, token_enc: seal(env, "OLD"), expires_at: new Date(T0 + 864e5).toISOString() });
  assert.equal(r2.status, "failed");
  assert.ok(rpcs.some((x) => x.fn === "social_update_account" && x.args.p_reconnect_error), "account flagged for reconnect");
  assert.match(String(rpcs.at(-1)!.args.p_error), /Sign in to TikTok again/);

  rpcs.length = 0;
  const r3 = await runOne(db, env, { ...row, account_id: null, token_enc: null });
  assert.equal(r3.status, "failed");
  assert.match(String(rpcs[0].args.p_error), /disconnected/);
});
