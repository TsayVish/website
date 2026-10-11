import type { Metadata } from "next";
import Link from "next/link";
import { PostEditor } from "@/components/studio/hub/PostEditor";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New post" };

export default async function NewPostPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id, name").order("created_at", { ascending: false });
  return (
    <div className="st-stack">
      <div className="st-hello">
        <div className="st-crumbs"><Link href="/studio/hub/library">Library</Link><span>/</span><span>New post</span></div>
        <h1>Create a post</h1>
      </div>
      <PostEditor projects={(data ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
