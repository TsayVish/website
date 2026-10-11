"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Share a character with a workspace, or take it back. Only its creator can move it. */
export function MoveToWorkspace({ projectId, current, workspaces }: { projectId: string; current: string | null; workspaces: { id: string; name: string }[] }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save(next: string) {
    setValue(next);
    setBusy(true);
    setMsg("");
    const { error } = await createClient().from("projects").update({ workspace_id: next || null }).eq("id", projectId);
    setBusy(false);
    if (error) {
      setValue(current ?? "");
      return setMsg(error.message);
    }
    setMsg(next ? "Shared with the workspace." : "Now private to you.");
    router.refresh();
  }
  return (
    <div className="field">
      <label htmlFor="mv-ws">Workspace</label>
      <select id="mv-ws" className="st-input" value={value} disabled={busy} onChange={(e) => save(e.target.value)}>
        <option value="">Just me</option>
        {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      {msg && <small className="st-help" role="status">{msg}</small>}
    </div>
  );
}
