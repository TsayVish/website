import { NextResponse, type NextRequest } from "next/server";
import { AIError } from "@/lib/ai/providers";
import { aiEnv, runTask, type RunBody } from "@/lib/ai/run";
import { SocialError, socialEnv } from "@/lib/social/secure";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Runs one of the AI writing tools (captions, ideas, plans, scripts, character bible, rewrite).
export async function POST(request: NextRequest) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "You’ve been logged out. Log in again." }, { status: 401 });
    const body = (await request.json().catch(() => null)) as RunBody;
    return NextResponse.json(await runTask(db, createPublicClient(), aiEnv(socialEnv()), user.id, body), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const known = e instanceof AIError || e instanceof SocialError;
    if (!known) console.error("[ai] write", e);
    return NextResponse.json({ error: known ? e.message : "Something went wrong. Try again." }, { status: known ? e.status : 500 });
  }
}
