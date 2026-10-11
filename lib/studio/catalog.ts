/*
 * AI Studio: what can be made, with which model, from which inputs, and roughly what it costs.
 * Shared by the browser (forms, cost estimates) and the server (validation, provider calls).
 * Models run on fal.ai. cost() is fal's list price in US cents (rounded up); people pay that × the credit markup.
 * Self-contained on purpose: unit tests import this file directly.
 */

export type Tool = "image" | "video" | "voice" | "talking" | "assemble";
export type MediaKind = "image" | "audio" | "video";

export const TOOLS: { key: Tool; label: string; help: string }[] = [
  { key: "image", label: "Image", help: "New pictures of your character from a prompt and reference images." },
  { key: "video", label: "Video clip", help: "Animate a picture into a short clip, or make one from a prompt." },
  { key: "voice", label: "Voiceover", help: "Turn a line of script into speech." },
  { key: "talking", label: "Talking clip", help: "Make a picture of your character speak a voice line." },
  { key: "assemble", label: "Assemble", help: "Stitch scenes into one video, with each scene’s voice line laid over its clip." },
];

export type Choice = { value: string; label: string };
export type OptionDef = { key: string; label: string; choices: Choice[]; default: string };

/** A resolved input file the provider can fetch. */
export type InputFile = { kind: MediaKind; url: string; durationMs?: number | null };

/** One scene of an assembled video. */
export type TimelineScene = { clipUrl: string; clipMs: number; voiceUrl?: string | null; voiceMs?: number | null };

export type BuildArgs = {
  prompt: string;
  params: Record<string, string>;
  images: InputFile[];
  audio: InputFile[];
  video: InputFile[];
  timeline?: TimelineScene[];
};

export type ModelDef = {
  id: string;                         // our key, stored on the job
  tool: Tool;
  label: string;
  blurb: string;
  prompt: "required" | "optional" | "none";
  promptLabel?: string;
  promptMax: number;
  needs: Partial<Record<MediaKind, [number, number]>>;  // [min, max] files of each kind
  options: OptionDef[];
  cost: (a: BuildArgs) => number;     // cents
  /** fal endpoint id and request body. */
  build: (a: BuildArgs) => { endpoint: string; input: Record<string, unknown> };
  /** Expected seconds of output, when known (for the library). */
  outputSeconds?: (a: BuildArgs) => number | null;
};

const ASPECTS: Choice[] = [
  { value: "1:1", label: "Square 1:1" },
  { value: "9:16", label: "Vertical 9:16" },
  { value: "16:9", label: "Wide 16:9" },
  { value: "4:5", label: "Portrait 4:5" },
];

export const VOICES = [
  "Aria", "Sarah", "Laura", "Charlotte", "Alice", "Matilda", "Jessica", "Lily",
  "Roger", "Charlie", "George", "Callum", "River", "Liam", "Will", "Eric", "Chris", "Brian", "Daniel", "Bill",
];

