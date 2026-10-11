import type { Metadata } from "next";
import Link from "next/link";
import { CsvImport } from "@/components/studio/character/CsvImport";
import { createClient } from "@/lib/supabase/server";
import { editableWorkspaces } from "@/lib/workspaces-server";

export const metadata: Metadata = { title: "Import characters" };

export default async function ImportCharactersPage() {
  const supabase = await createClient();
  // Only workspaces you can add to (owner or editor).
  const editable = await editableWorkspaces(supabase);
  return (
    <div className="st-stack">
      <div className="st-hello">
        <div className="st-crumbs"><Link href="/studio/hub/characters">Characters</Link><span>/</span><span>Import</span></div>
        <h1>Import characters</h1>
        <p className="st-sub">Bring a whole roster in at once from a spreadsheet. You can add pictures, assets and style guides afterwards.</p>
      </div>
      <CsvImport workspaces={editable} />
    </div>
  );
}
