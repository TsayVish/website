import type { NextRequest } from "next/server";
import { startGeneration, refreshGeneration, publicJob, type GenerateBody } from "@/lib/studio/server";
import { studioEnv, withStudio } from "@/lib/studio/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Starts an AI Studio job for a character and returns it.
export async function POST(request: NextRequest) {
  return withStudio(async (db) => {
    const body = (await request.json().catch(() => null)) as GenerateBody | null;
    const env = studioEnv();
    const id = await startGeneration(db, env, body as GenerateBody);
    const { job } = await refreshGeneration(db, env, id).catch(() => ({ job: null }));
    return { id, job: job ? publicJob(job as Record<string, unknown>) : null };
  });
}