const sec = (s: string | undefined, fallback: number) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const MODELS: ModelDef[] = [
  {
    id: "nano-banana-2",
    tool: "image",
    label: "Nano Banana 2",
    blurb: "Keeps your character on-model from reference pictures.",
    prompt: "required",
    promptLabel: "What should the picture show?",
    promptMax: 2000,
    needs: { image: [0, 6] },
    options: [
      { key: "aspect_ratio", label: "Shape", choices: ASPECTS, default: "1:1" },
      { key: "num_images", label: "How many", choices: ["1", "2", "3", "4"].map((v) => ({ value: v, label: v })), default: "1" },
    ],
    cost: (a) => 8 * sec(a.params.num_images, 1),
    build: (a) => {
      const input: Record<string, unknown> = {
        prompt: a.prompt,
        aspect_ratio: a.params.aspect_ratio || "1:1",
        num_images: Math.min(4, sec(a.params.num_images, 1)),
        output_format: "png",
      };
      if (a.images.length) {
        input.image_urls = a.images.map((i) => i.url);
        input.prompt = identityPrompt(a.prompt, a.images.length);
      }
      return { endpoint: a.images.length ? "fal-ai/nano-banana-2/edit" : "fal-ai/nano-banana-2", input };
    },
  },
  {
    id: "kling-2.5-turbo",
    tool: "video",
    label: "Kling 2.5 Turbo",
    blurb: "Fast, smooth motion. Silent clip.",
    prompt: "required",
    promptLabel: "What happens in the shot?",
    promptMax: 2500,
    needs: { image: [0, 1] },
    options: [
      { key: "duration", label: "Length", choices: [{ value: "5", label: "5 seconds" }, { value: "10", label: "10 seconds" }], default: "5" },
      { key: "aspect_ratio", label: "Shape (no picture)", choices: ASPECTS.slice(0, 3), default: "9:16" },
    ],
    cost: (a) => 7 * sec(a.params.duration, 5),
    outputSeconds: (a) => sec(a.params.duration, 5),
    build: (a) => {
      const duration = a.params.duration === "10" ? "10" : "5";
      if (a.images.length) {
        return { endpoint: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", input: { prompt: a.prompt, image_url: a.images[0].url, duration } };
      }
      const ar = ["16:9", "9:16", "1:1"].includes(a.params.aspect_ratio) ? a.params.aspect_ratio : "9:16";
      return { endpoint: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video", input: { prompt: a.prompt, duration, aspect_ratio: ar } };
    },
  },
  {
    id: "kling-3-pro",
    tool: "video",
    label: "Kling 3 Pro",
    blurb: "Highest quality, with optional sound. Needs a starting picture.",
    prompt: "required",
    promptLabel: "What happens in the shot?",
    promptMax: 2500,
    needs: { image: [1, 1] },
    options: [
      { key: "duration", label: "Length", choices: ["5", "10", "15"].map((v) => ({ value: v, label: `${v} seconds` })), default: "5" },
      { key: "generate_audio", label: "Sound", choices: [{ value: "off", label: "Silent" }, { value: "on", label: "With sound" }], default: "off" },
    ],
    cost: (a) => Math.ceil((a.params.generate_audio === "on" ? 16.8 : 11.2) * sec(a.params.duration, 5)),
    outputSeconds: (a) => sec(a.params.duration, 5),
    build: (a) => ({
      endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
      input: {
        prompt: a.prompt,
        start_image_url: a.images[0]?.url,
        duration: ["5", "10", "15"].includes(a.params.duration) ? a.params.duration : "5",
        generate_audio: a.params.generate_audio === "on",
      },
    }),
  },
  {
    id: "elevenlabs-v3",
    tool: "voice",
    label: "ElevenLabs v3",
    blurb: "Expressive speech in 20 voices.",
    prompt: "required",
    promptLabel: "What should they say?",
    promptMax: 3000,
    needs: {},
    options: [{ key: "voice", label: "Voice", choices: VOICES.map((v) => ({ value: v, label: v })), default: "Aria" }],
    cost: (a) => Math.max(1, Math.ceil(a.prompt.length / 100)),
    build: (a) => ({
      endpoint: "fal-ai/elevenlabs/tts/eleven-v3",
      input: { text: a.prompt, voice: VOICES.includes(a.params.voice) ? a.params.voice : "Aria" },
    }),
  },
  {
    id: "fabric-1.0",
    tool: "talking",
    label: "VEED Fabric 1.0",
    blurb: "Lip-syncs a picture to a voice line. Works best with a clear, front-facing face.",
    prompt: "none",
    promptMax: 0,
    needs: { image: [1, 1], audio: [1, 1] },
    options: [{ key: "resolution", label: "Quality", choices: [{ value: "480p", label: "480p" }, { value: "720p", label: "720p" }], default: "480p" }],
    cost: (a) => {
      const seconds = Math.ceil((a.audio[0]?.durationMs ?? 30000) / 1000);
      return Math.ceil((a.params.resolution === "720p" ? 15 : 8) * seconds);
    },
    outputSeconds: (a) => (a.audio[0]?.durationMs ? a.audio[0].durationMs / 1000 : null),
    build: (a) => ({
      endpoint: "veed/fabric-1.0",
      input: { image_url: a.images[0]?.url, audio_url: a.audio[0]?.url, resolution: a.params.resolution === "720p" ? "720p" : "480p" },
    }),
  },
  {
    id: "ffmpeg-compose",
    tool: "assemble",
    label: "Assemble",
    blurb: "Joins your scenes in order.",
    prompt: "none",
    promptMax: 0,
    needs: {},
    options: [],
    cost: () => 1,
    outputSeconds: (a) => (a.timeline ?? []).reduce((t, s) => t + s.clipMs, 0) / 1000,
    build: (a) => ({ endpoint: "fal-ai/ffmpeg-api/compose", input: composeInput(a.timeline ?? []) }),
  },
];

export const modelById = (id: string) => MODELS.find((m) => m.id === id);
export const modelsFor = (tool: Tool) => MODELS.filter((m) => m.tool === tool);
export const toolLabel = (tool: string) => TOOLS.find((t) => t.key === tool)?.label ?? tool;

/** Keeps the person or character from the reference pictures instead of inventing a new one. */
export function identityPrompt(prompt: string, refs: number) {
  const which = refs > 1 ? "the first reference image (the others are extra references)" : "the reference image";
  return `${prompt.trim()}\n\nThe subject is the exact person or character in ${which}. Keep their identity the same: face, ` +
    "skin tone, hair, eye shape, age, body type and any distinctive features. Don't replace them with someone else. " +
    "Only change the scene, pose, outfit or action described above.";
}

/** Scenes back to back on one video track; each voice line starts with its scene. */
export function composeInput(timeline: TimelineScene[]) {
  let t = 0;
  const videoFrames: { timestamp: number; duration: number; url: string }[] = [];
  const audioFrames: { timestamp: number; duration: number; url: string }[] = [];
  for (const s of timeline) {
    const len = Math.max(1, Math.round(s.clipMs));
    videoFrames.push({ timestamp: t, duration: len, url: s.clipUrl });
    if (s.voiceUrl) audioFrames.push({ timestamp: t, duration: Math.min(len, Math.round(s.voiceMs ?? len)), url: s.voiceUrl });
    t += len;
  }
  const tracks: { id: string; type: string; keyframes: typeof videoFrames }[] = [{ id: "video", type: "video", keyframes: videoFrames }];
  if (audioFrames.length) tracks.push({ id: "voice", type: "audio", keyframes: audioFrames });
  return { tracks };
}

/** Fills in defaults and drops anything not offered. */
export function cleanParams(model: ModelDef, raw: unknown): Record<string, string> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const o of model.options) {
    const v = typeof r[o.key] === "string" ? (r[o.key] as string) : String(r[o.key] ?? "");
    out[o.key] = o.choices.some((c) => c.value === v) ? v : o.default;
  }
  return out;
}

