import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMediaFile, checkRequest, cleanParams, composeInput, falAppId, kindOfMime, modelById, outputFiles } from "../../lib/studio/catalog.ts";
import { cancelGeneration, refreshGeneration, startGeneration } from "../../lib/studio/server.ts";

const P = "10000000-0000-4000-8000-000000000001";
const IMG = "20000000-0000-4000-8000-000000000001";
const AUD = "20000000-0000-4000-8000-000000000002";
const CLIP = "20000000-0000-4000-8000-000000000003";
const JOB = "30000000-0000-4000-8000-000000000001";

test("catalog: costs, params and request checks", () => {
  const img = modelById("nano-banana-2")!;
  assert.deepEqual(cleanParams(img, { aspect_ratio: "9:16", num_images: "9", junk: "x" }), { aspect_ratio: "9:16", num_images: "1", mode: "create" });
  assert.equal(img.cost({ prompt: "x", params: { num_images: "3" }, images: [], audio: [], video: [] }), 24);
  assert.equal(img.build({ prompt: "x", params: {}, images: [], audio: [], video: [] }).endpoint, "fal-ai/nano-banana-2");
  const edit = img.build({ prompt: "at a desk", params: {}, images: [{ kind: "image", url: "https://a/b.png" }], audio: [], video: [] });
  assert.equal(edit.endpoint, "fal-ai/nano-banana-2/edit");
  assert.match(String(edit.input.prompt), /^at a desk\n\nThe subject is the exact person or character in the reference image\. Keep their identity/);
  assert.equal(img.build({ prompt: "at a desk", params: {}, images: [], audio: [], video: [] }).input.prompt, "at a desk");
  const ed = img.build({ prompt: "add a red scarf", params: { mode: "edit" }, images: [{ kind: "image", url: "https://a/b.png" }], audio: [], video: [] });
  assert.match(String(ed.input.prompt), /^Edit this image: add a red scarf\n\nKeep everything else exactly the same/);
  assert.equal(ed.input.aspect_ratio, "auto");

  const k3 = modelById("kling-3-pro")!;
  assert.equal(k3.cost({ prompt: "x", params: { duration: "10", generate_audio: "on" }, images: [], audio: [], video: [] }), 168);
  assert.match(checkRequest(k3, "walk", { image: 0, audio: 0, video: 0 }), /pick a picture/i);
  assert.equal(checkRequest(k3, "walk", { image: 1, audio: 0, video: 0 }), "");
  assert.match(checkRequest(k3, "", { image: 1, audio: 0, video: 0 }), /describe/i);

  const voice = modelById("elevenlabs-v3")!;
  assert.equal(voice.cost({ prompt: "a".repeat(250), params: {}, images: [], audio: [], video: [] }), 3);
  assert.deepEqual(voice.build({ prompt: "Hi", params: { voice: "Nobody" }, images: [], audio: [], video: [] }).input, { text: "Hi", voice: "Aria" });

  const talk = modelById("fabric-1.0")!;
  assert.equal(talk.cost({ prompt: "", params: { resolution: "720p" }, images: [], audio: [{ kind: "audio", url: "u", durationMs: 4200 }], video: [] }), 75);
  assert.match(checkRequest(talk, "", { image: 1, audio: 0, video: 0 }), /voice line/);
});

test("catalog: assembling scenes and reading results", () => {
  const out = composeInput([
    { clipUrl: "c1", clipMs: 5000, voiceUrl: "v1", voiceMs: 7000 },
    { clipUrl: "c2", clipMs: 3000 },
  ]);
  assert.deepEqual(out.tracks[0].keyframes, [{ timestamp: 0, duration: 5000, url: "c1" }, { timestamp: 5000, duration: 3000, url: "c2" }]);
  assert.deepEqual(out.tracks[1].keyframes, [{ timestamp: 0, duration: 5000, url: "v1" }]);

  assert.deepEqual(outputFiles({ images: [{ url: "https://x/1.png", content_type: "image/png" }, { url: "javascript:alert(1)" }] }), [{ url: "https://x/1.png", kind: "image", mime: "image/png" }]);
  assert.deepEqual(outputFiles({ video: { url: "https://x/v.mp4" } }).map((f) => f.kind), ["video"]);
  assert.deepEqual(outputFiles({ video_url: "https://x/v.mp4", thumbnail_url: "https://x/t.jpg" }).length, 1);
  assert.deepEqual(outputFiles({ audio: { url: "https://x/a.mp3" } }).map((f) => f.kind), ["audio"]);

  assert.equal(kindOfMime("audio/mpeg"), "audio");
  assert.equal(kindOfMime("application/pdf"), null);
  assert.match(checkMediaFile({ type: "video/mp4", size: 60 * 1024 * 1024 }), /50 MB/);
  assert.equal(falAppId("fal-ai/kling-video/v2.5-turbo/pro/image-to-video"), "fal-ai/kling-video");
});

