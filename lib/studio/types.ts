import type { MediaKind, Tool } from "./catalog";

export type StudioMedia = {
  id: string;
  project_id: string;
  kind: MediaKind;
  source: "upload" | "generated";
  label: string | null;
  path: string;
  mime: string | null;
  bytes: number | null;
  duration_ms: number | null;
  generation_id: string | null;
  created_at: string;
};
export const MEDIA_COLUMNS = "id, project_id, kind, source, label, path, mime, bytes, duration_ms, generation_id, created_at";

export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type StudioGeneration = {
  id: string;
  project_id: string;
  created_by: string;
  tool: Tool;
  model: string;
  prompt: string | null;
  params: Record<string, string>;
  status: GenerationStatus;
  error: string | null;
  cost_cents: number;
  created_at: string;
  finished_at: string | null;
};
export const GENERATION_LIST_COLUMNS = "id, project_id, created_by, tool, model, prompt, params, status, error, cost_cents, created_at, finished_at";

export type Scene = {
  id: string;
  shot: string;
  line: string;
  voice?: string;
  clip_media?: string | null;
  voice_media?: string | null;
};
export type StudioScript = { id: string; project_id: string; title: string; scenes: Scene[]; updated_at: string };
export const SCRIPT_COLUMNS = "id, project_id, title, scenes, updated_at";

export const isPending = (s: GenerationStatus) => s === "queued" || s === "running";

export const STATUS_TEXT: Record<GenerationStatus, string> = {
  queued: "Starting",
  running: "Working",
  succeeded: "Done",
  failed: "Failed",
  canceled: "Stopped",
};

export function readScenes(raw: unknown): Scene[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).map((s, i) => {
    const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      id: str(r.id) || `s${i + 1}`,
      shot: str(r.shot).slice(0, 2000),
      line: str(r.line).slice(0, 3000),
      voice: str(r.voice) || undefined,
      clip_media: str(r.clip_media) || null,
      voice_media: str(r.voice_media) || null,
    };
  });
}

export const newSceneId = () => `s${Math.random().toString(36).slice(2, 10)}`;

/** "0:07" style length. */
export function clock(ms: number | null | undefined) {
  if (!ms || ms < 0) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
