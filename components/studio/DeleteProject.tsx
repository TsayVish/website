"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Two-step delete: the first click asks, the second deletes. */
export function DeleteProject({ projectId, label }: { projectId: string; label: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    const { error: err } = await createClient().from("projects").delete().eq("id", projectId);
    if (err) {
      setError(`Couldn’t delete: ${err.message}`);
      setBusy(false);
      return;
    }
    router.push("/studio");
    router.refresh();
  }

  return (
    <div className="st-danger">
      {!asking ? (
        <button type="button" className="st-linkdanger" onClick={() => setAsking(true)}>{label}</button>
      ) : (
        <div className="st-confirm" role="group" aria-label="Confirm delete">
          <span>This can’t be undone.</span>
          <button type="button" className="btn st-small st-btn-danger" onClick={remove} disabled={busy}>
            {busy ? "Deleting…" : "Yes, delete it"}
          </button>
          <button type="button" className="btn ghost st-small" onClick={() => setAsking(false)} disabled={busy}>Keep it</button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
