import type { Metadata } from "next";
import Link from "next/link";
import { NewCharacter } from "@/components/studio/NewCharacter";
import { createClient } from "@/lib/supabase/server";
import { editableWorkspaces } from "@/lib/workspaces-server";

export const metadata: Metadata = { title: "New character" };

export default async function HubNewCharacterPage({ searchParams }: { searchParams: Promise<{ mode?: string; ws?: string }> }) {
  const { mode, ws } = await searchParams;
  const editable = await editableWorkspaces(await createClient());
  return (
    <div className="st-stack">
      <div className="st-hello">
        <div className="st-crumbs"><Link href="/studio/hub/characters">Characters</Link><span>/</span><span>New</span></div>
        <h1>Add a character</h1>
      </div>
      <NewCharacter editable={editable} workspace={ws ?? null} upload={mode === "upload"} base="/studio/hub/characters/new" />
    </div>
  );
}
