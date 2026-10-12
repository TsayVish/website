"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteCharacter } from "@/lib/delete-character";

/** Two-step delete: the first click asks, the second deletes. */
export function DeleteProject({ projectId, label, name, compact = false, after = "/studio/hub/characters", message }: {
  projectId: string;
  message?: string;
  label: string;
  name?: string;
  compact?: boolean;
  /** Where to go afterwards; null stays on the page and refreshes it. */
  after?: string | null;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await deleteCharacter(projectId);
    } catch (e) {
      setError(`Couldn’t delete: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
      return;
    }
    if (after) router.push(after);
    router.refresh();
  }

  if (compact && !asking) {
    return <button type="button" className="btn ghost st-small st-del-btn" onClick={() => setAsking(true)}>{label}</button>;
  }

  return (
    <div className={compact ? "st-danger st-danger-inline" : "st-danger"}>
      {!asking ? (
        <button type="button" className="st-linkdanger" onClick={() => setAsking(true)}>{label}</button>
      ) : (
        <div className="st-confirm" role="group" aria-label="Confirm delete">
          <span>{message ?? (compact ? `Delete ${name ?? "this"} and everything made for it?` : "This deletes the character and everything made for it in the AI Studio. It can’t be undone.")}</span>
          <button type="button" className="btn st-small st-btn-danger" onClick={remove} disabled={busy}>
            {busy ? "Deleting…" : "Yes, delete"}
          </button>
          <button type="button" className="btn ghost st-small" onClick={() => setAsking(false)} disabled={busy}>Keep it</button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
