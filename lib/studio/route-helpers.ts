import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { StudioError, type StudioEnv } from "./server";

/** Server-only settings. FAL_KEY must never be a NEXT_PUBLIC_ variable. */
export function studioEnv(): StudioEnv {
  return { falKey: process.env.FAL_KEY || undefined };
}

/** Runs a handler with the signed-in person's Supabase client and turns errors into JSON. */
export async function withStudio(handler: (db: Awaited<ReturnType<typeof createClient>>) => Promise<unknown>) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "You’ve been logged out. Log in again." }, { status: 401 });
    const result = await handler(db);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof StudioError ? e.status : 500;
    const text = e instanceof StudioError ? e.message : "Something went wrong. Try again.";
    if (!(e instanceof StudioError)) console.error("[studio]", e);
    return NextResponse.json({ error: text }, { status });
  }
}
