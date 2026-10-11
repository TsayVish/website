/*
 * AI Studio, server side: starts generation jobs on fal.ai, checks on them, and copies
 * finished files into the character's private library. Runs with the signed-in person's
 * Supabase session, so every read and write is subject to their access rules.
 * The fal key never leaves the server.
 */
import {
  checkRequest, cleanParams, extFor, falAppId, mimeFor, modelById, outputFiles,
  type BuildArgs, type InputFile, type MediaKind, type TimelineScene,
} from "./catalog";

/* Minimal shapes so this file can be tested with fakes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Fetch = typeof fetch;

export type StudioEnv = { falKey?: string; fetch?: Fetch; now?: () => number };

export class StudioError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const QUEUE = "https://queue.fal.run/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_URL_SECONDS = 60 * 60 * 2;
const GIVE_UP_AFTER_MS = 45 * 60 * 1000;

export const GENERATION_COLUMNS =
  "id, project_id, created_by, tool, model, prompt, params, inputs, status, provider_request_id, error, cost_cents, created_at, updated_at, finished_at";

export type InputRef = { type: "media" | "asset" | "character"; id: string };
export type SceneRef = { clip: string; voice?: string | null; clipMs?: number | null; voiceMs?: number | null };

export type GenerateBody = {
  projectId: string;
  model: string;
  prompt?: string;
  params?: Record<string, unknown>;
  inputs?: InputRef[];
  scenes?: SceneRef[];
  /** Where the result should go in a script, if anywhere. */
  target?: { scriptId: string; sceneId: string; role: "clip" | "voice" } | null;
  /** The script an assembled video came from. */
  scriptId?: string;
  label?: string;
};

export const studioConfigured = (env: StudioEnv) => Boolean(env.falKey);

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** fal error bodies vary: {detail: "..."} or {detail: [{msg}]} or {error}. */
export function falErrorText(body: unknown, fallback: string) {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const d = b.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d.length) {
    const first = d[0] as Record<string, unknown>;
    if (typeof first?.msg === "string") return first.msg;
  }
  if (typeof b.error === "string") return b.error;
  if (typeof b.message === "string") return b.message;
  return fallback;
}

function friendly(text: string) {
  if (/content|policy|safety|nsfw|moderation/i.test(text)) return "The AI provider declined this request under its content rules. Try a different prompt or picture.";
  return text.length > 300 ? text.slice(0, 297) + "…" : text;
}

