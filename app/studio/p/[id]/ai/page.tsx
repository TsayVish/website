import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AIStudio } from "@/components/studio/ai/AIStudio";
import type { CharacterImage } from "@/components/studio/ai/MediaLibrary";
import { ASSET_COLUMNS, type CharacterAsset } from "@/lib/characters";
import { studioConfigured } from "@/lib/studio/server";
import { studioEnv } from "@/lib/studio/route-helpers";
import {
  GENERATION_LIST_COLUMNS, MEDIA_COLUMNS, SCRIPT_COLUMNS,
  type StudioGeneration, type StudioMedia, type StudioScript,
} from "@/lib/studio/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI Studio" };

export default async function AIStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id, name, type, image_url").eq("id", id).maybeSingle();
  if (!project || project.type !== "original") notFound();

  const [{ data: canEdit }, media, assets, scripts, gens, usage] = await Promise.all([
    supabase.rpc("can_edit_project", { pid: id }),
    supabase.from("studio_media").select(MEDIA_COLUMNS).eq("project_id", id).order("created_at", { ascending: false }).limit(300),
    supabase.from("character_assets").select(ASSET_COLUMNS).eq("project_id", id).order("created_at", { ascending: false }).limit(60),
    supabase.from("studio_scripts").select(SCRIPT_COLUMNS).eq("project_id", id).order("updated_at", { ascending: false }),
    supabase.from("studio_generations").select(GENERATION_LIST_COLUMNS).eq("project_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.rpc("studio_usage"),
  ]);
  const u = (Array.isArray(usage.data) ? usage.data[0] : usage.data) as { used_cents: number; limit_cents: number } | null;

  const characterImages: CharacterImage[] = [
    ...(project.image_url ? [{ key: `character:${project.id}`, url: project.image_url as string, label: "Character picture" }] : []),
    ...((assets.data ?? []) as CharacterAsset[]).map((a) => ({ key: `asset:${a.id}`, url: a.url, label: a.label || "Asset" })),
  ];

  return (
    <div className="st-stack ai-page">
      <div className="st-crumbs">
        <Link href="/studio/hub/characters">Characters</Link><span>/</span>
        <Link href={`/studio/p/${project.id}`}>{project.name}</Link><span>/</span><span>AI Studio</span>
      </div>
      <div className="st-pagehead">
        <div>
          <h1>AI Studio</h1>
          <p className="st-sub">Make pictures, voice lines and video clips of {project.name}, then cut them into episodes.</p>
        </div>
      </div>
      <AIStudio
        project={{ id: project.id, name: project.name }}
        canEdit={canEdit === true}
        configured={studioConfigured(studioEnv())}
        characterImages={characterImages}
        media={(media.data ?? []) as StudioMedia[]}
        scripts={(scripts.data ?? []) as StudioScript[]}
        generations={(gens.data ?? []) as StudioGeneration[]}
        usage={{ used: u?.used_cents ?? 0, limit: u?.limit_cents ?? 1000 }}
      />
    </div>
  );
}
