"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Block or unblock a member. Blocked members can't message you. Asks once before blocking. */
export function BlockButton({ userId, initialBlocked, name }: { userId: string; initialBlocked: boolean; name: string }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply(next: boolean) {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const me = (await supabase.auth.getUser()).data.user?.id ?? "";
    const { error: err } = next
      ? await supabase.from("blocks").insert({ blocked_id: userId })
      : await supabase.from("blocks").delete().eq("blocker_id", me).eq("blocked_id", userId);
    setBusy(false);
    setAsking(false);
    if (err) return setError(err.message);
    setBlocked(next);
    router.refresh();
  }

  if (blocked)
    return (
      <span className="rp-inline">
        <span className="st-muted">You’ve blocked {name}.</span>
        <button type="button" className="rp-link" onClick={() => apply(false)} disabled={busy}>Unblock</button>
        {error && <small className="form-error">{error}</small>}
      </span>
    );
  if (asking)
    return (
      <span className="rp-inline">
        <span>Block {name}? They won’t be able to message you.</span>
        <button type="button" className="rp-link rp-danger" onClick={() => apply(true)} disabled={busy}>{busy ? "Blocking…" : "Block"}</button>
        <button type="button" className="rp-link" onClick={() => setAsking(false)}>Cancel</button>
        {error && <small className="form-error">{error}</small>}
      </span>
    );
  return <button type="button" className="rp-link" onClick={() => setAsking(true)}>Block</button>;
}