async function falFetch(env: StudioEnv, url: string, init: RequestInit = {}) {
  if (!url.startsWith(QUEUE)) throw new StudioError("Unexpected provider address.", 500);
  const f = env.fetch ?? fetch;
  const res = await f(url, {
    ...init,
    headers: { Authorization: `Key ${env.falKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

/* ───────────────────────── starting a job ───────────────────────── */

type MediaRow = { id: string; project_id: string; kind: MediaKind; path: string; duration_ms: number | null };

async function signedUrls(db: Db, paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const { data, error } = await db.storage.from("studio-media").createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) throw new StudioError("Couldn’t prepare your files. Try again.", 500);
  const map = new Map<string, string>();
  for (const d of data ?? []) if (d?.signedUrl && d?.path) map.set(d.path, d.signedUrl);
  return map;
}

async function loadMedia(db: Db, projectId: string, ids: string[]) {
  if (!ids.length) return new Map<string, MediaRow>();
  const { data, error } = await db.from("studio_media").select("id, project_id, kind, path, duration_ms").eq("project_id", projectId).in("id", ids);
  if (error) throw new StudioError("Couldn’t load your files.", 500);
  return new Map<string, MediaRow>((data ?? []).map((m: MediaRow) => [m.id, m]));
}

/** Validates the request, records the job, and hands it to fal. Returns the job id. */
export async function startGeneration(db: Db, env: StudioEnv, body: GenerateBody) {
  if (!studioConfigured(env)) throw new StudioError("AI generation isn’t switched on yet. Ask the tsayvish team to add the FAL_KEY setting.", 503);
  if (!body || typeof body.projectId !== "string" || !UUID.test(body.projectId)) throw new StudioError("Choose a character first.");
  const model = modelById(String(body.model ?? ""));
  if (!model) throw new StudioError("Choose what to make.");

  const prompt = model.prompt === "none" ? "" : String(body.prompt ?? "").trim();
  const params = cleanParams(model, body.params);
  const refs = (Array.isArray(body.inputs) ? body.inputs : []).slice(0, 12)
    .filter((r): r is InputRef => !!r && ["media", "asset", "character"].includes(r.type) && typeof r.id === "string" && UUID.test(r.id));

  // Resolve inputs to fetchable URLs.
  const { data: project } = await db.from("projects").select("id, name, image_url").eq("id", body.projectId).maybeSingle();
  if (!project) throw new StudioError("Character not found.", 404);

  const scenes = model.tool === "assemble" ? (Array.isArray(body.scenes) ? body.scenes : []).slice(0, 41) : [];
  const mediaIds = [
    ...refs.filter((r) => r.type === "media").map((r) => r.id),
    ...scenes.flatMap((s) => [s?.clip, s?.voice]).filter((x): x is string => typeof x === "string" && UUID.test(x)),
  ];
  const media = await loadMedia(db, body.projectId, [...new Set(mediaIds)]);
  const urls = await signedUrls(db, [...media.values()].map((m) => m.path));

  const files: InputFile[] = [];
  for (const r of refs) {
    if (r.type === "media") {
      const m = media.get(r.id);
      const url = m && urls.get(m.path);
      if (!m || !url) throw new StudioError("One of the files you picked is no longer in the library.");
      files.push({ kind: m.kind, url, durationMs: m.duration_ms });
    } else if (r.type === "asset") {
      const { data: a } = await db.from("character_assets").select("url").eq("id", r.id).eq("project_id", body.projectId).maybeSingle();
      if (!a?.url) throw new StudioError("One of the pictures you picked is no longer available.");
      files.push({ kind: "image", url: a.url });
    } else if (r.id === body.projectId && project.image_url) {
      files.push({ kind: "image", url: project.image_url });
    }
  }

  let timeline: TimelineScene[] | undefined;
  if (model.tool === "assemble") {
    timeline = [];
    for (const s of scenes) {
      const clip = typeof s?.clip === "string" ? media.get(s.clip) : undefined;
      if (!clip || clip.kind !== "video") continue;
      const clipMs = clip.duration_ms ?? (Number(s.clipMs) > 0 ? Number(s.clipMs) : 0);
      if (!clipMs) throw new StudioError("Play each clip once in the library so we know how long it is, then try again.");
      const voice = typeof s.voice === "string" ? media.get(s.voice) : undefined;
      timeline.push({
        clipUrl: urls.get(clip.path)!,
        clipMs,
        voiceUrl: voice && voice.kind === "audio" ? urls.get(voice.path) ?? null : null,
        voiceMs: voice ? voice.duration_ms ?? (Number(s.voiceMs) > 0 ? Number(s.voiceMs) : null) : null,
      });
    }
    if (timeline.reduce((t, s) => t + s.clipMs, 0) > 5 * 60 * 1000) throw new StudioError("Assembled videos can be up to 5 minutes.");
  }

  const count = (k: MediaKind) => files.filter((f) => f.kind === k).length;
  const problem = checkRequest(model, prompt, { image: count("image"), audio: count("audio"), video: count("video") }, timeline?.length ?? 0);
  if (problem) throw new StudioError(problem);

  const args: BuildArgs = {
    prompt, params, timeline,
    images: files.filter((f) => f.kind === "image"),
    audio: files.filter((f) => f.kind === "audio"),
    video: files.filter((f) => f.kind === "video"),
  };
  const cost = model.cost(args);
  const { endpoint, input } = model.build(args);

  const target = body.target && typeof body.target.scriptId === "string" && UUID.test(body.target.scriptId)
    && typeof body.target.sceneId === "string" && ["clip", "voice"].includes(body.target.role)
    ? { script_id: body.target.scriptId, scene_id: body.target.sceneId.slice(0, 64), scene_role: body.target.role }
    : {};
  const fromScript = typeof body.scriptId === "string" && UUID.test(body.scriptId) ? { script_id: body.scriptId } : {};
  const label = typeof body.label === "string" && body.label.trim() ? { label: body.label.trim().slice(0, 120) } : {};
  const seconds = model.outputSeconds?.(args) ?? null;

  const { data: id, error } = await db.rpc("studio_start_generation", {
    p_project: body.projectId,
    p_tool: model.tool,
    p_model: model.id,
    p_prompt: prompt,
    p_params: { ...params, ...fromScript, ...target, ...label, endpoint, ...(seconds ? { seconds: String(seconds) } : {}) },
    p_inputs: [...refs, ...scenes.map((s) => ({ type: "scene", clip: s.clip, voice: s.voice ?? null }))],
    p_cost_cents: cost,
  });
  if (error) throw new StudioError(error.message || "Couldn’t start that.", /limit|too often/i.test(error.message ?? "") ? 429 : 400);

  // Hand it to fal.
  try {
    const res = await falFetch(env, QUEUE + endpoint, { method: "POST", body: JSON.stringify(input) });
    const b = (res.body ?? {}) as Record<string, unknown>;
    if (!res.ok || typeof b.request_id !== "string") throw new Error(falErrorText(res.body, `The AI provider returned an error (${res.status}).`));
    const meta: Record<string, string> = {};
    for (const k of ["status_url", "response_url", "cancel_url"]) if (typeof b[k] === "string" && (b[k] as string).startsWith(QUEUE)) meta[k] = b[k] as string;
    const { error: e2 } = await db.rpc("studio_mark_submitted", { p_id: id, p_request_id: b.request_id, p_meta: meta });
    if (e2) throw new Error(e2.message);
  } catch (e) {
    await db.rpc("studio_end_generation", { p_id: id, p_status: "failed", p_error: friendly(message(e)) });
    throw new StudioError(friendly(message(e)), 502);
  }
  return id as string;
}

/* ───────────────────────── checking on a job ───────────────────────── */

type JobRow = {
  id: string; project_id: string; tool: string; model: string; status: string; params: Record<string, string> | null;
  provider_request_id: string | null; provider_meta: Record<string, string> | null; created_at: string;
};

function queueUrls(job: JobRow) {
  const endpoint = job.params?.endpoint || "";
  const base = QUEUE + falAppId(endpoint) + "/requests/" + job.provider_request_id;
  const meta = job.provider_meta ?? {};
  const ok = (u: unknown) => typeof u === "string" && u.startsWith(QUEUE);
  return {
    status: ok(meta.status_url) ? meta.status_url : base + "/status",
    result: ok(meta.response_url) ? meta.response_url : base,
    cancel: ok(meta.cancel_url) ? meta.cancel_url : base + "/cancel",
  };
}

async function loadJob(db: Db, id: string) {
  if (!UUID.test(id)) throw new StudioError("Not found.", 404);
  const { data } = await db.from("studio_generations").select(GENERATION_COLUMNS + ", provider_meta").eq("id", id).maybeSingle();
  if (!data) throw new StudioError("Not found.", 404);
  return data as JobRow;
}

/** Copies a finished file from the provider into the character's library folder. */
async function storeOutput(db: Db, env: StudioEnv, job: JobRow, file: { url: string; kind: MediaKind; mime?: string }, i: number) {
  const f = env.fetch ?? fetch;
  const res = await f(file.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn’t download the result (${res.status}).`);
  const headerType = res.headers.get("content-type")?.split(";")[0]?.trim();
  const mime = mimeFor(file.mime ?? headerType, file.kind, file.url);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 50 * 1024 * 1024) throw new Error("The result is larger than 50 MB.");
  const path = `${job.project_id}/gen-${job.id}-${i}.${extFor(mime, file.kind, file.url)}`;
  const { error } = await db.storage.from("studio-media").upload(path, buf, { contentType: mime, upsert: true });
  if (error) throw new Error(error.message);
  const seconds = Number(job.params?.seconds);
  return {
    path, kind: file.kind, mime, bytes: buf.byteLength,
    duration_ms: file.kind !== "image" && seconds > 0 ? Math.round(seconds * 1000) : null,
  };
}

/** Asks fal how a running job is doing; finishes it if it's done. Returns the job's current state. */
export async function refreshGeneration(db: Db, env: StudioEnv, id: string) {
  const job = await loadJob(db, id);
  if (!["queued", "running"].includes(job.status)) return { job, queuePosition: null as number | null };
  const now = (env.now ?? Date.now)();

  const fail = async (text: string) => {
    await db.rpc("studio_end_generation", { p_id: id, p_status: "failed", p_error: friendly(text) });
    return { job: await loadJob(db, id), queuePosition: null };
  };

  if (!job.provider_request_id) {
    // Never reached the provider (the server stopped mid-way). Give it a minute, then let it go.
    if (now - Date.parse(job.created_at) > 60_000) return fail("This didn’t start. Try again.");
    return { job, queuePosition: null };
  }
  if (!studioConfigured(env)) return { job, queuePosition: null };

  const urls = queueUrls(job);
  const st = await falFetch(env, urls.status);
  const sb = (st.body ?? {}) as Record<string, unknown>;
  if (!st.ok) {
    if (st.status === 404 || now - Date.parse(job.created_at) > GIVE_UP_AFTER_MS) return fail(falErrorText(st.body, "The AI provider lost track of this job."));
    return { job, queuePosition: null };
  }
  if (sb.status === "IN_QUEUE" || sb.status === "IN_PROGRESS") {
    if (now - Date.parse(job.created_at) > GIVE_UP_AFTER_MS) {
      await falFetch(env, urls.cancel, { method: "PUT" }).catch(() => null);
      return fail("This took too long and was stopped. Try again.");
    }
    return { job, queuePosition: typeof sb.queue_position === "number" ? sb.queue_position : null };
  }
  if (sb.status !== "COMPLETED") return { job, queuePosition: null };
  if (sb.error) return fail(String(sb.error));

  const r = await falFetch(env, urls.result);
  if (!r.ok) return fail(falErrorText(r.body, `The AI provider returned an error (${r.status}).`));
  const files = outputFiles(r.body);
  if (!files.length) return fail("The AI provider finished but sent nothing back.");

  try {
    const outputs = [];
    for (let i = 0; i < files.length; i++) outputs.push(await storeOutput(db, env, job, files[i], i));
    const { error } = await db.rpc("studio_complete_generation", { p_id: id, p_outputs: outputs });
    if (error) throw new Error(error.message);
  } catch (e) {
    // Leave it running; the next check will try the copy again.
    throw new StudioError(`Your result is ready but couldn’t be saved: ${message(e)}`, 500);
  }
  return { job: await loadJob(db, id), queuePosition: null };
}

/** Stops a job that hasn't finished. */
export async function cancelGeneration(db: Db, env: StudioEnv, id: string) {
  const job = await loadJob(db, id);
  if (!["queued", "running"].includes(job.status)) return job;
  if (job.provider_request_id && studioConfigured(env)) await falFetch(env, queueUrls(job).cancel, { method: "PUT" }).catch(() => null);
  const { error } = await db.rpc("studio_end_generation", { p_id: id, p_status: "canceled", p_error: null });
  if (error) throw new StudioError(error.message, 403);
  return loadJob(db, id);
}

/** Strips server-only fields before sending a job to the browser. */
export function publicJob(job: Record<string, unknown>) {
  const { provider_meta: _meta, ...rest } = job;
  void _meta;
  return rest;
}