/** Returns a problem sentence, or "" if the request is complete. */
export function checkRequest(model: ModelDef, prompt: string, files: { image: number; audio: number; video: number }, timelineLength = 0) {
  if (model.prompt === "required" && !prompt.trim()) return model.tool === "voice" ? "Write the line to be spoken." : "Describe what you want first.";
  if (prompt.length > model.promptMax && model.prompt !== "none") return `Keep it under ${model.promptMax} characters.`;
  const names: Record<MediaKind, string> = { image: "picture", audio: "voice line or audio file", video: "video" };
  for (const kind of ["image", "audio", "video"] as MediaKind[]) {
    const [min, max] = model.needs[kind] ?? [0, 0];
    const n = files[kind];
    if (n < min) return min === 1 ? `Pick a ${names[kind]} from the library.` : `Pick at least ${min} ${names[kind]}s.`;
    if (n > max) return max === 0 ? `This doesn’t use ${names[kind]}s. Unselect them.` : `Pick at most ${max} ${names[kind]}${max === 1 ? "" : "s"}.`;
  }
  if (model.tool === "assemble") {
    if (timelineLength < 1) return "Add a clip to at least one scene first.";
    if (timelineLength > 40) return "Assemble at most 40 scenes at a time.";
  }
  return "";
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Finds the files in a provider result. */
export function outputFiles(result: unknown): { url: string; kind: MediaKind; mime?: string }[] {
  const r = (result && typeof result === "object" ? result : {}) as Record<string, any>;
  const out: { url: string; kind: MediaKind; mime?: string }[] = [];
  const add = (f: any, kind: MediaKind) => {
    const url = typeof f === "string" ? f : f?.url;
    if (typeof url === "string" && /^https?:\/\//.test(url)) out.push({ url, kind, mime: typeof f?.content_type === "string" ? f.content_type : undefined });
  };
  if (Array.isArray(r.images)) r.images.forEach((i: unknown) => add(i, "image"));
  if (r.image) add(r.image, "image");
  if (r.video) add(r.video, "video");
  if (r.video_url) add(r.video_url, "video");
  if (r.audio) add(r.audio, "audio");
  if (r.audio_url) add(r.audio_url, "audio");
  return out.slice(0, 8);
}

const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
  "audio/aac": "aac", "audio/ogg": "ogg", "audio/webm": "weba", "audio/flac": "flac",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};
const DEFAULT_MIME: Record<MediaKind, string> = { image: "image/png", audio: "audio/mpeg", video: "video/mp4" };

/** Allowed upload types for the library, and the limit. */
export const MEDIA_TYPES = Object.keys(EXT);
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;

export function kindOfMime(mime: string): MediaKind | null {
  if (!MEDIA_TYPES.includes(mime)) return null;
  return mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : "video";
}

export function extFor(mime: string | undefined, kind: MediaKind, url = "") {
  if (mime && EXT[mime]) return EXT[mime];
  const m = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(url);
  return m ? m[1].toLowerCase() : EXT[DEFAULT_MIME[kind]];
}

export function mimeFor(mime: string | undefined, kind: MediaKind, url = ""): string {
  if (mime && EXT[mime]) return mime;
  const ext = extFor(undefined, kind, url);
  return Object.keys(EXT).find((k) => EXT[k] === ext && k.startsWith(kind)) ?? DEFAULT_MIME[kind];
}

/** Returns a problem sentence, or "" if the file can go in the library. */
export function checkMediaFile(file: { type: string; size: number }) {
  if (!kindOfMime(file.type)) return "Use an image (PNG, JPG, WebP, GIF), audio (MP3, WAV, M4A, OGG) or video (MP4, WebM, MOV) file.";
  if (file.size > MEDIA_MAX_BYTES) return "That file is over 50 MB. Choose a smaller one.";
  return "";
}

/** fal queue URLs use only the owner/app part of an endpoint for status and results. */
/** Fallback when the provider didn't give us URLs. */
export function falAppId(endpoint: string) {
  return endpoint.split("/").slice(0, 2).join("/");
}
