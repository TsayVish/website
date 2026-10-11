"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Unblock a member from the Audience → Blocked list. */
export function UnblockButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button" className="btn ghost st-small" disabled={busy}
      onClick={async () => {
        setBusy(true);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("blocks").delete().eq("blocker_id", user?.id ?? "").eq("blocked_id", userId);
        router.refresh();
      }}
    >
      {busy ? "Unblocking…" : "Unblock"}
    </button>
  );
}

/** Resolve or dismiss a report about your content. */
export function ReportActions({ reportId, status }: { reportId: string; status: "open" | "resolved" | "dismissed" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function set(next: "open" | "resolved" | "dismissed") {
    setBusy(true);
    setError("");
    const { error: err } = await createClient().rpc("set_report_status", { report: reportId, new_status: next });
    setBusy(false);
    if (err) return setError(err.message);
    router.refresh();
  }
  return (
    <span className="hub-row-actions">
      {status === "open" ? (
        <>
          <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => set("resolved")}>Mark resolved</button>
          <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => set("dismissed")}>Dismiss</button>
        </>
      ) : (
        <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => set("open")}>Reopen</button>
      )}
      {error && <small className="form-error">{error}</small>}
    </span>
  );
}
