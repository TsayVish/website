"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Opens (or starts) a one-to-one chat with another member. */
export function MessageButton({ userId, label = "Message", className = "btn" }: { userId: string; label?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    const { data, error: err } = await createClient().rpc("start_conversation", { other: userId });
    if (err || !data) {
      setBusy(false);
      return setError(err?.message ?? "Couldn’t open the chat.");
    }
    router.push(`/studio/messages/${data as string}`);
  }

  return (
    <span className="msg-btn-wrap">
      <button type="button" className={className} onClick={start} disabled={busy}>{busy ? "Opening…" : label}</button>
      {error && <small className="form-error" role="alert">{error}</small>}
    </span>
  );
}
