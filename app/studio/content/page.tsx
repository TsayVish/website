import type { Metadata } from "next";
import { ContentManager } from "@/components/studio/content/ContentManager";
import { CONTENT_COLUMNS, type CalendarPost, type Character, type ContentItem } from "@/lib/content-items";
import { myProjectsFilter } from "@/lib/mine";
import type { Platform } from "@/lib/social/platforms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Content" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ c?: string; view?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id ?? "";
  const { data: projects } = await supabase.from("projects").select("id, name, image_url, owner_id")
    .eq("type", "original").or(await myProjectsFilter(supabase, uid)).order("name");
  const list = (projects ?? []) as { id: string; name: string; image_url: string | null; owner_id: string }[];
  const ids = list.map((p) => p.id);
  const since = new Date(Date.now() - 120 * 864e5).toISOString();

  const [edits, items, posts, keys] = await Promise.all([
    Promise.all(list.map((p) => (p.owner_id === uid ? Promise.resolve({ data: true }) : supabase.rpc("can_edit_project", { pid: p.id })))),
    ids.length ? supabase.from("content_items").select(CONTENT_COLUMNS).in("project_id", ids).order("position").limit(2000) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("social_posts").select("id, project_id, caption, title, scheduled_at, status").in("project_id", ids).gte("scheduled_at", since).limit(500) : Promise.resolve({ data: [] }),
    supabase.from("ai_keys").select("provider"),
  ]);
  const postRows = (posts.data ?? []) as Omit<CalendarPost, "platforms">[];
  const { data: targets } = postRows.length
    ? await supabase.from("social_post_targets").select("post_id, platform").in("post_id", postRows.map((p) => p.id))
    : { data: [] };
  const platformsOf = (id: string) => ((targets ?? []) as { post_id: string; platform: Platform }[]).filter((t) => t.post_id === id).map((t) => t.platform);
  const characters: Character[] = list.map((p, i) => ({ id: p.id, name: p.name, image_url: p.image_url, canEdit: edits[i]?.data === true }));

  return (
    <div className="st-stack cm-page">
      <div className="st-pagehead">
        <div>
          <h1>Content</h1>
          <p className="st-sub">Plan, write and schedule everything your characters post. Ideas move to drafts, then onto the calendar and out through Social.</p>
        </div>
      </div>
      {"error" in items && items.error && (
        <p className="ai-off" role="alert">The content manager isn’t set up in the database yet. Run the latest <code>supabase/schema.sql</code>, then reload.</p>
      )}
      <ContentManager
        characters={characters}
        items={(items.data ?? []) as ContentItem[]}
        posts={postRows.map((p) => ({ ...p, platforms: platformsOf(p.id) }))}
        aiReady={((keys.data ?? []) as unknown[]).length > 0 || Boolean(process.env.ANTHROPIC_API_KEY)}
        initialCharacter={characters.some((c) => c.id === sp.c) ? sp.c! : "all"}
        initialView={sp.view === "calendar" ? "calendar" : "board"}
      />
    </div>
  );
}
