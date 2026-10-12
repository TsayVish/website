"use client";

import { createClient } from "@/lib/supabase/client";
import { newSceneId, readScenes, SCRIPT_COLUMNS, type StudioScript } from "@/lib/studio/types";
import type { ScriptResult, TaskName } from "./tasks";

export type AIUsage = { provider: string; model: string; ownKey: boolean; chargedCents: number };

/** Runs one AI writing tool. Throws with a readable message. */
export async function aiWrite<T>(task: TaskName, projectId: string, input: Record<string, unknown>): Promise<{ result: T; usage: AIUsage }> {
  const res = await fetch("/api/ai/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, projectId, input }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "The AI tools aren’t available right now.");
  return body as { result: T; usage: AIUsage };
}

export const usageNote = (u: AIUsage) =>
  u.ownKey ? `Written with your ${u.provider === "openai" ? "OpenAI" : "Claude"} key` : u.chargedCents ? `Used $${(u.chargedCents / 100).toFixed(2)} of credits` : "Free";

/** Saves an AI-written script into the character's AI Studio episodes. */
export async function saveScript(projectId: string, s: ScriptResult) {
  const { data, error } = await createClient().from("studio_scripts")
    .insert({ project_id: projectId, title: s.title.slice(0, 120), scenes: s.scenes.map((x) => ({ id: newSceneId(), shot: x.shot, line: x.line })) })
    .select(SCRIPT_COLUMNS).single();
  if (error) throw new Error(error.message);
  return { ...(data as StudioScript), scenes: readScenes((data as StudioScript).scenes) };
}
