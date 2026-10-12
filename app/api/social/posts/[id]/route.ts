import type { NextRequest } from "next/server";
import { SocialError, socialEnv } from "@/lib/social/secure";
import { withSocial } from "@/lib/social/server";
import { runPublisher } from "@/lib/social/worker";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// Moves a post along (used while the Social page is open), then returns its deliveries.
export async function POST(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withSocial(async (db) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new SocialError("Post not found.", { status: 404 });
    const { data: post } = await db.from("social_posts").select("id, status").eq("id", id).maybeSingle();
    if (!post) throw new SocialError("Post not found.", { status: 404 });
    if (post.status === "scheduled" || post.status === "publishing") {
      await runPublisher(createPublicClient(), socialEnv(), { postId: id, budgetMs: 120_000 }).catch((e) => console.error("[social] nudge", e));
    }
    const [{ data: fresh }, { data: targets }] = await Promise.all([
      db.from("social_posts").select("id, status").eq("id", id).maybeSingle(),
      db.from("social_post_targets").select("id, post_id, platform, account_name, status, external_url, error, posted_at").eq("post_id", id),
    ]);
    return { post: fresh, targets: targets ?? [] };
  });
}
