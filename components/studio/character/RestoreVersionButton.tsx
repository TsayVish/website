"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function RestoreVersionButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!asking) return <button type="button" className="btn ghost st-small" onClick={() => setAsking(true)}>Restore</button>;
  return (
    <span className="rp-inline">
      <span>Restore this version?</span>
      <button type="button" className="btn st-small" disabled={busy} onClick={async () => {
        setBusy(true);
        const { error: err } = await createClient().rpc("restore_character_version", { version: versionId });
        setBusy(false);
        if (err) return setError(err.message);
        setAsking(false);
        router.refresh();
      }}>{busy ? "Restoring…" : "Restore"}</button>
      <button type="button" className="rp-link" onClick={() => setAsking(false)}>Cancel</button>
      {error && <small className="form-error">{error}</small>}
    </span>
  );
}
