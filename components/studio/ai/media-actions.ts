"use client";

import { createClient } from "@/lib/supabase/client";
import { checkMediaFile, extFor, kindOfMime } from "@/lib/studio/catalog";
import { MEDIA_COLUMNS, type StudioMedia } from "@/lib/studio/types";
import { uploadCharacterImage } from "@/lib/upload";

/** Measures an audio or video file's length in the browser before upload. */
export function measure(file: File): Promise<number | null> {
  if (!/^(audio|video)\//.test(file.type)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("video") ? "video" : "audio");
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (v: number | null) => { if (settled) return; settled = true; URL.revokeObjectURL(url); resolve(v); };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    el.src = url;
  });
}

/** Uploads files into the character's private library. Returns the new rows, newest first. */
export async function uploadMedia(projectId: string, files: File[], onProgress?: (text: string) => void) {
  files = files.slice(0, 20);
  const bad = files.map((f) => checkMediaFile(f)).find(Boolean);
  if (bad) throw new Error(bad);
  const supabase = createClient();
  const added: StudioMedia[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.(`Uploading ${i + 1} of ${files.length}…`);
    const kind = kindOfMime(f.type)!;
    const path = `${projectId}/${crypto.randomUUID()}.${extFor(f.type, kind)}`;
    const duration_ms = await measure(f);
    const { error: upErr } = await supabase.storage.from("studio-media").upload(path, f, { contentType: f.type, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data, error } = await supabase.from("studio_media")
      .insert({ project_id: projectId, kind, path, mime: f.type, bytes: f.size, duration_ms, label: f.name.replace(/\.[^.]+$/, "").slice(0, 120) })
      .select(MEDIA_COLUMNS).single();
    if (error) {
      await supabase.storage.from("studio-media").remove([path]);
      throw new Error(error.message);
    }
    added.push(data as StudioMedia);
  }
  return added.reverse();
}

export async function removeMedia(m: StudioMedia) {
  const supabase = createClient();
  const { error } = await supabase.from("studio_media").delete().eq("id", m.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from("studio-media").remove([m.path]);
}

export async function renameMedia(id: string, label: string) {
  const { error } = await createClient().from("studio_media").update({ label: label.slice(0, 120) || null }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function saveDuration(id: string, ms: number) {
  await createClient().from("studio_media").update({ duration_ms: ms }).eq("id", id);
}

/** Copies a private library image into the public character pictures bucket. */
async function toPublicImage(url: string, label: string) {
  const blob = await (await fetch(url)).blob();
  const type = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(blob.type) ? blob.type : "image/png";
  const file = new File([blob], `${label || "studio-image"}.${extFor(type, "image")}`, { type });
  return uploadCharacterImage(file);
}

export async function copyToAssets(projectId: string, url: string, label: string) {
  const publicUrl = await toPublicImage(url, label);
  const { data, error } = await createClient().from("character_assets")
    .insert({ project_id: projectId, kind: "reference", label: (label || "From AI Studio").slice(0, 80), url: publicUrl })
    .select("id, url, label").single();
  if (error) throw new Error(error.message);
  return data as { id: string; url: string; label: string | null };
}

export async function makeCharacterPicture(projectId: string, url: string, label: string) {
  const publicUrl = await toPublicImage(url, label);
  const { error } = await createClient().from("projects").update({ image_url: publicUrl, kind: "Custom" }).eq("id", projectId);
  if (error) throw new Error(error.message);
  return publicUrl;
}

/** Saves a file with a sensible name (works for cross-origin signed URLs). */
export async function downloadFile(url: string, name: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export const fileName = (m: StudioMedia) =>
  `${(m.label || m.kind).replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || m.kind}.${m.path.split(".").pop()}`;
