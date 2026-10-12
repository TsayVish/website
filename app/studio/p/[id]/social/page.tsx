import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SocialStudio } from "@/components/studio/social/SocialStudio";
import { PLATFORMS, type Platform } from "@/lib/social/platforms";
import { platformReady, socialEnv } from "@/lib/social/secure";
import {
  ACCOUNT_COLUMNS, POST_COLUMNS, TARGET_COLUMNS,
  type PostableMedia, type SocialAccount, type SocialPost, type SocialTarget,
} from "@/lib/social/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Social" };

export default async function SocialPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ connected?: string; social_error?: string; media?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id, name, type, owner_id").eq("id", id).maybeSingle();
  if (!project || project.type !== "original") notFound();
  const { data: { user } } = await supabase.auth.getUser();

  const [access, accounts, posts, media] = await Promise.all([
    supabase.rpc("can_edit_project", { pid: id }),
    supabase.from("social_accounts").select(ACCOUNT_COLUMNS).eq("project_id", id),
    supabase.from("social_posts").select(POST_COLUMNS).eq("project_id", id).order("scheduled_at", { ascending: false }).limit(60),
    supabase.from("studio_media").select("id, kind, label, path, mime, duration_ms").eq("project_id", id).in("kind", ["image", "video"])
      .order("created_at", { ascending: false }).limit(120),
  ]);
  const postRows = (posts.data ?? []) as SocialPost[];
  const { data: targets } = postRows.length
    ? await supabase.from("social_post_targets").select(TARGET_COLUMNS).in("post_id", postRows.map((p) => p.id))
    : { data: [] };
  const mediaRows = (media.data ?? []) as { id: string; kind: "image" | "video"; label: string | null; path: string; mime: string | null; duration_ms: number | null }[];
  const { data: signed } = mediaRows.length
    ? await supabase.storage.from("studio-media").createSignedUrls(mediaRows.map((m) => m.path), 60 * 60 * 6)
    : { data: [] };
  const urlOf = new Map(((signed ?? []) as { path: string | null; signedUrl: string | null }[]).map((s) => [s.path, s.signedUrl]));
  const library: PostableMedia[] = mediaRows.map((m) => ({ id: m.id, kind: m.kind, label: m.label, mime: m.mime, duration_ms: m.duration_ms, url: urlOf.get(m.path) ?? null }));

  const env = socialEnv();
  const ready = Object.fromEntries(PLATFORMS.map((p) => [p, platformReady(env, p)])) as Record<Platform, boolean>;
  const setupProblem = accounts.error || posts.error;
  if (setupProblem) console.error("[social] setup", setupProblem);

  return (
    <div className="st-stack so-page">
      <div className="st-crumbs">
        <Link href="/studio/hub/characters">Characters</Link><span>/</span>
        <Link href={`/studio/p/${project.id}`}>{project.name}</Link><span>/</span><span>Social</span>
      </div>
      <div className="st-pagehead">
        <div>
          <h1>Social</h1>
          <p className="st-sub">Connect {project.name}’s accounts, then post pictures and videos from the AI Studio library now or on a schedule.</p>
        </div>
        <div className="st-actions"><Link className="btn ghost st-small" href={`/studio/p/${project.id}/ai`}>Open AI Studio</Link></div>
      </div>
      {setupProblem && (
        <p className="ai-off" role="alert">
          Social posting isn’t set up in the database yet. Run the latest <code>supabase/schema.sql</code> in Supabase’s SQL Editor, then reload.
        </p>
      )}
      <SocialStudio
        project={{ id: project.id, name: project.name }}
        canEdit={project.owner_id === user?.id || access.data === true}
        ready={ready}
        accounts={(accounts.data ?? []) as SocialAccount[]}
        posts={postRows}
        targets={(targets ?? []) as SocialTarget[]}
        library={library}
        flash={{ connected: sp.connected ?? null, error: sp.social_error ?? null }}
        preselect={sp.media ?? null}
      />
    </div>
  );
}
