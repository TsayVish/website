import type { NextRequest } from "next/server";
import { cancelGeneration, publicJob, refreshGeneration } from "@/lib/studio/server";
import { studioEnv, withStudio } from "@/lib/studio/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// Checks on a job; when it's finished, saves the result into the character's library.
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withStudio(async (db) => {
    const { job, queuePosition } = await refreshGeneration(db, studioEnv(), id);
    return { job: publicJob(job as Record<string, unknown>), queuePosition };
  });
}

// Stops a job that hasn't finished.
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withStudio(async (db) => ({ job: publicJob((await cancelGeneration(db, studioEnv(), id)) as Record<string, unknown>) }));
}
