import { NextResponse, type NextRequest } from "next/server";
import { bearerOk, socialEnv } from "@/lib/social/secure";
import { runPublisher } from "@/lib/social/worker";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The scheduled publisher. Call it every minute with "Authorization: Bearer <CRON_SECRET>"
// (Vercel Cron sends that header itself; see the README for a Supabase pg_cron schedule).
async function run(request: NextRequest) {
  const env = socialEnv();
  if (!bearerOk(request.headers.get("authorization"), env.cronSecret)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const handled = await runPublisher(createPublicClient(), env, { limit: 5, budgetMs: 240_000 });
    return NextResponse.json({ handled });
  } catch (e) {
    console.error("[social] run", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