/* ── A tiny fake of the parts of supabase-js the server uses ── */
function fakeDb() {
  const tables: Record<string, Record<string, unknown>[]> = {
    projects: [{ id: P, name: "Mango", image_url: null }],
    studio_media: [
      { id: IMG, project_id: P, kind: "image", path: `${P}/ref.png`, duration_ms: null },
      { id: AUD, project_id: P, kind: "audio", path: `${P}/line.mp3`, duration_ms: 3000 },
      { id: CLIP, project_id: P, kind: "video", path: `${P}/clip.mp4`, duration_ms: 5000 },
    ],
    character_assets: [],
    studio_generations: [],
  };
  const calls: { rpc: [string, Record<string, unknown>][]; uploads: string[] } = { rpc: [], uploads: [] };
  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
      in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return q; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
    };
    return q;
  };
  const db = {
    tables, calls,
    from: query,
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://sb.test/sign/${p}` })), error: null }),
        upload: async (path: string) => { calls.uploads.push(path); return { error: null }; },
      }),
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.rpc.push([name, args]);
      const g = tables.studio_generations;
      if (name === "studio_start_generation") {
        g.push({ id: JOB, project_id: P, tool: args.p_tool, model: args.p_model, status: "queued", params: args.p_params, provider_request_id: null, provider_meta: {}, created_at: new Date().toISOString() });
        return { data: JOB, error: null };
      }
      if (name === "studio_mark_submitted") { Object.assign(g[0], { status: "running", provider_request_id: args.p_request_id, provider_meta: args.p_meta }); return { error: null }; }
      if (name === "studio_end_generation") { Object.assign(g[0], { status: args.p_status, error: args.p_error }); return { error: null }; }
      if (name === "studio_complete_generation") { Object.assign(g[0], { status: "succeeded" }); return { data: [], error: null }; }
      return { error: { message: "unknown rpc" } };
    },
  };
  return db;
}

