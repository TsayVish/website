import type { NextRequest } from "next/server";
import { SocialError, socialEnv } from "@/lib/social/secure";
import { createPost, withSocial, type CreatePostBody } from "@/lib/social/server";
import { runPublisher } from "@/lib/social/worker";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Saves a post. If it's due now, starts sending it straight away.
export async function POST(request: NextRequest) {
  return withSocial(async (db) => {
    const env = socialEnv();
    if (!env.dbSecret || !env.tokenKey) throw new SocialError("Social posting isn’t set up yet.", { status: 503 });
    const body = (await request.json().catch(() => null)) as CreatePostBody;
    const { id, now } = await createPost(db, body);
    if (now) await runPublisher(createPublicClient(), env, { postId: id, budgetMs: 200_000 }).catch((e) => console.error("[social] post now", e));
    return { id };
  });
}
