"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="st-actions">
      <button className="btn" type="button" disabled={busy} onClick={async () => {
        setBusy(true);
        setError("");
        const { data, error: err } = await createClient().rpc("accept_workspace_invite", { invite_token: token });
        if (err) {
          setBusy(false);
          return setError(err.message);
        }
        router.push(`/studio/hub/characters?ws=${data as string}`);
        router.refresh();
      }}>{busy ? "Joining…" : "Join workspace"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
