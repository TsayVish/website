import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostEditor } from "@/components/studio/hub/PostEditor";
import { POST_COLUMNS, type Post } from "@/lib/hub";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data }, { data: projects }] = await Promise.all([
    supabase.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("projects").select("id, name").order("created_at", { ascending: false }),
  ]);
  const post = data as Post | null;
  if (!post || post.owner_id !== user!.id) notFound();
  return (
    <div className="st-stack">
      <div className="st-hello">
        <div className="st-crumbs"><Link href="/studio/hub/library">Library</Link><span>/</span><span>{post.status === "draft" ? "Draft" : "Post"}</span></div>
        <h1>Edit post</h1>
      </div>
      <PostEditor initial={post} projects={(projects ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
