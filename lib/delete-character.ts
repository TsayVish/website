"use client";

import { createClient } from "@/lib/supabase/client";

const chunks = <T,>(list: T[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/**
 * Deletes a character and everything made for it: AI Studio files, scripts, jobs,
 * assets and services. Listings that used it stay up (they keep a copy of its details).
 */
export async function deleteCharacter(projectId: string) {
  const supabase = createClient();
  // Files in storage aren't removed by the database, so clear them first (best effort).
  const [{ data: media }, { data: assets }, { data: project }, { data: { user } }] = await Promise.all([
    supabase.from("studio_media").select("path").eq("project_id", projectId),
    supabase.from("character_assets").select("url").eq("project_id", projectId),
    supabase.from("projects").select("image_url").eq("id", projectId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const studioPaths = ((media ?? []) as { path: string }[]).map((m) => m.path);
  for (const part of chunks(studioPaths, 100)) await supabase.storage.from("studio-media").remove(part);
  const marker = "/storage/v1/object/public/character-images/";
  const pictures = [...((assets ?? []) as { url: string }[]).map((a) => a.url), (project as { image_url: string | null } | null)?.image_url ?? ""]
    .filter((u) => u.includes(marker))
    .map((u) => decodeURIComponent(u.split(marker)[1].split("?")[0]))
    .filter((p) => user && p.startsWith(`${user.id}/`));
  for (const part of chunks(pictures, 100)) await supabase.storage.from("character-images").remove(part);

  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
}
