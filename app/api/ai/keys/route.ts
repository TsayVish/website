import { NextResponse, type NextRequest } from "next/server";
import { AIError, type AIProvider } from "@/lib/ai/providers";
import { aiEnv, modelsFor, saveKey } from "@/lib/ai/run";
import { socialEnv } from "@/lib/social/secure";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(fn: (db: Awaited<ReturnType<typeof createClient>>, uid: string) => Promise<unknown>) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "You’ve been logged out. Log in again." }, { status: 401 });
    return NextResponse.json(await fn(db, user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const known = e instanceof AIError;
    if (!known) console.error("[ai] keys", e);
    return NextResponse.json({ error: known ? e.message : "Something went wrong. Try again." }, { status: known ? e.status : 500 });
  }
}

// Checks a Claude or OpenAI API key with the provider, then saves it encrypted.
export async function POST(request: NextRequest) {
  return handle(async (db) => {
    const body = (await request.json().catch(() => ({}))) as { provider?: AIProvider; key?: string };
    return saveKey(db, aiEnv(socialEnv()), body.provider as AIProvider, body.key ?? "");
  });
}

// Lists the models one of your saved keys can use.
export async function GET(request: NextRequest) {
  return handle(async (_db, uid) => {
    const provider = request.nextUrl.searchParams.get("provider") as AIProvider;
    if (provider !== "anthropic" && provider !== "openai") throw new AIError("Unknown provider.");
    return { models: (await modelsFor(createPublicClient(), aiEnv(socialEnv()), uid, provider)).slice(0, 40) };
  });
}
