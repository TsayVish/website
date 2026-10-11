"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button type="button" className="btn ghost st-small" onClick={signOut} disabled={busy}>
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