function fakeFal(script: Record<string, (init: RequestInit | undefined) => { status?: number; body: unknown; type?: string }>) {
  const seen: { url: string; auth?: string; body?: unknown }[] = [];
  const f = async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push({ url: u, auth: headers.Authorization, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(script).filter((k) => u.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response("not found", { status: 404 });
    const r = script[key](init);
    if (r.type) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": r.type } });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { fetch: f as typeof fetch, seen };
}

test("server: refuses to run without a key, and validates input", async () => {
  const db = fakeDb();
  await assert.rejects(startGeneration(db, {}, { projectId: P, model: "nano-banana-2", prompt: "hi" }), /isn’t switched on/);
  const { fetch } = fakeFal({});
  await assert.rejects(startGeneration(db, { falKey: "k", fetch }, { projectId: P, model: "kling-3-pro", prompt: "walk" }), /pick a picture/i);
  await assert.rejects(startGeneration(db, { falKey: "k", fetch }, { projectId: "nope", model: "kling-3-pro" }), /character/i);
  assert.equal(db.calls.rpc.length, 0, "nothing recorded for rejected requests");
});

test("server: start → poll → finished file saved to the library", async () => {
  const db = fakeDb();
  const fal = fakeFal({
    "https://queue.fal.run/fal-ai/kling-video/v2.5-turbo/pro/image-to-video": () => ({
      body: { request_id: "req-9", status_url: "https://queue.fal.run/fal-ai/kling-video/requests/req-9/status", response_url: "https://queue.fal.run/fal-ai/kling-video/requests/req-9" },
    }),
    "https://queue.fal.run/fal-ai/kling-video/requests/req-9/status": () => ({ body: { status: "COMPLETED" } }),
    "https://queue.fal.run/fal-ai/kling-video/requests/req-9": () => ({ body: { video: { url: "https://cdn.fal.test/out.mp4", content_type: "video/mp4" } } }),
    "https://cdn.fal.test/out.mp4": () => ({ body: null, type: "video/mp4" }),
  });
  const env = { falKey: "secret", fetch: fal.fetch };
  const id = await startGeneration(db, env, {
    projectId: P, model: "kling-2.5-turbo", prompt: "Mango yawns", params: { duration: "10" },
    inputs: [{ type: "media", id: IMG }], target: { scriptId: "40000000-0000-4000-8000-000000000001", sceneId: "s1", role: "clip" },
  });
  assert.equal(id, JOB);
  const start = db.calls.rpc.find(([n]) => n === "studio_start_generation")![1];
  assert.equal(start.p_cost_cents, 70);
  assert.equal((start.p_params as Record<string, string>).scene_role, "clip");
  assert.equal((start.p_params as Record<string, string>).endpoint, "fal-ai/kling-video/v2.5-turbo/pro/image-to-video");
  const submit = fal.seen[0];
  assert.equal(submit.auth, "Key secret");
  assert.deepEqual(submit.body, { prompt: "Mango yawns", image_url: `https://sb.test/sign/${P}/ref.png`, duration: "10" });

  const { job } = await refreshGeneration(db, env, id);
  assert.equal(job.status, "succeeded");
  assert.deepEqual(db.calls.uploads, [`${P}/gen-${JOB}-0.mp4`]);
  const done = db.calls.rpc.find(([n]) => n === "studio_complete_generation")![1];
  assert.deepEqual((done.p_outputs as Record<string, unknown>[])[0], { path: `${P}/gen-${JOB}-0.mp4`, kind: "video", mime: "video/mp4", bytes: 3, duration_ms: 10000 });
  assert.ok(fal.seen.every((s) => !s.url.startsWith("https://queue.fal.run") || s.auth === "Key secret"));
  assert.ok(fal.seen.filter((s) => s.url.startsWith("https://cdn.")).every((s) => !s.auth), "the key is only sent to fal's queue");
});

test("server: provider errors and content refusals become plain messages", async () => {
  const db = fakeDb();
  const fal = fakeFal({ "https://queue.fal.run/fal-ai/elevenlabs": () => ({ status: 422, body: { detail: [{ msg: "text too long" }] } }) });
  await assert.rejects(startGeneration(db, { falKey: "k", fetch: fal.fetch }, { projectId: P, model: "elevenlabs-v3", prompt: "Hello" }), /text too long/);
  assert.equal(db.tables.studio_generations[0].status, "failed");

  const db2 = fakeDb();
  const fal2 = fakeFal({
    "https://queue.fal.run/veed/fabric-1.0": () => ({ body: { request_id: "r2" } }),
    "https://queue.fal.run/veed/fabric-1.0/requests/r2/status": () => ({ body: { status: "COMPLETED", error: "Content policy violation" } }),
  });
  const env = { falKey: "k", fetch: fal2.fetch };
  await startGeneration(db2, env, { projectId: P, model: "fabric-1.0", inputs: [{ type: "media", id: IMG }, { type: "media", id: AUD }] });
  const { job } = await refreshGeneration(db2, env, JOB);
  assert.equal(job.status, "failed");
  assert.match(String((db2.tables.studio_generations[0] as Record<string, unknown>).error), /content rules/);
});

test("server: assemble uses clip lengths; cancel stops a running job", async () => {
  const db = fakeDb();
  const fal = fakeFal({
    "https://queue.fal.run/fal-ai/ffmpeg-api/compose": () => ({ body: { request_id: "r3" } }),
    "https://queue.fal.run/fal-ai/ffmpeg-api/requests/r3/cancel": () => ({ status: 202, body: { status: "CANCELLATION_REQUESTED" } }),
  });
  const env = { falKey: "k", fetch: fal.fetch };
  await startGeneration(db, env, { projectId: P, model: "ffmpeg-compose", scenes: [{ clip: CLIP, voice: AUD }, { clip: IMG }] });
  const body = fal.seen[0].body as { tracks: { keyframes: { duration: number }[] }[] };
  assert.equal(body.tracks.length, 2);
  assert.deepEqual(body.tracks[0].keyframes.map((k) => k.duration), [5000], "non-video scenes are skipped");
  assert.deepEqual(body.tracks[1].keyframes.map((k) => k.duration), [3000]);
  const job = await cancelGeneration(db, env, JOB);
  assert.equal(job.status, "canceled");
  assert.ok(fal.seen.some((s) => s.url.endsWith("/r3/cancel")));
});
