import type { NextRequest } from "next/server";
import { SocialError, socialEnv } from "@/lib/social/secure";
import { accountForEditor, choosePage, pagesOf, tiktokCreator, withSocial } from "@/lib/social/server";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Details the composer needs: Facebook Pages to choose from, or TikTok's posting options for this creator.
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withSocial(async (db) => {
    const env = socialEnv();
    const pub = createPublicClient();
    const row = await accountForEditor(db, pub, env, id);
    if (row.platform === "facebook") return { pages: pagesOf(env, row).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar })), current: row.external_id };
    if (row.platform === "tiktok") return { tiktok: await tiktokCreator(pub, env, row) };
    return {};
  });
}

// Facebook: post to a different Page from the same sign-in.
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withSocial(async (db) => {
    const env = socialEnv();
    const pub = createPublicClient();
    const body = (await request.json().catch(() => ({}))) as { pageId?: string };
    const row = await accountForEditor(db, pub, env, id);
    if (row.platform !== "facebook") throw new SocialError("Only Facebook has Pages to choose from.");
    return { page: await choosePage(pub, env, row, String(body.pageId ?? "")) };
  });
}
