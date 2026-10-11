"use client";

import { useState } from "react";
import { CharacterBuilder } from "@/components/CharacterBuilder";
import { UploadCharacterForm } from "@/components/studio/UploadCharacterForm";

/** The create/upload form, plus where the new character lives (just you, or a workspace). */
export function NewCharacterForms({ upload, workspaces, defaultWorkspace }: { upload: boolean; workspaces: { id: string; name: string }[]; defaultWorkspace?: string | null }) {
  const [ws, setWs] = useState(defaultWorkspace && workspaces.some((w) => w.id === defaultWorkspace) ? defaultWorkspace : "");
  return (
    <>
      {workspaces.length > 0 && (
        <div className="nc-ws">
          <label htmlFor="nc-ws">Add to</label>
          <select id="nc-ws" className="st-input" value={ws} onChange={(e) => setWs(e.target.value)}>
            <option value="">Just me</option>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      )}
      {upload ? <UploadCharacterForm workspaceId={ws || null} /> : <CharacterBuilder mode="save" workspaceId={ws || null} />}
    </>
  );
}
